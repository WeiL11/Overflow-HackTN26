import type { Json, TablesInsert } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import type { FoodListing, FoodRequest, ProfileSummary, RecipientRequest } from '@/types/food';

export type CreateFoodListingInput = Pick<TablesInsert<'food_listings'>, 'donor_id' | 'food_name' | 'quantity' | 'location' | 'expiry_time' | 'notes' | 'food_analysis'>;
export type ReserveFoodInput = { listingId: string; quantity: number; notes?: string };

export const getDonorListings = async (donorId: string): Promise<FoodListing[]> => {
  const { data, error } = await supabase
    .from('food_listings')
    .select('*')
    .eq('donor_id', donorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getRequestsForListings = async (listingIds: string[]): Promise<FoodRequest[]> => {
  if (listingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('food_requests')
    .select('*')
    .in('listing_id', listingIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getProfilesByUserIds = async (userIds: string[]): Promise<ProfileSummary[]> => {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, full_name, role')
    .in('user_id', userIds);
  if (error) throw error;
  return data;
};

export const createFoodListing = async (input: CreateFoodListingInput, photo?: File): Promise<void> => {
  let photoPath: string | null = null;
  if (photo) {
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photo.type];
    if (!extension) throw new Error('Unsupported photo type.');
    photoPath = `${input.donor_id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('food-photos').upload(photoPath, photo);
    if (error) throw error;
  }

  try {
    const { error } = await supabase.from('food_listings').insert({ ...input, photo_path: photoPath });
    if (error) throw error;
  } catch (error) {
    if (photoPath) await supabase.storage.from('food-photos').remove([photoPath]);
    throw error;
  }
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

export const advanceFoodRequest = async (requestId: string, direction: 'forward' | 'back'): Promise<void> => {
  const { error } = await supabase.rpc('advance_food_request', {
    p_request_id: requestId,
    p_direction: direction,
  });
  if (error) throw error;
};

export const rejectFoodRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('reject_food_request', { p_request_id: requestId });
  if (error) throw error;
};

export const cancelFoodRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_food_request', { p_request_id: requestId });
  if (error) throw error;
};

export const confirmFoodPickup = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('confirm_food_pickup', { p_request_id: requestId });
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
    .select('id, listing_id, status, pickup_confirmed_at')
    .eq('receiver_id', receiverId);
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

export const reserveFood = async ({ listingId, quantity, notes }: ReserveFoodInput): Promise<void> => {
  const { error } = await supabase.rpc('reserve_food', {
    p_listing_id: listingId,
    p_quantity: quantity,
    p_notes: notes,
  });
  if (error) throw error;
};
