import { describe, expect, it } from 'vitest';
import { getListingDisplayStatus } from './listingStatus';
const listing = (quantity: number, expiry = '2099-01-01T00:00:00Z') => ({ id: 'l', donor_id: 'd', food_name: 'Food', quantity, original_quantity: quantity, category: '', description: null, latitude: null, longitude: null, photo_metadata: null, photo_uploaded_at: null, tags: [], location: 'Place', expiry_time: expiry, status: 'available', notes: null, photo_path: null, food_analysis: null, created_at: '' });
const request = (status: string, quantity = 1) => ({ id: status, listing_id: 'l', receiver_id: 'r', status, quantity, created_at: '', notes: null, pickup_confirmed_at: null, status_note: null, status_note_author: null, allocations: [] });
describe('listing status', () => {
  it('shows available for partial inventory', () => expect(getListingDisplayStatus(listing(2), [request('completed', 1)])).toBe('available'));
  it('shows requested for active requests', () => expect(getListingDisplayStatus(listing(0), [request('pending')])).toBe('requested'));
  it('shows completed when all non-cancelled requests are done', () => expect(getListingDisplayStatus(listing(0), [request('completed')])).toBe('completed'));
  it('shows expired before other status rules', () => expect(getListingDisplayStatus(listing(5, '2020-01-01T00:00:00Z'), [])).toBe('expired'));
});
