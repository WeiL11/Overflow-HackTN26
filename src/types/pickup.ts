import type { Tables } from '@/integrations/supabase/types';

export enum PickupIntervalMinutes { Fifteen = 15 }
export type PickupSlot = Tables<'pickup_slots'>;
export type PickupSlotSummary = Pick<PickupSlot, 'id' | 'listing_id' | 'starts_at' | 'ends_at'>;
export type PickupSlotAvailability = Omit<PickupSlot, 'interval_unit'> & { allocated: number; remaining: number };
export type AvailabilityBlock = { startsAt: string; endsAt: string };
