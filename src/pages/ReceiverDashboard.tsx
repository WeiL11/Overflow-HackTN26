import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import ListingPhoto from '@/components/ListingPhoto';
import Navbar from '@/components/Navbar';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import ListingTimeline from '@/components/ListingTimeline';
import { requestStage } from '@/lib/listingStage';
import AppModal, { ModalClose } from '@/components/AppModal';
import type { FoodListing, RequestByListing } from '@/types/food';
import { cancelFoodRequest, confirmFoodPickup, getRecipientDashboardData, reserveFood } from '@/services/food';
import { searchFoodWithAI, type FoodSearchResult } from '@/lib/foodSearch';
import { DIETARY_TAGS, categoryLabel, tagLabel } from '@/config/foodTaxonomy';
import { distanceMiles, formatMiles, toLatLng } from '@/lib/geo';
import { useReceiverLocation } from '@/hooks/use-receiver-location';
import FoodMap, { type MapListing } from '@/components/FoodMap';
import { Badge, Button, Card, SegmentedControl, Select, Tabs, Text, TextArea, TextField } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import { Package, MapPin, Search, CheckCircle, Sparkles, Loader2, X, List, Map as MapIcon, Navigation } from 'lucide-react';
import { errorMessage } from '@/lib/errors';

const AI_EXAMPLES = [
  'Vegetarian dinner for a family of 4',
  'Halal food, no nuts',
  'Snacks for my kids',
  'Something I can eat without cooking',
];

// Miles from the receiver; null when the listing has no coordinates.
type ListingWithDistance = FoodListing & { distance: number | null };

type SortOrder = 'expiry' | 'nearest' | 'newest' | 'match';

const SORT_LABELS: Record<SortOrder, string> = {
  expiry: 'Expiring soonest',
  nearest: 'Nearest first',
  newest: 'Newest first',
  match: 'Best match',
};

const sortListings = (items: ListingWithDistance[], order: SortOrder) => {
  if (order === 'match') return items;
  if (order === 'nearest') {
    return [...items].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }
  const key = order === 'expiry' ? 'expiry_time' : 'created_at';
  const direction = order === 'expiry' ? 1 : -1;
  return [...items].sort((a, b) => direction * (new Date(a[key]).getTime() - new Date(b[key]).getTime()));
};

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
  const [searchMode, setSearchMode] = useState<'ai' | 'keyword'>('ai');
  const [aiQuery, setAiQuery] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResult, setAiResult] = useState<(FoodSearchResult & { query: string }) | null>(null);
  const [aiApplied, setAiApplied] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('expiry');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const receiverLocation = useReceiverLocation();
  const youLabel = receiverLocation.source === 'gps' ? 'You are here' : 'You (Featheringill Hall)';

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
      toast.error(errorMessage(error, 'Unable to load dashboard data.'));
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
      toast.error(errorMessage(error, 'Unable to reserve food.'));
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
      toast.error(errorMessage(error, 'Unable to cancel request.'));
    }
  };

  const handleConfirmPickup = async (requestId: string) => {
    try {
      await confirmFoodPickup(requestId);
      toast.success('Pickup confirmed.');
      fetchDashboardData();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to confirm pickup.'));
    }
  };

  const runAiSearch = async (query = aiQuery) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setAiQuery(trimmed);
    setAiSearching(true);
    try {
      const result = await searchFoodWithAI(trimmed, receiverLocation.position);
      setAiResult({ ...result, query: trimmed });
      if (result.fallback) toast.info('AI is busy, so these are keyword matches.');
    } catch (error) {
      toast.error(errorMessage(error, 'AI search failed.'));
      setSearchMode('keyword');
      setSearchTerm(trimmed);
    } finally {
      setAiSearching(false);
    }
  };

  const clearAiSearch = () => {
    setAiApplied(false);
    setAiResult(null);
    setAiQuery('');
  };

  const term = searchTerm.toLowerCase();
  const keywordMatches = listings.filter(l =>
    l.food_name.toLowerCase().includes(term) ||
    l.location.toLowerCase().includes(term) ||
    categoryLabel(l.category).toLowerCase().includes(term) ||
    l.tags.some(tag => tagLabel(tag).toLowerCase().includes(term))
  );

  const listingsById = new Map(listings.map(l => [l.id, l]));
  const aiMatches = (aiResult?.results ?? []).flatMap(r => {
    const listing = listingsById.get(r.id);
    return listing ? [listing] : [];
  });
  const aiReasons = new Map((aiResult?.results ?? []).map(r => [r.id, r.reason]));
  const showingAi = aiApplied && aiResult !== null;
  // "Best match" only applies to AI results; otherwise fall back to the default expiry order.
  const activeSort: SortOrder = sortOrder === 'match' && !showingAi ? 'expiry' : sortOrder;
  const withDistance = (items: FoodListing[]): ListingWithDistance[] => items.map(listing => {
    const position = toLatLng(listing.latitude, listing.longitude);
    return { ...listing, distance: position ? distanceMiles(receiverLocation.position, position) : null };
  });
  const filtered = sortListings(withDistance(showingAi ? aiMatches : keywordMatches), activeSort);
  const mapListings: MapListing[] = filtered.flatMap(listing => {
    const position = toLatLng(listing.latitude, listing.longitude);
    return position && listing.distance !== null ? [{ ...listing, position, distance: listing.distance }] : [];
  });

  // From a map pin: switch to the list and open that listing's request form.
  const requestFromMap = (listingId: string) => {
    setViewMode('list');
    setRequestFormListingId(listingId);
    setRequestedQuantity('1');
    setRequestNotes('');
    setTimeout(() => document.getElementById(`listing-${listingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };


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

        {showingAi && aiResult && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {aiResult.fallback ? 'Keyword matches' : 'AI matches'} for “{aiResult.query}”
              </p>
              {aiResult.summary && <p className="text-sm text-muted-foreground">{aiResult.summary}</p>}
            </div>
            <Button type="button" variant="ghost" size="1" onClick={clearAiSearch}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              <p className="whitespace-nowrap">{filtered.length} {filtered.length === 1 ? 'listing' : 'listings'}</p>
              <p className="flex items-center gap-1 text-xs">
                <Navigation className="h-3 w-3" /> Distances from {receiverLocation.label}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl.Root value={viewMode} onValueChange={value => setViewMode(value as 'list' | 'map')} size="1">
                <SegmentedControl.Item value="list"><span className="flex items-center gap-1"><List className="h-3.5 w-3.5" /> List</span></SegmentedControl.Item>
                <SegmentedControl.Item value="map"><span className="flex items-center gap-1"><MapIcon className="h-3.5 w-3.5" /> Map</span></SegmentedControl.Item>
              </SegmentedControl.Root>
              {viewMode === 'list' && (
                <>
                  <Text as="label" size="2" color="gray" htmlFor="listing-sort" className="whitespace-nowrap">Sort by</Text>
                  <Select.Root value={activeSort} onValueChange={value => setSortOrder(value as SortOrder)}>
                    <Select.Trigger id="listing-sort" variant="soft" color="gray" />
                    <Select.Content>
                      {(Object.keys(SORT_LABELS) as SortOrder[])
                        .filter(order => order !== 'match' || showingAi)
                        .map(order => (
                          <Select.Item key={order} value={order}>{SORT_LABELS[order]}</Select.Item>
                        ))}
                    </Select.Content>
                  </Select.Root>
                </>
              )}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>{showingAi || searchTerm ? 'No listings match your search. Try describing it differently.' : 'No food available right now. Check back soon!'}</p>
          </div>
        ) : viewMode === 'map' ? (
          <div className="space-y-2">
            <FoodMap listings={mapListings} you={receiverLocation.position} youLabel={youLabel} onRequest={requestFromMap} />
            {mapListings.length < filtered.length && (
              <p className="text-xs text-muted-foreground">
                {filtered.length - mapListings.length} {filtered.length - mapListings.length === 1 ? 'listing has' : 'listings have'} no map location; switch to List to see {filtered.length - mapListings.length === 1 ? 'it' : 'them'}.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(item => {
              const request = myRequests.get(item.id);
              const requestStatus = request?.status;
              const hasRequested = !!request && requestStatus !== 'rejected' && requestStatus !== 'cancelled';
              const timelineStage = requestStage(requestStatus);
              return (
                <Card key={item.id} id={`listing-${item.id}`} className="card-shadow hover:card-shadow-hover transition-shadow">
                  <div className="p-5">
                    <ListingPhoto path={item.photo_path} analysis={item.food_analysis} name={item.food_name} />
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-foreground text-lg">{item.food_name}</h3>
                          <Badge color="gray" variant="soft">{categoryLabel(item.category)}</Badge>
                        </div>
                        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {[...item.tags]
                              .sort((a, b) => Number(DIETARY_TAGS.includes(b)) - Number(DIETARY_TAGS.includes(a)))
                              .slice(0, 5)
                              .map(tag => (
                                <Badge key={tag} size="1" variant="outline" color={DIETARY_TAGS.includes(tag) ? 'green' : 'gray'}>
                                  {tagLabel(tag)}
                                </Badge>
                              ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{item.quantity} items</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />{item.location}
                            {item.distance !== null && <span className="font-medium text-foreground">· {formatMiles(item.distance)} away</span>}
                          </span>
                          <ExpiryCountdown expiryTime={item.expiry_time} />
                        </div>
                        {item.notes && <p className="mt-3 text-sm text-muted-foreground">{item.notes}</p>}
                        {showingAi && aiReasons.get(item.id) && (
                          <p className="flex items-center gap-1.5 text-sm text-primary">
                            <Sparkles className="h-3.5 w-3.5 shrink-0" /> {aiReasons.get(item.id)}
                          </p>
                        )}
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
        description="Describe what you need and AI will find matching listings, or filter by keyword."
        trigger={(
          <Button
            size="3"
            className="fixed bottom-6 right-6 z-[100] rounded-full px-5 shadow-xl"
          >
            <Search className="h-5 w-5" /> Search Food
          </Button>
        )}
      >
          <Tabs.Root value={searchMode} onValueChange={value => setSearchMode(value as 'ai' | 'keyword')}>
            <Tabs.List>
              <Tabs.Trigger value="ai"><Sparkles className="mr-1.5 h-4 w-4" /> Ask AI</Tabs.Trigger>
              <Tabs.Trigger value="keyword"><Search className="mr-1.5 h-4 w-4" /> Keyword</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="ai" className="pt-4">
              <form
                onSubmit={event => {
                  event.preventDefault();
                  runAiSearch();
                }}
              >
                <TextArea
                  autoFocus
                  size="3"
                  maxLength={300}
                  placeholder="e.g. Dinner for 5 people, halal, one of us has a nut allergy"
                  value={aiQuery}
                  onChange={event => setAiQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      runAiSearch();
                    }
                  }}
                  disabled={aiSearching}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {AI_EXAMPLES.map(example => (
                    <Button
                      key={example}
                      type="button"
                      size="1"
                      variant="soft"
                      color="gray"
                      disabled={aiSearching}
                      onClick={() => runAiSearch(example)}
                    >
                      {example}
                    </Button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={aiSearching || !aiQuery.trim()}>
                    {aiSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {aiSearching ? 'Searching...' : 'Search with AI'}
                  </Button>
                </div>
              </form>

              {aiResult && !aiSearching && (
                <div className="mt-4 space-y-3 rounded-lg border border-primary/20 bg-muted/30 p-4">
                  {aiResult.summary && <p className="text-sm text-foreground">{aiResult.summary}</p>}
                  {(aiResult.filters.categories.length > 0 || aiResult.filters.mustHaveTags.length > 0 || aiResult.filters.avoidTags.length > 0 || aiResult.filters.maxMiles != null) && (
                    <div className="flex flex-wrap gap-1.5">
                      {aiResult.filters.categories.map(category => (
                        <Badge key={category} size="1" variant="soft">{categoryLabel(category)}</Badge>
                      ))}
                      {aiResult.filters.mustHaveTags.map(tag => (
                        <Badge key={tag} size="1" variant="soft" color="green">{tagLabel(tag)}</Badge>
                      ))}
                      {aiResult.filters.avoidTags.map(tag => (
                        <Badge key={tag} size="1" variant="soft" color="red">No {tagLabel(tag).toLowerCase()}</Badge>
                      ))}
                      {aiResult.filters.maxMiles != null && (
                        <Badge size="1" variant="soft" color="blue">Within {formatMiles(aiResult.filters.maxMiles)}</Badge>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="whitespace-nowrap text-sm text-muted-foreground">
                      {aiMatches.length} {aiMatches.length === 1 ? 'match' : 'matches'} found
                    </p>
                    <ModalClose>
                      <Button
                        type="button"
                        disabled={aiMatches.length === 0}
                        onClick={() => {
                          setAiApplied(true);
                          setSortOrder('match');
                        }}
                      >
                        View Results
                      </Button>
                    </ModalClose>
                  </div>
                </div>
              )}
            </Tabs.Content>

            <Tabs.Content value="keyword" className="pt-4">
              <TextField.Root
                size="3"
                placeholder="Search by food, category, tag, or location..."
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
              >
                <TextField.Slot>
                  <Search className="h-4 w-4 text-muted-foreground" />
                </TextField.Slot>
              </TextField.Root>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {keywordMatches.length} {keywordMatches.length === 1 ? 'listing' : 'listings'} found
                </p>
                <div className="flex gap-3">
                  {searchTerm && (
                    <Button type="button" variant="ghost" onClick={() => setSearchTerm('')}>Clear</Button>
                  )}
                  <ModalClose>
                    <Button type="button" onClick={() => setAiApplied(false)}>View Results</Button>
                  </ModalClose>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
      </AppModal>
    </div>
  );
};

export default ReceiverDashboard;
