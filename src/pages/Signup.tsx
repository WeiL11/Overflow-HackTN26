import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button, Card, Text, TextField } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import Navbar from '@/components/Navbar';
import { Utensils, Heart, Search, Building2 } from 'lucide-react';
import { APP_NAME } from '@/config/brand';

const Signup = () => {
  const [searchParams] = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'donor' | 'receiver' | 'ngo'>(
    (searchParams.get('role') as 'donor' | 'receiver' | 'ngo') || 'donor'
  );
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Account created! Check your email to confirm, or sign in.');
      navigate(role === 'donor' ? '/donor' : '/receiver');
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-20">
        <Card className="w-full max-w-md card-shadow">
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
              <Utensils className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-heading text-2xl">Join {APP_NAME}</h2>
            <p className="text-sm text-muted-foreground">Create your account and start making a difference</p>
          </div>
          <div className="p-6 pt-0">
            {/* Role picker */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setRole('donor')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  role === 'donor' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}
              >
                <Heart className={`h-6 w-6 ${role === 'donor' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${role === 'donor' ? 'text-primary' : 'text-muted-foreground'}`}>Donate</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('receiver')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  role === 'receiver' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}
              >
                <Search className={`h-6 w-6 ${role === 'receiver' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${role === 'receiver' ? 'text-primary' : 'text-muted-foreground'}`}>Find Food</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('ngo')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  role === 'ngo' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}
              >
                <Building2 className={`h-6 w-6 ${role === 'ngo' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${role === 'ngo' ? 'text-primary' : 'text-muted-foreground'}`}>NGO</span>
              </button>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="name">Full Name</Text>
                <TextField.Root id="name" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Jane Doe" />
              </div>
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="email">Email</Text>
                <TextField.Root id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="password">Password</Text>
                <TextField.Root id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link>
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Signup;
