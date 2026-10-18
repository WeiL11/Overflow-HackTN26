import type { Session, User } from '@supabase/supabase-js';

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { full_name: string; role: string } | null;
  loading: boolean;
  updateProfileName: (fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}
