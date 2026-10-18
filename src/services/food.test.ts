import { afterEach, expect, it, vi } from 'vitest';
import { createFoodListing } from './food';
const { insert, upload, remove } = vi.hoisted(() => ({ insert: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ insert }),
  storage: { from: () => ({ upload, remove }) },
} }));
afterEach(() => vi.clearAllMocks());
const input = {
  donor_id: 'donor', food_name: 'Apples', quantity: 2, location: 'Kitchen',
  latitude: 36.16, longitude: -86.78,
  expiry_time: '2027-01-01T12:00:00Z', notes: 'Bring a bag',
  food_analysis: { description: 'Two apples' },
  photo_metadata: { original_name: 'apples.png', original_width: 2048, stored_width: 1024 },
};
it('preserves coordinates, listing notes, analysis, and image metadata through the shared upload service', async () => {
  upload.mockResolvedValue({ error: null });
  insert.mockResolvedValue({ error: null });
  await createFoodListing(input, new File(['image'], 'food.jpg', { type: 'image/jpeg' }));
  expect(insert).toHaveBeenCalledWith({ ...input, photo_path: expect.stringMatching(/^donor\/.+\.jpg$/) });
  expect(remove).not.toHaveBeenCalled();
});
it('removes the uploaded photo when saving the listing fails', async () => {
  upload.mockResolvedValue({ error: null });
  insert.mockResolvedValue({ error: new Error('save failed') });
  remove.mockResolvedValue({ error: null });
  await expect(createFoodListing(input, new File(['image'], 'food.jpg', { type: 'image/jpeg' }))).rejects.toThrow('save failed');
  expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^donor\/.+\.jpg$/)]);
});
