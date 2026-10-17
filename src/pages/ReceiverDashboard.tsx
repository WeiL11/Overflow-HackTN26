import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import ListingTimeline, { type ListingStage } from '@/components/ListingTimeline';
import { Badge, Button, Card, Dialog, Text, TextArea, TextField } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import { Package, MapPin, Search, CheckCircle } from 'lucide-react';

interface FoodListing {
  id: string;
  food_name: string;
  quantity: number;
  location: string;
  expiry_time: string;
  status: string;
  created_at: string;
}

interface MyRequest {
  listing_id: string;
  status: string;
}

export default function ReceiverDashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [myRequests, setMyRequests] = useState<Map<string, string>>(new Map());
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestFormListingId, setRequestFormListingId] = useState<string | null>(null);
  const [requestedQuantity, setRequestedQuantity] = useState('1');
  const [requestNotes, setRequestNotes] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const fetchListings = async () => {
    const { data } = await supabase
      .from('food_listings')
      .select('*')
      .eq('status', 'available')
      .gte('expiry_time', new Date().toISOString())
      .order('created_at', { ascending: false });
    setListings(data || []);
  };

  const fetchMyRequests = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('food_requests')
      .select('listing_id, status')
      .eq('receiver_id', user.id);
    const map = new Map<string, string>();
    (data || []).forEach((r: MyRequest) => map.set(r.listing_id, r.status));
    setMyRequests(map);
  };

  useEffect(() => {
    if (user) {
      fetchListings();
      fetchMyRequests();
    }
  }, [user]);

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
    const { error } = await supabase.rpc('reserve_food', {
      p_listing_id: listingId,
      p_quantity: quantity,
      p_notes: requestNotes.trim() || undefined,
    });
    if (error) {
      setRequesting(null);
      toast.error(error.message);
      return;
    }

    setRequesting(null);
    toast.success('Food reserved! The donor will review your request.');
    setMyRequests(prev => new Map(prev).set(listingId, 'pending'));
    setRequestFormListingId(null);
    setRequestedQuantity('1');
    setRequestNotes('');
    fetchListings();
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
              const requestStatus = myRequests.get(item.id);
              const hasRequested = !!requestStatus;
              const timelineStage: ListingStage = requestStatus === 'accepted'
                ? 'completed'
                : requestStatus === 'pending'
                  ? 'requested'
                  : requestStatus === 'rejected'
                    ? 'rejected'
                    : 'available';
              return (
                <Card key={item.id} className="card-shadow hover:card-shadow-hover transition-shadow">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <h3 className="font-semibold text-foreground text-lg">{item.food_name}</h3>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{item.quantity} items</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
                          <ExpiryCountdown expiryTime={item.expiry_time} />
                        </div>
                      </div>
                      <div className="shrink-0">
                        {hasRequested ? (
                          <Badge
                            color={requestStatus === 'accepted' ? 'green' : 'gray'}
                            variant={requestStatus === 'accepted' ? 'solid' : 'soft'}
                            className="flex items-center gap-1"
                          >
                            {requestStatus === 'accepted' && <CheckCircle className="h-3 w-3" />}
                            {requestStatus === 'pending' ? 'Requested' : requestStatus === 'accepted' ? 'Accepted' : 'Rejected'}
                          </Badge>
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
                            value={requestedQuantity}
                            onChange={event => setRequestedQuantity(event.target.value)}
                            disabled={requesting === item.id}
                          />
                        </div>
                        <div className="mt-3 space-y-2">
                          <Text as="label" size="2" weight="medium" htmlFor={`request-notes-${item.id}`}>Notes (optional)</Text>
                          <TextArea
                            id={`request-notes-${item.id}`}
                            maxLength={1000}
                            placeholder="Add a note for the donor..."
                            value={requestNotes}
                            onChange={event => setRequestNotes(event.target.value)}
                            disabled={requesting === item.id}
                          />
                        </div>
                        <div className="mt-4 flex gap-3">
                          <Button type="button" disabled={requesting === item.id} onClick={() => handleRequest(item.id)}>
                            {requesting === item.id ? 'Submitting...' : 'Submit Request'}
                          </Button>
                          <Button type="button" variant="outline" disabled={requesting === item.id} onClick={() => setRequestFormListingId(null)}>
                            Cancel
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
      <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}>
        <Dialog.Trigger>
          <Button
            size="3"
            className="fixed bottom-6 right-6 z-[100] rounded-full px-5 shadow-xl"
          >
            <Search className="h-5 w-5" /> Search Food
          </Button>
        </Dialog.Trigger>
        <Dialog.Content maxWidth="560px">
          <Dialog.Title className="font-heading">Search available food</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Filter listings by food name or pickup location.
          </Dialog.Description>
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
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? 'listing' : 'listings'} found
            </p>
            <div className="flex gap-3">
              {searchTerm && (
                <Button type="button" variant="ghost" onClick={() => setSearchTerm('')}>Clear</Button>
              )}
              <Dialog.Close>
                <Button type="button">View Results</Button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
