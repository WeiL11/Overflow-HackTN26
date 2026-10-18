import type { FoodListing, FoodRequestWithPickupAllocations, ListingDisplayStatus, ListingStage } from '@/types/food';
import type { BadgeProps } from '@radix-ui/themes';
export const getListingDisplayStatus = (item: FoodListing, requests: FoodRequestWithPickupAllocations[], now = Date.now()): ListingDisplayStatus => {
  if (new Date(item.expiry_time).getTime() <= now) return 'expired';
  if (item.quantity > 0) return 'available';
  if (requests.some(request => ['pending', 'pending_pickup'].includes(request.status))) return 'requested';
  const active = requests.filter(request => !['cancelled', 'declined'].includes(request.status));
  if (active.length > 0 && active.every(request => request.status === 'completed')) return 'completed';
  return item.status as ListingDisplayStatus;
};
export const listingDisplayLabel = (status: string) => status === 'expired' ? 'Expired' : status === 'available' ? 'Available' : status === 'requested' ? 'Requested' : status === 'completed' ? 'Done' : status;
export const requestStatusLabel = (status: string) => ({ pending: 'Requested', pending_pickup: 'Pending Pickup', completed: 'Done', declined: 'Declined', cancelled: 'Cancelled' }[status] || status);
export const requestStatusColor = (status: string): Pick<BadgeProps, 'color' | 'variant'> => { if (status === 'pending') return { color: 'amber', variant: 'soft' }; if (status === 'pending_pickup') return { color: 'blue', variant: 'soft' }; if (status === 'completed') return { color: 'green', variant: 'solid' }; if (status === 'declined') return { color: 'red', variant: 'solid' }; return { color: 'gray', variant: 'soft' }; };
export const requestTimelineStage = (status: string): ListingStage => ({ pending: 'requested', pending_pickup: 'pending_pickup', completed: 'completed', declined: 'declined', cancelled: 'cancelled' }[status] || 'available') as ListingStage;
