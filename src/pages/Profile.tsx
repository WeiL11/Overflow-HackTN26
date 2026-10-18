import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Text, TextField } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import { HandHeart, ShoppingBasket, UserRound } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { MyDonations, MyFood } from '@/components/ProfileHistory';
import { APP_NAME } from '@/config/brand';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';

const Profile = () => {
  const { user, profile, loading, updateProfileName } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  // ?tab=food or ?tab=donations, so each history list has its own link.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const showTab = (next: 'food' | 'donations') => setSearchParams(tab === next ? {} : { tab: next });

  useEffect(() => {
    setFullName(profile?.full_name || '');
  }, [profile?.full_name]);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim()) {
      toast.error('Name is required.');
      return;
    }
    setSaving(true);
    try {
      await updateProfileName(fullName);
      toast.success('Profile updated.');
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to update profile.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main className="container mx-auto min-h-0 max-w-2xl flex-1 overflow-y-auto px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Manage profile</h1>
            <p className="text-muted-foreground">Update how your name appears across {APP_NAME}.</p>
          </div>
        </div>
        <Card className="p-6 card-shadow">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Text as="label" size="2" weight="medium" htmlFor="fullName">Full name</Text>
              <TextField.Root id="fullName" value={fullName} onChange={event => setFullName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Text as="div" size="2" weight="medium">Email</Text>
              <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{user?.email}</p>
            </div>
            <div className="space-y-2">
              <Text as="div" size="2" weight="medium">Account type</Text>
              <Badge color="green" variant="soft" className="capitalize">{profile?.role || 'member'}</Badge>
            </div>
            <Button type="submit" disabled={saving || !fullName.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </Card>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <Button size="3" variant={tab === 'food' ? 'solid' : 'soft'} onClick={() => showTab('food')}>
            <ShoppingBasket className="h-4 w-4" /> <span className="whitespace-nowrap">My Food</span>
          </Button>
          <Button size="3" variant={tab === 'donations' ? 'solid' : 'soft'} onClick={() => showTab('donations')}>
            <HandHeart className="h-4 w-4" /> <span className="whitespace-nowrap">My Donations</span>
          </Button>
        </div>
        {user && (tab === 'food' || tab === 'donations') && (
          <section className="mt-6" aria-label={tab === 'food' ? 'My Food' : 'My Donations'}>
            <h2 className="mb-1 text-xl font-heading font-bold text-foreground">{tab === 'food' ? 'My Food' : 'My Donations'}</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {tab === 'food' ? 'Food you requested and where each pickup stands.' : 'Food you posted and where each listing stands.'}
            </p>
            {tab === 'food' ? <MyFood userId={user.id} /> : <MyDonations userId={user.id} />}
          </section>
        )}
      </main>
    </div>
  );
};

export default Profile;
