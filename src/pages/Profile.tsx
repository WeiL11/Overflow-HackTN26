import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Text, TextField } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import { UserRound } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { APP_NAME } from '@/config/brand';
import { useAuth } from '@/lib/auth';

export default function Profile() {
  const { user, profile, loading, updateProfileName } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);

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
      toast.error(error instanceof Error ? error.message : 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main className="container mx-auto min-h-0 max-w-xl flex-1 overflow-y-auto px-4 py-10">
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
      </main>
    </div>
  );
}
