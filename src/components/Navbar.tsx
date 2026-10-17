import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@radix-ui/themes';
import { useAuth } from '@/lib/auth';
import { Leaf, LogOut, UserRound } from 'lucide-react';
import { APP_NAME } from '@/config/brand';

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className="z-50 shrink-0 border-b border-primary-foreground/20 bg-primary/95 text-primary-foreground backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold font-heading text-primary-foreground">
          <Leaf className="h-6 w-6" />
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to={profile?.role === 'donor' ? '/donor' : '/receiver'}>
                <Button variant="ghost" size="2" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">Dashboard</Button>
              </Link>
              <Link to="/profile">
                <Button variant="ghost" size="2" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                  <UserRound className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">{profile?.full_name || user.email}</span>
                </Button>
              </Link>
              <Button variant="outline" size="2" className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-1" /> Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="2" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">Log In</Button>
              </Link>
              <Link to="/signup">
                <Button size="2" className="bg-background text-primary hover:bg-background/90">Sign Up</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
