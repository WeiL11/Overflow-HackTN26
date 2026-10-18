import { supabase } from '@/integrations/supabase/client';
import type { LatLng } from '@/lib/geo';

export interface FoodSearchResult {
  summary: string;
  filters: { categories: string[]; mustHaveTags: string[]; avoidTags: string[]; maxMiles?: number | null };
  results: { id: string; reason: string }[];
  model: string | null;
  requestId: string | null;
  fallback: boolean;
}

// Ask the AI API to match a plain-language need against available listings.
// `near` lets the model use distance ("near me", "within 2 miles").
export async function searchFoodWithAI(query: string, near?: LatLng): Promise<FoodSearchResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/search-food', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ query, near }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'AI search is unavailable right now. Showing keyword matches instead.');
  return body as FoodSearchResult;
}
