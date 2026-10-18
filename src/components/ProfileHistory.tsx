import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card } from '@radix-ui/themes';
import { CalendarClock, MapPin, Package } from 'lucide-react';
import ListingPhoto from '@/components/ListingPhoto';
import ListingTimeline from '@/components/ListingTimeline';
import { donationStage, requestStage } from '@/lib/listingStage';
import { getDonorListings, getMyFoodRequests, getRequestsForListings, type MyFoodRequest } from '@/services/food';
import type { FoodListing, FoodRequest } from '@/types/food';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const REQUEST_STATUS: Record<string, { label: string; color: 'amber' | 'blue' | 'green' | 'red' | 'gray' }> = {
  pending: { label: 'Requested', color: 'amber' },
  pending_pickup: { label: 'Pending pickup', color: 'blue' },
  completed: { label: 'Done', color: 'green' },
  rejected: { label: 'Declined', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

const useAsync = <T,>(load: () => Promise<T>, deps: unknown[]) => {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    setState(current => ({ ...current, loading: true }));
    load()
      .then(data => { if (!cancelled) setState({ data, error: null, loading: false }); })
      .catch(error => { if (!cancelled) setState({ data: null, error: error instanceof Error ? error.message : 'Unable to load.', loading: false }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
};

const EmptyState = ({ text, to, action }: { text: string; to: string; action: string }) => (
  <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
    <Package className="mx-auto mb-3 h-10 w-10 opacity-40" />
    <p className="mb-4">{text}</p>
    <Button asChild variant="soft"><Link to={to}>{action}</Link></Button>
  </div>
);

// Food the user has requested as a receiver, with each request's progress.
export const MyFood = ({ userId }: { userId: string }) => {
  const { data, error, loading } = useAsync<MyFoodRequest[]>(() => getMyFoodRequests(userId), [userId]);
  if (loading) return <p className="text-sm text-muted-foreground">Loading your food…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data?.length) return <EmptyState text="You haven't requested any food yet." to="/receiver" action="Find food" />;
  return (
    <div className="space-y-4">
      {data.map(request => {
        const status = REQUEST_STATUS[request.status] ?? { label: request.status, color: 'gray' as const };
        return (
          <Card key={request.id} className="card-shadow">
            <div className="p-5">
              {request.listing && (
                <ListingPhoto path={request.listing.photo_path} analysis={request.listing.food_analysis} name={request.listing.food_name} />
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">{request.listing?.food_name ?? 'Listing removed'}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{request.quantity} requested</span>
                    {request.listing && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{request.listing.location}</span>}
                    {request.listing && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Pick up by {formatDateTime(request.listing.expiry_time)}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">Requested {formatDateTime(request.created_at)}</p>
                </div>
                <Badge color={status.color} variant="soft">{status.label}</Badge>
              </div>
              <ListingTimeline stage={requestStage(request.status)} />
            </div>
          </Card>
        );
      })}
    </div>
  );
};

// Food the user has posted as a donor, with where each listing is in the pickup flow.
export const MyDonations = ({ userId }: { userId: string }) => {
  const { data, error, loading } = useAsync<{ listings: FoodListing[]; requests: FoodRequest[] }>(async () => {
    const listings = await getDonorListings(userId);
    const requests = await getRequestsForListings(listings.map(listing => listing.id));
    return { listings, requests };
  }, [userId]);
  if (loading) return <p className="text-sm text-muted-foreground">Loading your donations…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data?.listings.length) return <EmptyState text="You haven't donated any food yet." to="/donor" action="Donate food" />;
  return (
    <div className="space-y-4">
      {data.listings.map(listing => {
        const requests = data.requests.filter(request => request.listing_id === listing.id);
        const open = requests.filter(request => request.status === 'pending' || request.status === 'pending_pickup').length;
        return (
          <Card key={listing.id} className="card-shadow">
            <div className="p-5">
              <ListingPhoto path={listing.photo_path} analysis={listing.food_analysis} name={listing.food_name} />
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">{listing.food_name}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{listing.quantity} left</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{listing.location}</span>
                    <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Pick up by {formatDateTime(listing.expiry_time)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Posted {formatDateTime(listing.created_at)} · {requests.length} {requests.length === 1 ? 'request' : 'requests'}{open ? ` (${open} open)` : ''}
                  </p>
                </div>
                <Badge color={listing.status === 'available' ? 'green' : 'gray'} variant="soft" className="capitalize">{listing.status}</Badge>
              </div>
              <ListingTimeline stage={donationStage(listing.status, requests.map(request => request.status))} />
            </div>
          </Card>
        );
      })}
    </div>
  );
};
