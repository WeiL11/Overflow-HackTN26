import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import ListingPhoto from '@/components/ListingPhoto';
import Navbar from '@/components/Navbar';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import ListingTimeline, { type ListingStage } from '@/components/ListingTimeline';
import AppModal, { ModalClose } from '@/components/AppModal';
import type { FoodListing, RequestByListing } from '@/types/food';
import { cancelFoodRequest, confirmFoodPickup, getRecipientDashboardData, reserveFood } from '@/services/food';
import { Badge, Button, Card, Text, TextArea, TextField } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import { Package, MapPin, Search, CheckCircle } from 'lucide-react';

const ReceiverDashboard = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [myRequests, setMyRequests] = useState<RequestByListing>(new Map());
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestFormListingId, setRequestFormListingId] = useState<string | null>(null);
  const [requestedQuantity, setRequestedQuantity] = useState('1');
  const [requestNotes, setRequestNotes] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const receiverId = user?.id;

  const fetchDashboardData = useCallback(async () => {
    if (!receiverId) return;
    try {
      const { listings, requests } = await getRecipientDashboardData(receiverId);
      const map: RequestByListing = new Map();
      requests.forEach(request => map.set(request.listing_id, request));
      setListings(listings);
      setMyRequests(map);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load dashboard data.');
    }
  }, [receiverId]);

  useEffect(() => {
    if (user) fetchDashboardData();
  }, [fetchDashboardData, user]);

  const handleRequest = async (listingId: string) => {
    if (!user) return;
    const listing = listings.find(item => item.id === listingId);
    if (!listing) return;
    const quantity = Number.parseInt(requestedQuantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0 || Number(requestedQuantity) !== quantity) {
      toast.error('Enter a positive whole-item quantity.');
      return;
    }
    if (quantity > listing.quantity) {
      toast.error(`Only ${listing.quantity} items are available.`);
      return;
    }

    setRequesting(listingId);
    try {
      await reserveFood({
        listingId,
        quantity,
        notes: requestNotes.trim() || undefined,
      });
      toast.success('Food reserved! The donor will review your request.');
      setRequestFormListingId(null);
      setRequestedQuantity('1');
      setRequestNotes('');
      fetchDashboardData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reserve food.');
    } finally {
      setRequesting(null);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await cancelFoodRequest(requestId);
      toast.success('Request cancelled.');
      fetchDashboardData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to cancel request.');
    }
  };

  const handleConfirmPickup = async (requestId: string) => {
    try {
      await confirmFoodPickup(requestId);
      toast.success('Pickup confirmed.');
      fetchDashboardData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to confirm pickup.');
    }
  };

  const filtered = listings.filter(l =>
    l.food_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const recipientName = profile?.full_name?.split(' ')[0] || 'there';

  if (authLoading) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-4xl px-4 py-10">
        <section className="mb-8 rounded-2xl border border-primary/15 bg-secondary p-6 md:p-8">
          <Badge color="green" variant="soft" className="mb-3">Recipient dashboard</Badge>
          <h1 className="text-3xl font-heading font-bold text-foreground">Hi, {recipientName}</h1>
          <p className="mt-1 text-muted-foreground">Find fresh food available in your community.</p>
        </section>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>No food available right now. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(item => {
              const request = myRequests.get(item.id);
              const requestStatus = request?.status;
              const hasRequested = !!request && requestStatus !== 'rejected' && requestStatus !== 'cancelled';
              const timelineStage: ListingStage = requestStatus === 'completed'
                ? 'completed'
                : requestStatus === 'pending_pickup'
                  ? 'pending_pickup'
                  : requestStatus === 'pending'
                    ? 'requested'
                    : requestStatus === 'rejected'
                      ? 'rejected'
                      : requestStatus === 'cancelled'
                        ? 'cancelled'
                        : 'available';
              return (
                <Card key={item.id} className="card-shadow hover:card-shadow-hover transition-shadow">
                  <div className="p-5">
                    <ListingPhoto path={item.photo_path} analysis={item.food_analysis} name={item.food_name} />
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <h3 className="font-semibold text-foreground text-lg">{item.food_name}</h3>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{item.quantity} items</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
                          <ExpiryCountdown expiryTime={item.expiry_time} />
                        </div>
                        {item.notes && <p className="mt-3 text-sm text-muted-foreground">{item.notes}</p>}
                      </div>
                      <div className="shrink-0">
                        {hasRequested ? (
                          <div className="flex flex-col items-end gap-2">
                            {requestStatus === 'pending' && (
                              <>
                                <Badge color="amber" variant="soft">Requested</Badge>
                                <Button size="2" variant="outline" disabled={requesting === item.id} onClick={() => handleCancelRequest(request!.id)}>
                                  Undo Request
                                </Button>
                              </>
                            )}
                            {requestStatus === 'pending_pickup' && (
                              <>
                                {request?.pickup_confirmed_at ? (
                                  <Badge color="green" variant="soft" className="flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" /> Pickup confirmed
                                  </Badge>
                                ) : (
                                  <Button size="2" disabled={requesting === item.id} onClick={() => handleConfirmPickup(request!.id)}>
                                    Confirm Pickup
                                  </Button>
                                )}
                                <Button size="2" variant="outline" disabled={requesting === item.id} onClick={() => handleCancelRequest(request!.id)}>
                                  Undo Request
                                </Button>
                              </>
                            )}
                            {requestStatus === 'completed' && <Badge color="green" variant="solid">Done</Badge>}
                          </div>
                        ) : (
                          <Button
                            size="2"
                            disabled={requesting === item.id}
                            onClick={() => {
                              setRequestFormListingId(item.id);
                              setRequestedQuantity('1');
                              setRequestNotes('');
                            }}
                          >
                            Request Food
                          </Button>
                        )}
                      </div>
                    </div>
                    {requestFormListingId === item.id && (
                      <div className="mt-4 rounded-lg border border-primary/20 bg-muted/30 p-4">
                        <div className="space-y-2">
                          <Text as="label" size="2" weight="medium" htmlFor={`request-quantity-${item.id}`}>Quantity (items)</Text>
                          <TextField.Root
                            id={`request-quantity-${item.id}`}
                            type="number"
                            min="1"
                            max={item.quantity}
                            step="1"
                            inputMode="numeric"
                            value={requestedQuantity}
                            onChange={event => setRequestedQuantity(event.target.value)}
                            disabled={requesting === item.id}
                          />
                        </div>
                        <div className="mt-3 space-y-2">
                          <Text as="label" size="2" weight="medium" htmlFor={`request-notes-${item.id}`}>Notes (optional)</Text>
                          <TextArea
                            id={`request-notes-${item.id}`}
                            className="resize-y"
                            maxLength={1000}
                            placeholder="Add a note for the donor..."
                            value={requestNotes}
                            onChange={event => setRequestNotes(event.target.value)}
                            disabled={requesting === item.id}
                          />
                        </div>
                        <div className="mt-4 flex justify-end gap-3">
                          <Button type="button" variant="outline" disabled={requesting === item.id} onClick={() => setRequestFormListingId(null)}>
                            Cancel
                          </Button>
                          <Button type="button" disabled={requesting === item.id} onClick={() => handleRequest(item.id)}>
                            {requesting === item.id ? 'Submitting...' : 'Submit'}
                          </Button>
                        </div>
                      </div>
                    )}
                    <ListingTimeline stage={timelineStage} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        </div>
      </main>
      <AppModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search available food"
        description="Filter listings by food name or pickup location."
        trigger={(
          <Button
            size="3"
            className="fixed bottom-6 right-6 z-[100] rounded-full px-5 shadow-xl"
          >
            <Search className="h-5 w-5" /> Search Food
          </Button>
        )}
      >
          <TextField.Root
            autoFocus
            size="3"
            placeholder="Search by food name or location..."
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
          >
            <TextField.Slot>
              <Search className="h-4 w-4 text-muted-foreground" />
            </TextField.Slot>
          </TextField.Root>
          <div className="mt-4 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? 'listing' : 'listings'} found
            </p>
            <div className="flex justify-center gap-3">
              {searchTerm && (
                <Button type="button" variant="ghost" onClick={() => setSearchTerm('')}>Clear</Button>
              )}
              <ModalClose>
                <Button type="button">View Results</Button>
              </ModalClose>
            </div>
          </div>
      </AppModal>
    </div>
  );
};

export default ReceiverDashboard;
