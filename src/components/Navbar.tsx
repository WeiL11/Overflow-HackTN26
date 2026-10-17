import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { Leaf, LogOut } from 'lucide-react';
import { APP_NAME } from '@/config/brand';

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold font-heading text-primary">
          <Leaf className="h-6 w-6" />
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to={profile?.role === 'donor' ? '/donor' : '/receiver'}>
                <Button variant="ghost" size="sm">Dashboard</Button>
              </Link>
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {profile?.full_name || user.email}
              </span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-1" /> Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">Log In</Button>
              </Link>
              <Link to="/signup">
                <Button size="sm">Sign Up</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
