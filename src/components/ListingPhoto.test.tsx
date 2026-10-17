import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ListingPhoto from './ListingPhoto';
const sign = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ createSignedUrl: sign }) } } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('loads private persisted photos with a signed URL and displays saved analysis', async () => {
  sign.mockResolvedValue({ data: { signedUrl: 'https://example.test/signed-photo' }, error: null });
  render(<ListingPhoto path="donor/photo.jpg" analysis={{ description: 'Two apples' }} name="Apples" />);
  expect(await screen.findByAltText('Apples')).toHaveAttribute('src', 'https://example.test/signed-photo');
  expect(screen.getByText('Two apples')).toBeInTheDocument();
  expect(sign).toHaveBeenCalledWith('donor/photo.jpg', 3600);
});
it('shows a usable listing when the stored photo cannot be loaded', async () => {
  sign.mockResolvedValue({ data: null, error: new Error('missing') });
  render(<ListingPhoto path="missing.jpg" analysis={null} name="Apples" />);
  await waitFor(() => expect(screen.getByText('Photo unavailable.')).toBeInTheDocument());
});
