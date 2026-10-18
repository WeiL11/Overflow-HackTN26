import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { full_name: string; role: string } | null;
  loading: boolean;
  updateProfileName: (fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  updateProfileName: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);
