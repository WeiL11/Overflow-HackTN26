import { createContext, useContext } from 'react';
import type { AuthContextType } from '@/types/auth';

export const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  updateProfileName: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);
