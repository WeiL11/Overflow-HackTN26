import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-toastify';
import { Plus, Package, MapPin, Trash2, CheckCircle, XCircle, User, Building2 } from 'lucide-react';

interface FoodListing {
  id: string;
  food_name: string;
  quantity: string;
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
  created_at: string;
}

interface ReceiverProfile {
  user_id: string;
  full_name: string;
  role: string;
}

export default function DonorDashboard() {
  const { user, loading: authLoading } = useAuth();
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

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

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
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from('food_listings').insert({
      donor_id: user.id,
      food_name: foodName,
      quantity,
      location,
      expiry_time: new Date(expiryTime).toISOString(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Food listing added!');
      setFoodName('');
      setQuantity('');
      setLocation('');
      setExpiryTime('');
      setShowForm(false);
      fetchListings();
    }
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

  const handleAcceptRequest = async (requestId: string, listingId: string) => {
    // Update request status to accepted
    const { error: reqError } = await supabase
      .from('food_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);
    if (reqError) {
      toast.error(reqError.message);
      return;
    }
    // Update listing status to completed
    const { error: listError } = await supabase
      .from('food_listings')
      .update({ status: 'completed' })
      .eq('id', listingId);
    if (listError) {
      toast.error(listError.message);
      return;
    }
    // Reject all other pending requests for this listing
    await supabase
      .from('food_requests')
      .update({ status: 'rejected' })
      .eq('listing_id', listingId)
      .neq('id', requestId)
      .eq('status', 'pending');

    toast.success('Request accepted!');
    fetchListings();
    fetchRequests();
  };

  const handleRejectRequest = async (requestId: string) => {
    const { error } = await supabase
      .from('food_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);
    if (error) toast.error(error.message);
    else {
      toast.success('Request rejected');
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

  const statusColor = (status: string) => {
    switch (status) {
      case 'available': return 'default' as const;
      case 'requested': return 'secondary' as const;
      case 'completed': return 'outline' as const;
      default: return 'secondary' as const;
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Donor Dashboard</h1>
            <p className="text-muted-foreground">Manage your food donations</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Add Food
          </Button>
        </div>

        {showForm && (
          <Card className="mb-8 card-shadow">
            <CardHeader>
              <CardTitle className="font-heading text-xl">New Food Listing</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="foodName">Food Name</Label>
                    <Input id="foodName" value={foodName} onChange={e => setFoodName(e.target.value)} required placeholder="e.g. Rice, Bread, Fruits" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" value={quantity} onChange={e => setQuantity(e.target.value)} required placeholder="e.g. 5 kg, 10 packs" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Pickup Location</Label>
                    <Input id="location" value={location} onChange={e => setLocation(e.target.value)} required placeholder="e.g. 123 Main St, Downtown" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiry">Available Until</Label>
                    <Input
                      id="expiry"
                      type="datetime-local"
                      value={expiryTime}
                      onChange={e => setExpiryTime(e.target.value)}
                      required
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button type="submit" disabled={submitting}>{submitting ? 'Adding...' : 'Add Listing'}</Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

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
              return (
                <Card key={item.id} className="card-shadow hover:card-shadow-hover transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground text-lg">{item.food_name}</h3>
                          <Badge variant={statusColor(item.status)}>
                            {item.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{item.quantity}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
                          <ExpiryCountdown expiryTime={item.expiry_time} />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="shrink-0">
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
                                <span className={isNgo ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                                  {profile?.full_name || `Receiver ${req.receiver_id.slice(0, 8)}...`}
                                </span>
                                {isNgo && (
                                  <Badge className="text-xs bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">
                                    NGO Priority
                                  </Badge>
                                )}
                                <Badge variant={
                                  req.status === 'accepted' ? 'default' :
                                  req.status === 'rejected' ? 'destructive' :
                                  'secondary'
                                } className="text-xs">
                                  {req.status}
                                </Badge>
                              </div>
                              {req.status === 'pending' && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-primary hover:text-primary"
                                    onClick={() => handleAcceptRequest(req.id, req.listing_id)}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" /> Accept
                                  </Button>
                                  <Button
                                    size="sm"
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
