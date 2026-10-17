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
    expect(await analyzeFoodPhoto('data:image/jpeg;base64,test')).toEqual({ ...suggestion, shelfLifeHours: null });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falls back to Supabase without inventing quantity or expiry', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'test' } } });
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ blob: async () => new Blob(['image'], { type: 'image/jpeg' }) });
    vi.stubGlobal('fetch', fetchMock);
    invoke.mockResolvedValue({ data: { analysis: { contains_food: true, food_name: 'Bread', description: 'Bread rolls' } }, error: null });
    const result = await analyzeFoodPhoto('data:image/jpeg;base64,test');
    expect(result).toMatchObject({ isFood: true, foodName: 'Bread', quantity: null, shelfLifeHours: null });
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
