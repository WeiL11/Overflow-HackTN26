import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeFoodPhoto, resizeImage } from './foodPhoto';

const { invoke, getSession } = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession }, functions: { invoke } } }));
beforeEach(() => { vi.stubGlobal('AbortSignal', { timeout: () => undefined }); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('merged food analysis', () => {
  it('preserves the existing autofill service and its suggestions', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'test' } } });
    const suggestion = { isFood: true, foodName: 'Bread', quantity: 4, shelfLifeHours: 12, description: 'Bread rolls', model: 'existing' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => suggestion }));
    expect(await analyzeFoodPhoto('data:image/jpeg;base64,test')).toMatchObject({ ...suggestion, shelfLifeHours: null, keywords: ['bread'], llm_query: { task: 'food_donation_follow_up' } });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falls back to Supabase without inventing quantity or expiry', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'test' } } });
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ blob: async () => new Blob(['image'], { type: 'image/jpeg' }) });
    vi.stubGlobal('fetch', fetchMock);
    invoke.mockResolvedValue({ data: { analysis: { contains_food: true, food_name: 'Bread', description: 'Bread rolls' } }, error: null });
    const result = await analyzeFoodPhoto('data:image/jpeg;base64,test');
    expect(result).toMatchObject({
      isFood: true,
      foodName: 'Bread',
      quantity: null,
      shelfLifeHours: null,
      keywords: ['bread'],
      llm_query: { schema_version: 1, task: 'food_donation_follow_up' },
    });
    expect(invoke).toHaveBeenCalledWith('analyze-food', { body: expect.any(FormData) });
  });
});

it('rejects oversized and unsupported photos before decoding', async () => {
  await expect(resizeImage(new File(['x'], 'food.svg', { type: 'image/svg+xml' }))).rejects.toThrow('JPEG');
  await expect(resizeImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'food.jpg', { type: 'image/jpeg' }))).rejects.toThrow('5 MB');
});

it('reports backend configuration errors rather than pretending analysis succeeded', async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob(['image']) }));
  invoke.mockResolvedValue({ error: { context: new Response(JSON.stringify({ error: 'Food analysis is not configured.' }), { status: 503 }) } });
  await expect(analyzeFoodPhoto('data:image/jpeg;base64,test')).rejects.toThrow('not configured');
});

it('captures original metadata before resizing and records the stored JPEG separately', async () => {
  const { prepareFoodPhoto } = await import('./foodPhoto');
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2048, height: 1024, close }));
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: () => 'data:image/jpeg;base64,test' };
  const create = vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob(['jpeg-bytes'], { type: 'image/jpeg' }) }));
  try {
    const result = await prepareFoodPhoto(new File(['original-png'], 'apples.png', { type: 'image/png' }));
    expect(result.metadata).toMatchObject({ original_name: 'apples.png', original_type: 'image/png', original_bytes: 12, original_width: 2048, original_height: 1024, stored_width: 1024, stored_height: 512, stored_type: 'image/jpeg', stored_bytes: 10 });
    expect(result.file.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalledOnce();
  } finally { create.mockRestore(); }
});
