import type { Tables } from '@/integrations/supabase/types';
export type ProfileSummary = Pick<Tables<'profiles'>, 'user_id' | 'full_name'>;
