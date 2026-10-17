import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { analyzeFoodPhoto, detectCurrentAddress, resizeImage, toDatetimeLocal } from '@/lib/foodPhoto';
import { geocodeAddress, type LatLng } from '@/lib/geo';
import ListingPhoto from '@/components/ListingPhoto';
import type { Json } from '@/integrations/supabase/types';
import Navbar from '@/components/Navbar';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import ListingTimeline, { type ListingStage } from '@/components/ListingTimeline';
import { Badge, Button, Card, Dialog, Text, TextField, type BadgeProps } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import { Plus, Package, MapPin, Trash2, CheckCircle, XCircle, User, Building2, Camera, Sparkles, Loader2, Check } from 'lucide-react';

interface FoodListing {
  photo_path: string | null;
  food_analysis: Json | null;
  id: string;
  food_name: string;
  quantity: number;
  location: string;
  expiry_time: string;
  status: string;
  created_at: string;
}

interface FoodRequest {
  id: string;
  listing_id: string;
  receiver_id: string;
  status: string;
  quantity: number;
  notes: string | null;
  created_at: string;
}

interface ReceiverProfile {
  user_id: string;
  full_name: string;
  role: string;
}

export default function DonorDashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [receiverProfiles, setReceiverProfiles] = useState<Map<string, ReceiverProfile>>(new Map());
  const [showForm, setShowForm] = useState(false);
  const [foodName, setFoodName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState('');
  const [expiryTime, setExpiryTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<import('@/integrations/supabase/types').Json | null>(null);
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
    setPhotoPreview(null);
    setPhoto(null);
    setAnalysis(null);
    setAiFilled(false);
    setAnalysisError('');
    setLocationSource(null);
    setGpsFill(null);
  };

  // Pre-fill the pickup location when the form opens; the donor must confirm it.
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
      } else if (listings[0]?.location) {
        setLocation(current => current || listings[0].location);
        setLocationSource('previous');
      }
    })();
    return () => { cancelled = true; };
  }, [showForm]);

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

  const fetchListings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('food_listings')
      .select('*')
      .eq('donor_id', user.id)
      .order('created_at', { ascending: false });
    setListings(data || []);
  };

  const fetchRequests = async () => {
    if (!user) return;
    // Get all listings by this donor, then get requests for those listings
    const { data: myListings } = await supabase
      .from('food_listings')
      .select('id')
      .eq('donor_id', user.id);
    if (!myListings || myListings.length === 0) {
      setRequests([]);
      return;
    }
    const listingIds = myListings.map(l => l.id);
    const { data } = await supabase
      .from('food_requests')
      .select('*')
      .in('listing_id', listingIds)
      .order('created_at', { ascending: false });
    const reqs = data || [];
    setRequests(reqs);

    // Fetch receiver profiles to identify NGOs
    const receiverIds = [...new Set(reqs.map(r => r.receiver_id))];
    if (receiverIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, role')
        .in('user_id', receiverIds);
      const map = new Map<string, ReceiverProfile>();
      (profiles || []).forEach((p: ReceiverProfile) => map.set(p.user_id, p));
      setReceiverProfiles(map);
    }
  };

  useEffect(() => {
    if (user) {
      fetchListings();
      fetchRequests();
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitting || analyzing) return;
    if (!Number.isFinite(new Date(expiryTime).getTime()) || new Date(expiryTime).getTime() <= Date.now()) {
      toast.error("Choose a future availability time.");
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
    let photoPath: string | null = null;
    try {
      if (photo) {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photo.type];
        photoPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from('food-photos').upload(photoPath, photo);
        if (error) throw error;
      }
      // Pin the listing on the receivers' map: GPS if the donor kept the detected address, else look it up.
      const position = gpsFill?.address === location ? gpsFill.position : await geocodeAddress(location);
      const { error } = await supabase.from('food_listings').insert({
        donor_id: user.id, food_name: foodName, quantity: parsedQuantity, location,
        latitude: position?.lat ?? null,
        longitude: position?.lng ?? null,
        expiry_time: new Date(expiryTime).toISOString(),
        photo_path: photoPath,
        food_analysis: analysis,
      });
      if (error) throw error;
      toast.success('Food listing added!');
      resetForm();
      setShowForm(false);
      fetchListings();
    } catch (error) {
      if (photoPath) await supabase.storage.from('food-photos').remove([photoPath]);
      toast.error(error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not save listing. Please retry.');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('food_listings').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Listing removed');
      fetchListings();
      fetchRequests();
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    const { error } = await supabase.rpc('respond_to_food_request', {
      p_request_id: requestId,
      p_status: 'accepted',
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Request accepted!');
    fetchListings();
    fetchRequests();
  };

  const handleRejectRequest = async (requestId: string) => {
    const { error } = await supabase.rpc('respond_to_food_request', {
      p_request_id: requestId,
      p_status: 'rejected',
    });
    if (error) toast.error(error.message);
    else {
      toast.success('Request rejected');
      fetchListings();
      fetchRequests();
    }
  };

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
              const timelineStage: ListingStage = item.status === 'completed'
                ? 'completed'
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
                                <Badge
                                  color={req.status === 'accepted' ? 'green' : req.status === 'rejected' ? 'red' : 'gray'}
                                  variant={req.status === 'accepted' || req.status === 'rejected' ? 'solid' : 'soft'}
                                  className="text-xs"
                                >
                                  {req.status}
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
      <Dialog.Root open={showForm} onOpenChange={open => { if (submitting || analyzing) return; setShowForm(open); if (!open) resetForm(); }}>
        <Dialog.Trigger>
          <Button
            size="3"
            disabled={submitting || analyzing}
            className="fixed bottom-6 right-6 z-[100] rounded-full px-5 shadow-xl"
          >
            <Plus className="h-5 w-5" /> Add Food
          </Button>
        </Dialog.Trigger>
        <Dialog.Content maxWidth="640px">
          <Dialog.Title className="font-heading">New Food Listing</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Share available food with recipients in your community.
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Food photo"
              disabled={submitting || analyzing}
              capture="environment"
              className="hidden"
              onChange={e => handlePhoto(e.target.files?.[0])}
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
                  onChange={e => { setLocation(e.target.value); setLocationSource(null); }}
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
                <Text as="label" size="2" weight="medium" htmlFor="expiry">Available Until</Text>
                <TextField.Root id="expiry" type="datetime-local" value={expiryTime} onChange={e => setExpiryTime(e.target.value)} required min={toDatetimeLocal(new Date())} />
              </div>
            </div>
            {aiFilled && (
              <Text as="p" size="1" color="gray" className="flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Suggested by AI from your photo. Please double-check before posting.
              </Text>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close>
                <Button type="button" variant="outline" disabled={submitting || analyzing}>Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={submitting || analyzing}>{submitting ? 'Adding...' : 'Add Listing'}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
