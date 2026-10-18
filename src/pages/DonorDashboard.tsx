import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { geocodeAddress, type LatLng } from '@/lib/geo';
import ListingPhoto from '@/components/ListingPhoto';
import type { Json } from '@/integrations/supabase/types';
import { analyzeFoodPhoto, detectCurrentAddress, resizeImage, toDatetimeLocal } from '@/lib/foodPhoto';
import Navbar from '@/components/Navbar';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import ListingTimeline, { type ListingStage } from '@/components/ListingTimeline';
import AppModal, { ModalClose } from '@/components/AppModal';
import type { FoodListing, FoodRequest, ProfileSummary } from '@/types/food';
import { advanceFoodRequest, createFoodListing, deleteFoodListing, getDonorListings, getProfilesByUserIds, getRequestsForListings, rejectFoodRequest } from '@/services/food';
import { Badge, Button, Card, Text, TextArea, TextField, type BadgeProps } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import { Plus, Package, MapPin, Trash2, CheckCircle, XCircle, User, Building2, Camera, Sparkles, Loader2, Check } from 'lucide-react';

// Listings are timed by pickup deadline (closing time or last pickup), not food expiry.
const MAX_PICKUP_WINDOW_MS = 24 * 60 * 60 * 1000;

const DonorDashboard = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [receiverProfiles, setReceiverProfiles] = useState<Map<string, ProfileSummary>>(new Map());
  const [showForm, setShowForm] = useState(false);
  const [foodName, setFoodName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState('');
  const [expiryTime, setExpiryTime] = useState('');
  const [listingNotes, setListingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Json | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [aiFilled, setAiFilled] = useState(false);
  const [locationSource, setLocationSource] = useState<'gps' | 'previous' | null>(null);
  const [gpsFill, setGpsFill] = useState<{ address: string; position: LatLng } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const resetForm = () => {
    setFoodName('');
    setQuantity('');
    setLocation('');
    setExpiryTime('');
    setListingNotes('');
    setPhotoPreview(null);
    setPhoto(null);
    setAnalysis(null);
    setAiFilled(false);
    setAnalysisError('');
    setLocationSource(null);
    setGpsFill(null);
  };

  const previousLocation = listings[0]?.location;

  useEffect(() => {
    if (!showForm || location) return;
    let cancelled = false;
    (async () => {
      const detected = await detectCurrentAddress();
      if (cancelled) return;
      if (detected) {
        setLocation(current => current || detected.address);
        setGpsFill(detected);
        setLocationSource('gps');
      } else if (previousLocation) {
        setLocation(current => current || previousLocation);
        setLocationSource('previous');
      }
    })();
    return () => { cancelled = true; };
  }, [showForm, location, previousLocation]);

  const runAnalysis = async (image: string) => {
    setAnalyzing(true);
    setAnalysisError('');
    setAnalysis(null);
    setAiFilled(false);
    try {
      const suggestion = await analyzeFoodPhoto(image);
      setAnalysis({ ...suggestion });
      if (!suggestion.isFood) {
        setAnalysisError("No recognizable food detected. Try a clearer photo or enter details manually.");
        return;
      }
      setFoodName(suggestion.foodName);
      if (suggestion.quantity !== null) setQuantity(String(suggestion.quantity));
      setAiFilled(true);
      toast.success('Photo analyzed. Review the suggested details.');
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Photo analysis failed.');
    } finally { setAnalyzing(false); }
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file || analyzing || submitting) return;
    setAnalysisError('');
    setAnalyzing(true);
    try {
      const image = await resizeImage(file);
      setAnalysis(null); setAiFilled(false);
      setPhotoPreview(image);
      const resizedPhoto = await (await fetch(image)).blob();
      setPhoto(new File([resizedPhoto], 'food.jpg', { type: 'image/jpeg' }));
      await runAnalysis(image);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Could not read this photo.');
    } finally {
      setAnalyzing(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const donorId = user?.id;

  const fetchListings = useCallback(async () => {
    if (!donorId) return;
    try {
      setListings(await getDonorListings(donorId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load listings.');
    }
  }, [donorId]);

  const fetchRequests = useCallback(async () => {
    if (!donorId) return;
    try {
      // Get all listings by this donor, then get requests for those listings
      const myListings = await getDonorListings(donorId);
      const reqs = await getRequestsForListings(myListings.map(listing => listing.id));
      setRequests(reqs);

      // Fetch receiver profiles to identify NGOs
      const receiverIds = [...new Set(reqs.map(r => r.receiver_id))];
      if (receiverIds.length > 0) {
        const profiles = await getProfilesByUserIds(receiverIds);
        const map = new Map<string, ProfileSummary>();
        profiles.forEach(profile => map.set(profile.user_id, profile));
        setReceiverProfiles(map);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load requests.');
    }
  }, [donorId]);

  useEffect(() => {
    if (user) {
      fetchListings();
      fetchRequests();
    }
  }, [fetchListings, fetchRequests, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitting || analyzing) return;
    const pickupBy = new Date(expiryTime).getTime();
    if (!Number.isFinite(pickupBy) || pickupBy <= Date.now()) {
      toast.error('Choose a future pickup time.');
      return;
    }
    if (pickupBy > Date.now() + MAX_PICKUP_WINDOW_MS) {
      toast.error('Pickup must be within the next 24 hours.');
      return;
    }
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0 || Number(quantity) !== parsedQuantity) {
      toast.error('Quantity must be a positive whole number.');
      return;
    }
    if (locationSource) {
      toast.info('Please confirm the pickup location.');
      locationInputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      // Pin the listing on the receivers' map: GPS if the donor kept the detected address, else look it up.
      const position = gpsFill?.address === location ? gpsFill.position : await geocodeAddress(location);
      await createFoodListing({
        donor_id: user.id,
        food_name: foodName,
        quantity: parsedQuantity,
        location,
        latitude: position?.lat ?? null,
        longitude: position?.lng ?? null,
        expiry_time: new Date(expiryTime).toISOString(),
        notes: listingNotes.trim() || null,
        food_analysis: analysis,
      }, photo || undefined);
      toast.success('Food listing added!');
      resetForm();
      setShowForm(false);
      fetchListings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFoodListing(id);
      toast.success('Listing removed');
      fetchListings();
      fetchRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove listing.');
    }
  };

  const handleAdvanceRequest = async (requestId: string, direction: 'forward' | 'back') => {
    try {
      await advanceFoodRequest(requestId, direction);
      toast.success(direction === 'forward' ? 'Request advanced.' : 'Request moved back.');
      fetchListings();
      fetchRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update request.');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectFoodRequest(requestId);
      toast.success('Request rejected');
      fetchListings();
      fetchRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reject request.');
    }
  };

  const handleAcceptRequest = (requestId: string) => handleAdvanceRequest(requestId, 'forward');
  const handleBackRequest = (requestId: string) => handleAdvanceRequest(requestId, 'back');

  const getRequestsForListing = (listingId: string) => {
    const reqs = requests.filter(r => r.listing_id === listingId);
    // Sort NGO requests to the top
    return reqs.sort((a, b) => {
      const aIsNgo = receiverProfiles.get(a.receiver_id)?.role === 'ngo' ? 1 : 0;
      const bIsNgo = receiverProfiles.get(b.receiver_id)?.role === 'ngo' ? 1 : 0;
      return bIsNgo - aIsNgo;
    });
  };

  const statusColor = (status: string): Pick<BadgeProps, 'color' | 'variant'> => {
    switch (status) {
      case 'available': return { color: 'green', variant: 'solid' };
      case 'requested': return { color: 'gray', variant: 'soft' };
      case 'completed': return { color: 'gray', variant: 'outline' };
      default: return { color: 'gray', variant: 'soft' };
    }
  };

  const requestStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Requested';
      case 'pending_pickup': return 'Pending Pickup';
      case 'completed': return 'Done';
      case 'rejected': return 'Rejected';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const requestStatusColor = (status: string): Pick<BadgeProps, 'color' | 'variant'> => {
    switch (status) {
      case 'pending': return { color: 'amber', variant: 'soft' };
      case 'pending_pickup': return { color: 'blue', variant: 'soft' };
      case 'completed': return { color: 'green', variant: 'solid' };
      case 'rejected': return { color: 'red', variant: 'solid' };
      case 'cancelled': return { color: 'gray', variant: 'soft' };
      default: return { color: 'gray', variant: 'soft' };
    }
  };

  const donorName = profile?.full_name?.split(' ')[0] || 'there';
  const availableListings = listings.filter(item => item.status === 'available').length;
  const pendingRequestCount = requests.filter(request => request.status === 'pending').length;

  if (authLoading) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-5xl px-4 py-10">
        <section className="hero-gradient mb-6 rounded-2xl p-6 text-primary-foreground md:p-8">
          <div>
            <Badge color="green" variant="soft" className="mb-3 bg-background/90 text-primary">
              Donor workspace
            </Badge>
            <h1 className="text-3xl font-heading font-bold">Hi, {donorName}</h1>
            <p className="mt-1 text-primary-foreground/85">Manage donations and respond to community requests.</p>
          </div>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Donation summary">
          <Card className="border-l-4 border-l-primary p-5">
            <p className="text-sm font-medium text-muted-foreground">Total donations</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{listings.length}</p>
          </Card>
          <Card className="border-l-4 border-l-emerald-500 p-5">
            <p className="text-sm font-medium text-muted-foreground">Available now</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{availableListings}</p>
          </Card>
          <Card className="border-l-4 border-l-amber-500 p-5">
            <p className="text-sm font-medium text-muted-foreground">Pending requests</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{pendingRequestCount}</p>
          </Card>
        </section>

        {listings.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>No food listings yet. Click "Add Food" to get started!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map(item => {
              const itemRequests = getRequestsForListing(item.id);
              const pendingRequests = itemRequests.filter(r => r.status === 'pending');
              const timelineStage: ListingStage = itemRequests.some(request => request.status === 'completed')
                ? 'completed'
                : itemRequests.some(request => request.status === 'pending_pickup')
                  ? 'pending_pickup'
                  : pendingRequests.length > 0 || item.status === 'requested'
                    ? 'requested'
                    : 'available';
              return (
                <Card key={item.id} className="card-shadow hover:card-shadow-hover transition-shadow">
                  <div className="p-5">
                    <ListingPhoto path={item.photo_path} analysis={item.food_analysis} name={item.food_name} />
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground text-lg">{item.food_name}</h3>
                          <Badge {...statusColor(item.status)}>
                            {item.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{item.quantity} items</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
                          <ExpiryCountdown expiryTime={item.expiry_time} />
                        </div>
                        {item.notes && <p className="mt-3 text-sm text-muted-foreground">{item.notes}</p>}
                      </div>
                      <Button variant="ghost" size="1" onClick={() => handleDelete(item.id)} className="shrink-0">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    {/* Incoming requests section */}
                    {itemRequests.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm font-medium text-foreground mb-2">
                          Requests ({pendingRequests.length} pending)
                        </p>
                        <div className="space-y-2">
                            {itemRequests.map(req => {
                              const profile = receiverProfiles.get(req.receiver_id);
                              const isNgo = profile?.role === 'ngo';
                              return (
                            <div key={req.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${isNgo ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'}`}>
                              <div className="flex items-center gap-2 text-sm">
                                {isNgo ? <Building2 className="h-3.5 w-3.5 text-primary" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                                <div className="flex flex-col">
                                  <span className={isNgo ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                                    {profile?.full_name || `Receiver ${req.receiver_id.slice(0, 8)}...`}
                                  </span>
                                  <span className="text-xs text-muted-foreground">Requested: {req.quantity} items</span>
                                  {req.notes && (
                                    <span className="text-xs italic text-muted-foreground">“{req.notes}”</span>
                                  )}
                                </div>
                                {isNgo && (
                                  <Badge color="green" variant="soft" className="text-xs bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">
                                    NGO Priority
                                  </Badge>
                                )}
                                <Badge {...requestStatusColor(req.status)} className="text-xs">
                                  {requestStatusLabel(req.status)}
                                </Badge>
                              </div>
                              {req.status === 'pending' && (
                                <div className="flex gap-1">
                                  <Button
                                    size="2"
                                    variant="ghost"
                                    className="h-7 px-2 text-primary hover:text-primary"
                                    onClick={() => handleAcceptRequest(req.id)}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" /> Accept
                                  </Button>
                                  <Button
                                    size="2"
                                    variant="ghost"
                                    className="h-7 px-2 text-destructive hover:text-destructive"
                                    onClick={() => handleRejectRequest(req.id)}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" /> Reject
                                  </Button>
                                </div>
                              )}
                              {req.status === 'pending_pickup' && (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {req.pickup_confirmed_at ? 'Pickup confirmed' : 'Awaiting pickup confirmation'}
                                  </span>
                                  <Button size="2" variant="ghost" className="h-7 px-2" onClick={() => handleBackRequest(req.id)}>
                                    Back
                                  </Button>
                                  <Button size="2" variant="ghost" className="h-7 px-2 text-primary hover:text-primary" disabled={!req.pickup_confirmed_at} onClick={() => handleAdvanceRequest(req.id, 'forward')}>
                                    Mark Done
                                  </Button>
                                  {!req.pickup_confirmed_at && (
                                    <Button size="2" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleRejectRequest(req.id)}>
                                      <XCircle className="h-4 w-4 mr-1" /> Reject
                                    </Button>
                                  )}
                                </div>
                              )}
                              {req.status === 'completed' && (
                                <Button size="2" variant="ghost" className="h-7 px-2" onClick={() => handleBackRequest(req.id)}>
                                  Back
                                </Button>
                              )}
                            </div>
                              );
                            })}
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
        open={showForm}
        onOpenChange={open => { if (!open && (submitting || analyzing)) return; setShowForm(open); if (!open) resetForm(); }}
        maxWidth="640px"
        title="New Food Listing"
        description="Share available food with recipients in your community."
        trigger={(
          <Button size="3" className="fixed bottom-6 right-6 z-[100] rounded-full px-5 shadow-xl">
            <Plus className="h-5 w-5" /> Add Food
          </Button>
        )}
      >
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Food photo"
              disabled={submitting || analyzing}
              capture="environment"
              className="hidden"
              onChange={event => handlePhoto(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={submitting || analyzing}
              className="flex w-full items-center gap-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/10 disabled:cursor-wait"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Food photo" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Camera className="h-7 w-7 text-primary" />
                </span>
              )}
              <span className="flex-1">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  {analyzing ? (
                    <><Loader2 className="h-4 w-4 animate-spin text-primary" /> Analyzing photo…</>
                  ) : (
                    <><Sparkles className="h-4 w-4 text-primary" /> {photoPreview ? 'Use a different photo' : 'Snap or upload a photo'}</>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  AI suggests food details. Review all suggestions and confirm quantity and availability. Photos may be sent to Google Gemini.
                </span>
              </span>
            </button>
            {analysisError && <p role="alert" className="text-sm text-red-600">{analysisError}</p>}
            {photoPreview && <div className="flex gap-3">
              <Button type="button" variant="soft" disabled={analyzing || submitting} onClick={() => runAnalysis(photoPreview)}>Retry analysis</Button>
              <Button type="button" variant="outline" disabled={analyzing || submitting} onClick={() => {
                setPhoto(null); setPhotoPreview(null); setAnalysis(null); setAiFilled(false); setAnalysisError('');
              }}>Remove photo</Button>
            </div>}
            {analysis && typeof analysis === 'object' && !Array.isArray(analysis) && typeof analysis.description === 'string' && <p role="status" className="text-sm text-muted-foreground">{analysis.description}</p>}
            <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP, up to 5 MB. A photo cannot confirm food safety, allergens, or expiry. Set availability yourself.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="foodName">Food Name</Text>
                <TextField.Root id="foodName" value={foodName} onChange={e => setFoodName(e.target.value)} required placeholder="e.g. Rice, Bread, Fruits" />
              </div>
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="quantity">Quantity</Text>
                <TextField.Root id="quantity" type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required placeholder="e.g. 5" />
              </div>
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="location">Pickup Location</Text>
                <TextField.Root
                  ref={locationInputRef}
                  id="location"
                  value={location}
                  onChange={event => { setLocation(event.target.value); setLocationSource(null); }}
                  required
                  placeholder="e.g. 123 Main St, Downtown"
                  color={locationSource ? 'amber' : undefined}
                />
                {locationSource && (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {locationSource === 'gps' ? 'Filled from your current location.' : 'Filled from your last donation.'} Is this right?
                    </span>
                    <Button type="button" size="1" variant="soft" color="amber" onClick={() => setLocationSource(null)}>
                      <Check className="h-3.5 w-3.5" /> Confirm
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="expiry">Pick Up By</Text>
                <TextField.Root id="expiry" type="datetime-local" value={expiryTime} onChange={e => setExpiryTime(e.target.value)} required min={toDatetimeLocal(new Date())} max={toDatetimeLocal(new Date(Date.now() + MAX_PICKUP_WINDOW_MS))} />
                <Text as="p" size="1" color="gray">Your closing time or the last time someone can pick up, within the next 24 hours.</Text>
              </div>
            </div>
            {aiFilled && (
              <Text as="p" size="1" color="gray" className="flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Suggested by AI from your photo. Please double-check before posting.
              </Text>
            )}
            <div className="space-y-2">
              <Text as="label" size="2" weight="medium" htmlFor="listingNotes">Notes (optional)</Text>
              <TextArea
                id="listingNotes"
                className="resize-y"
                maxLength={1000}
                placeholder="Add pickup details, allergens, storage instructions, or other helpful information..."
                value={listingNotes}
                onChange={event => setListingNotes(event.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <ModalClose>
                <Button type="button" variant="outline" disabled={submitting}>Cancel</Button>
              </ModalClose>
              <Button type="submit" disabled={submitting}>{submitting ? 'Adding...' : 'Add Listing'}</Button>
            </div>
          </form>
      </AppModal>
    </div>
  );
};

export default DonorDashboard;
