import type { Json, Tables } from '@/integrations/supabase/types';
import type { AvailabilityBlock } from './pickup';
import type { ListingStage } from './lifecycle';

export type FoodListing = Tables<'food_listings'>;
export type DonorListingFilter = 'pending' | 'available' | 'done';
export type RecipientListingFilter = 'active' | 'done' | 'all';
export type ListingDisplayStatus = ListingStage | 'expired';
export type CreateFoodListingInput = {
  donor_id: string;
  food_name: string;
  quantity: number;
  location: string;
  expiryTime: string;
  notes: string | null;
  pickupBlocks: AvailabilityBlock[];
  foodAnalysis: Json | null;
  sourcePhotoPath?: string | null;
};
export type UpdateFoodListingInput = { listingId: string; foodName: string; totalQuantity: number; location: string; expiryTime: string; notes: string | null };
