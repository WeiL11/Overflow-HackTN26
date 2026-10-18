import type { Tables } from '@/integrations/supabase/types';

export type FoodListing = Tables<'food_listings'>;
export type FoodRequest = Tables<'food_requests'>;
export type ProfileSummary = Pick<Tables<'profiles'>, 'user_id' | 'full_name' | 'role'>;
export type RecipientRequest = Pick<FoodRequest, 'id' | 'listing_id' | 'status' | 'pickup_confirmed_at'>;
export type RequestByListing = Map<string, RecipientRequest>;
