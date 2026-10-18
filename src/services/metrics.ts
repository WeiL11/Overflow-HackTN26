import { supabase } from '@/integrations/supabase/client';
import type { ImpactMetrics } from '@/types/metrics';

export const getPublicImpactMetrics = async (): Promise<ImpactMetrics> => {
  const { data, error } = await supabase.rpc('get_public_impact_metrics');
  if (error) throw error;
  const metrics = data?.[0];
  return {
    totalDonors: Number(metrics?.total_donors ?? 0),
    totalRecipients: Number(metrics?.total_recipients ?? 0),
    totalMealsSaved: Number(metrics?.total_meals_saved ?? 0),
  };
};
