import type { ListingStage } from '@/components/ListingTimeline';

// Timeline stage for one request, as the receiver sees it.
export const requestStage = (status: string | undefined): ListingStage => {
  switch (status) {
    case 'completed': return 'completed';
    case 'pending_pickup': return 'pending_pickup';
    case 'pending': return 'requested';
    case 'rejected': return 'rejected';
    case 'cancelled': return 'cancelled';
    default: return 'available';
  }
};

// Timeline stage for a donor's listing, from the requests made on it.
export const donationStage = (listingStatus: string, requestStatuses: string[]): ListingStage => {
  if (requestStatuses.includes('completed')) return 'completed';
  if (requestStatuses.includes('pending_pickup')) return 'pending_pickup';
  if (requestStatuses.includes('pending') || listingStatus === 'requested') return 'requested';
  return 'available';
};
