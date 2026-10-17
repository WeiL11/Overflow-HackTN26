import { supabase } from '@/integrations/supabase/client';

export interface FoodSearchResult {
  summary: string;
  filters: { categories: string[]; mustHaveTags: string[]; avoidTags: string[] };
  results: { id: string; reason: string }[];
  model: string | null;
  requestId: string | null;
  fallback: boolean;
}

// Ask the AI API to match a plain-language need against available listings.
export async function searchFoodWithAI(query: string): Promise<FoodSearchResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/search-food', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ query }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'AI search is unavailable right now. Showing keyword matches instead.');
  return body as FoodSearchResult;
}
