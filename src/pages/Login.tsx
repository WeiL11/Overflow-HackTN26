import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button, Card, Text, TextField } from '@radix-ui/themes';
import { toast } from 'react-toastify';
import Navbar from '@/components/Navbar';
import { Utensils } from 'lucide-react';
import { APP_NAME } from '@/config/brand';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      // Profile will be loaded by AuthProvider, redirect based on role
      const { data } = await supabase.from('profiles').select('role').eq('user_id', (await supabase.auth.getUser()).data.user!.id).single();
      navigate(data?.role === 'receiver' ? '/receiver' : '/donor');
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
            <h2 className="font-heading text-2xl">Welcome Back</h2>
            <p className="text-sm text-muted-foreground">Sign in to your {APP_NAME} account</p>
          </div>
          <div className="p-6 pt-0">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="email">Email</Text>
                <TextField.Root id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Text as="label" size="2" weight="medium" htmlFor="password">Password</Text>
                <TextField.Root id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary font-medium hover:underline">Sign up</Link>
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Login;
