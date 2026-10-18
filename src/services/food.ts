import { supabase } from '@/integrations/supabase/client';
import { expandAvailabilityBlocks } from '@/lib/pickupSlots';
import { createUuid } from '@/lib/uuid';
import type { AvailabilityBlock, CreateFoodListingInput, DonorListingFilter, FoodListing, FoodRequest, FoodRequestWithPickupAllocations, PickupSlotAvailability, PickupSlotSummary, ProfileSummary, RecipientRequest, ReserveFoodInput, UpdateFoodListingInput } from '@/types/food';

const getListingIdsForStatuses = async (statuses: string[]): Promise<string[]> => {
  const query = supabase.from('food_requests').select('listing_id');
  const response = statuses.length === 1
    ? await query.eq('status', statuses[0])
    : await query.in('status', statuses);
  if (response.error) throw response.error;
  return [...new Set(response.data.map(request => request.listing_id))];
};
const getDonorListingsQuery = async (donorId: string, configure?: (query: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>): Promise<FoodListing[]> => {
  let query = supabase.from('food_listings').select('*').eq('donor_id', donorId);
  if (configure) query = configure(query);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getAllDonorListings = async (donorId: string): Promise<FoodListing[]> => getDonorListingsQuery(donorId);

export const getDonorListings = async (donorId: string, filter: DonorListingFilter = 'pending'): Promise<FoodListing[]> => {
  if (filter === 'pending') {
    const ids = await getListingIdsForStatuses(['pending']);
    return ids.length ? getDonorListingsQuery(donorId, query => query.in('id', ids)) : [];
  }
  const completedIds = await getListingIdsForStatuses(['completed']);
  if (filter === 'done') return completedIds.length ? getDonorListingsQuery(donorId, query => query.in('id', completedIds)) : [];
  const pendingPickupIds = await getListingIdsForStatuses(['pending_pickup']);
  const quantityListings = await getDonorListingsQuery(donorId, query => query.gt('quantity', 0).gt('expiry_time', new Date().toISOString()));
  const pickupListings = pendingPickupIds.length ? await getDonorListingsQuery(donorId, query => query.in('id', pendingPickupIds).gt('expiry_time', new Date().toISOString())) : [];
  return [...new Map([...quantityListings, ...pickupListings].map(listing => [listing.id, listing])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const getRequestsForListings = async (listingIds: string[]): Promise<FoodRequestWithPickupAllocations[]> => {
  if (listingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('food_requests')
    .select('*, allocations:request_pickup_allocations(quantity, pickup_slot:pickup_slots(starts_at, ends_at))')
    .in('listing_id', listingIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as FoodRequestWithPickupAllocations[];
};

export const getProfilesByUserIds = async (userIds: string[]): Promise<ProfileSummary[]> => {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', userIds);
  if (error) throw error;
  return data;
};

export const createFoodListing = async (input: CreateFoodListingInput, photo?: File): Promise<void> => {
  let photoPath: string | null = null;
  let createdPhotoPath: string | null = null;
  if (photo) {
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photo.type];
    if (!extension) throw new Error('Unsupported photo type.');
    photoPath = `${input.donor_id}/${createUuid()}.${extension}`;
    createdPhotoPath = photoPath;
    const { error } = await supabase.storage.from('food-photos').upload(photoPath, photo);
    if (error) throw error;
  } else if (input.sourcePhotoPath) {
    if (input.sourcePhotoPath.split('/')[0] !== input.donor_id) throw new Error('Invalid source photo path.');
    const sourceExtension = input.sourcePhotoPath.split('.').pop()?.toLowerCase();
    const extension = sourceExtension === 'jpeg' || sourceExtension === 'jpg' || sourceExtension === 'png' || sourceExtension === 'webp' ? (sourceExtension === 'jpeg' ? 'jpg' : sourceExtension) : 'jpg';
    photoPath = `${input.donor_id}/${createUuid()}.${extension}`;
    createdPhotoPath = photoPath;
    const { error } = await supabase.storage.from('food-photos').copy(input.sourcePhotoPath, photoPath);
    if (error) throw error;
  }

  try {
    const { error } = await supabase.rpc('create_food_listing_with_slots', {
      p_food_name: input.food_name,
      p_quantity: input.quantity,
      p_expiry_time: new Date(input.expiryTime).toISOString(),
      p_location: input.location,
      p_notes: input.notes,
      p_photo_path: photoPath,
      p_food_analysis: input.foodAnalysis,
      p_pickup_blocks: expandAvailabilityBlocks(input.pickupBlocks),
    });
    if (error) throw error;
  } catch (error) {
    if (createdPhotoPath) await supabase.storage.from('food-photos').remove([createdPhotoPath]);
    throw error;
  }
};

export const replaceListingPickupSlots = async (listingId: string, removeIds: string[], blocks: AvailabilityBlock[]): Promise<PickupSlotSummary[]> => {
  const { data, error } = await supabase.rpc('replace_listing_pickup_slots', {
    p_listing_id: listingId,
    p_remove_ids: removeIds,
    p_new_slots: expandAvailabilityBlocks(blocks),
  });
  if (error) throw error;
  return data;
};

export const updateFoodListingDetails = async (input: UpdateFoodListingInput): Promise<void> => {
  const { error } = await supabase.rpc('update_food_listing_details', {
    p_listing_id: input.listingId,
    p_food_name: input.foodName,
    p_total_quantity: input.totalQuantity,
    p_expiry_time: new Date(input.expiryTime).toISOString(),
    p_location: input.location,
    p_notes: input.notes,
  });
  if (error) throw error;
};

export const deleteFoodListing = async (listingId: string): Promise<void> => {
  const { data, error: fetchError } = await supabase
    .from('food_listings')
    .select('photo_path')
    .eq('id', listingId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('food_listings').delete().eq('id', listingId);
  if (error) throw error;

  if (data.photo_path) {
    const { error: removeError } = await supabase.storage.from('food-photos').remove([data.photo_path]);
    if (removeError) throw removeError;
  }
};

export const advanceFoodRequest = async (requestId: string, direction: 'forward' | 'back', note?: string): Promise<FoodRequest> => {
  const { data, error } = await supabase.rpc('advance_food_request', {
    p_request_id: requestId,
    p_direction: direction,
    p_note: note,
  });
  if (error) throw error;
  return data;
};

export const declineFoodRequest = async (requestId: string, note?: string): Promise<void> => {
  const { error } = await supabase.rpc('decline_food_request', { p_request_id: requestId, p_note: note });
  if (error) throw error;
};

export const undoFoodRequestDecline = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('undo_food_request_decline', { p_request_id: requestId });
  if (error) throw error;
};

export const cancelFoodRequest = async (requestId: string, note?: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_food_request', { p_request_id: requestId, p_note: note });
  if (error) throw error;
};

export const confirmFoodPickup = async (requestId: string, note?: string): Promise<void> => {
  const { error } = await supabase.rpc('confirm_food_pickup', { p_request_id: requestId, p_note: note });
  if (error) throw error;
};

export const getAvailableListings = async (): Promise<FoodListing[]> => {
  const { data, error } = await supabase
    .from('food_listings')
    .select('*')
    .eq('status', 'available')
    .gte('expiry_time', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getListingsByIds = async (ids: string[]): Promise<FoodListing[]> => {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('food_listings')
    .select('*')
    .in('id', ids);
  if (error) throw error;
  return data;
};

export const getRequestsForReceiver = async (receiverId: string): Promise<RecipientRequest[]> => {
  const { data, error } = await supabase
    .from('food_requests')
    .select('id, listing_id, status, pickup_confirmed_at, status_note, status_note_author, allocations:request_pickup_allocations(quantity, pickup_slot:pickup_slots(starts_at, ends_at))')
    .eq('receiver_id', receiverId);
  if (error) throw error;
  return data as RecipientRequest[];
};

export const getPickupSlotsForListings = async (listingIds: string[]): Promise<PickupSlotSummary[]> => {
  if (listingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('pickup_slots')
    .select('id, listing_id, starts_at, ends_at')
    .in('listing_id', listingIds)
    .order('starts_at');
  if (error) throw error;
  return data;
};

export const getAvailablePickupSlots = async (listingId: string): Promise<PickupSlotAvailability[]> => {
  const { data, error } = await supabase.rpc('get_available_pickup_slots', { p_listing_id: listingId });
  if (error) throw error;
  return data;
};

export const getRecipientDashboardData = async (receiverId: string): Promise<{ listings: FoodListing[]; requests: RecipientRequest[] }> => {
  const requests = await getRequestsForReceiver(receiverId);
  const availableListings = await getAvailableListings();
  const requestedListings = await getListingsByIds(requests.map(request => request.listing_id));
  const listings = [...new Map([...availableListings, ...requestedListings].map(listing => [listing.id, listing])).values()];
  return { listings, requests };
};

export type MyFoodRequest = Pick<FoodRequest, 'id' | 'listing_id' | 'status' | 'quantity' | 'notes' | 'created_at' | 'pickup_confirmed_at'> & { listing: Pick<FoodListing, 'food_name' | 'location' | 'expiry_time' | 'photo_path' | 'food_analysis'> | null };
export const getMyFoodRequests = async (receiverId: string): Promise<MyFoodRequest[]> => {
  const { data, error } = await supabase.from('food_requests').select('id, listing_id, status, quantity, notes, created_at, pickup_confirmed_at, listing:food_listings(food_name, location, expiry_time, photo_path, food_analysis)').eq('receiver_id', receiverId).order('created_at', { ascending: false });
  if (error) throw error;
  return data as MyFoodRequest[];
};

export const reserveFood = async ({ listingId, quantity, pickupSlotId, notes }: ReserveFoodInput): Promise<void> => {
  const { error } = await supabase.rpc('reserve_food', {
    p_listing_id: listingId,
    p_quantity: quantity,
    p_allocations: [{ slotId: pickupSlotId, quantity }],
    p_notes: notes,
  });
  if (error) throw error;
};
