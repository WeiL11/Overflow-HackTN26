import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { advanceFoodRequest, createFoodListing, getAllDonorListings, getDonorListings, updateFoodListingDetails } from '@/services/food';

const storageCopy = vi.hoisted(() => vi.fn());
const storageRemove = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: storageRemove, copy: storageCopy })) },
  },
}));

const makeChain = (data: unknown[] = []) => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  chain.order.mockResolvedValue({ data, error: null });
  return chain;
};

describe('getDonorListings filters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not add a status or ID filter for all listings', async () => {
    const listingQuery = makeChain();
    vi.mocked(supabase.from).mockReturnValue(listingQuery as never);

    await getAllDonorListings('donor-id');

    expect(listingQuery.eq).toHaveBeenCalledWith('donor_id', 'donor-id');
    expect(listingQuery.eq).not.toHaveBeenCalledWith('status', expect.anything());
    expect(listingQuery.in).not.toHaveBeenCalled();
    expect(listingQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('filters available listings server-side by quantity and pending pickup', async () => {
    const completedQuery = makeChain();
    completedQuery.eq.mockResolvedValue({ data: [{ listing_id: 'done-1' }, { listing_id: 'done-1' }], error: null });
    const activeQuery = makeChain();
    activeQuery.eq.mockResolvedValue({ data: [{ listing_id: 'active-1' }], error: null });
    const activeListings = makeChain();
    const availableListings = makeChain();
    vi.mocked(supabase.from)
      .mockReturnValueOnce(completedQuery as never)
      .mockReturnValueOnce(activeQuery as never)
      .mockReturnValueOnce(activeListings as never)
      .mockReturnValueOnce(availableListings as never);
    await getDonorListings('donor-id', 'available');
    expect(completedQuery.eq).toHaveBeenCalledWith('status', 'completed');
    expect(activeQuery.eq).toHaveBeenCalledWith('status', 'pending_pickup');
    expect(activeListings.gt).toHaveBeenCalledWith('quantity', 0);
    expect(activeListings.gt).toHaveBeenCalledWith('expiry_time', expect.any(String));
    expect(availableListings.in).toHaveBeenCalledWith('id', ['active-1']);
    expect(availableListings.gt).toHaveBeenCalledWith('expiry_time', expect.any(String));
  });

  it('returns only completed-request listings for done', async () => {
    const completedQuery = makeChain();
    completedQuery.eq.mockResolvedValue({ data: [{ listing_id: 'done-1' }, { listing_id: 'done-1' }], error: null });
    const listingQuery = makeChain();
    vi.mocked(supabase.from).mockReturnValueOnce(completedQuery as never).mockReturnValueOnce(listingQuery as never);
    await getDonorListings('donor-id', 'done');
    expect(listingQuery.in).toHaveBeenCalledWith('id', ['done-1']);
  });

  it('copies source photos to a new donor-owned path and cleans only the destination on RPC failure', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'new-photo' });
    storageCopy.mockResolvedValue({ error: null });
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never);
    const input = { donor_id: 'donor-id', food_name: 'Bread', quantity: 2, location: 'Kitchen', expiryTime: '2099-10-18T16:00:00.000Z', notes: null, pickupBlocks: [{ startsAt: '2099-10-18T14:00:00.000Z', endsAt: '2099-10-18T14:15:00.000Z' }], foodAnalysis: null, sourcePhotoPath: 'donor-id/original.png' };
    await createFoodListing(input);
    expect(storageCopy).toHaveBeenCalledWith('donor-id/original.png', 'donor-id/new-photo.png');
    expect(vi.mocked(supabase.rpc)).toHaveBeenLastCalledWith('create_food_listing_with_slots', expect.objectContaining({ p_photo_path: 'donor-id/new-photo.png' }));
    expect(vi.mocked(supabase.rpc)).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ p_photo_path: 'donor-id/original.png' }));

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('create failed') } as never);
    await expect(createFoodListing(input)).rejects.toThrow('create failed');
    expect(storageRemove).toHaveBeenCalledWith(['donor-id/new-photo.png']);
    expect(storageRemove).not.toHaveBeenCalledWith(['donor-id/original.png']);
  });

  it('returns the updated request after advancing its lifecycle', async () => {
    const updated = { id: 'request-1', status: 'pending_pickup' };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: updated, error: null } as never);

    await expect(advanceFoodRequest('request-1', 'back')).resolves.toEqual(updated);
    expect(supabase.rpc).toHaveBeenCalledWith('advance_food_request', {
      p_request_id: 'request-1',
      p_direction: 'back',
      p_note: undefined,
    });
  });

  it('maps update listing details through the RPC and propagates errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never);
    await updateFoodListingDetails({ listingId: 'listing-1', foodName: 'Bread', totalQuantity: 8, location: 'Kitchen', expiryTime: '2026-10-18T16:00:00.000Z', notes: null });
    expect(supabase.rpc).toHaveBeenCalledWith('update_food_listing_details', {
      p_listing_id: 'listing-1', p_food_name: 'Bread', p_total_quantity: 8, p_location: 'Kitchen', p_expiry_time: '2026-10-18T16:00:00.000Z', p_notes: null,
    });

    const error = new Error('update failed');
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error } as never);
    await expect(updateFoodListingDetails({ listingId: 'listing-1', foodName: 'Bread', totalQuantity: 8, location: 'Kitchen', expiryTime: '2026-10-18T16:00:00.000Z', notes: null })).rejects.toThrow('update failed');
  });

  it('returns no done listings when no completed requests exist', async () => {
    const completedQuery = makeChain();
    completedQuery.eq.mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValueOnce(completedQuery as never);
    await expect(getDonorListings('donor-id', 'done')).resolves.toEqual([]);
  });
});
