import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Package, MapPin, Search, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface FoodListing {
  id: string;
  food_name: string;
  quantity: string;
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
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [myRequests, setMyRequests] = useState<Map<string, string>>(new Map());
  const [requesting, setRequesting] = useState<string | null>(null);

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
    setRequesting(listingId);

    // Insert the request
    const { error: reqError } = await supabase.from('food_requests').insert({
      listing_id: listingId,
      receiver_id: user.id,
    });
    if (reqError) {
      setRequesting(null);
      toast.error(reqError.message.includes('duplicate') ? 'Already requested' : reqError.message);
      return;
    }

    setRequesting(null);
    toast.success('Food requested! The donor will be notified.');
    setMyRequests(prev => new Map(prev).set(listingId, 'pending'));
  };

  const filtered = listings.filter(l =>
    l.food_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold text-foreground">Available Food</h1>
          <p className="text-muted-foreground">Browse and request food near you</p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search by food name or location..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

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
              return (
                <Card key={item.id} className="card-shadow hover:card-shadow-hover transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <h3 className="font-semibold text-foreground text-lg">{item.food_name}</h3>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{item.quantity}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
                          <ExpiryCountdown expiryTime={item.expiry_time} />
                        </div>
                      </div>
                      <div className="shrink-0">
                        {hasRequested ? (
                          <Badge variant={requestStatus === 'accepted' ? 'default' : 'secondary'} className="flex items-center gap-1">
                            {requestStatus === 'accepted' && <CheckCircle className="h-3 w-3" />}
                            {requestStatus === 'pending' ? 'Requested' : requestStatus === 'accepted' ? 'Accepted' : 'Rejected'}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            disabled={requesting === item.id}
                            onClick={() => handleRequest(item.id)}
                          >
                            {requesting === item.id ? 'Requesting...' : 'Request Food'}
                          </Button>
                        )}
                      </div>
                    </div>
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
