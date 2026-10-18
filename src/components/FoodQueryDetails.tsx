import type { Json } from '@/integrations/supabase/types';

export default function FoodQueryDetails({ analysis }: { analysis: Json | null }) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return null;
  const keywords = Array.isArray(analysis.keywords) ? analysis.keywords.filter((value): value is string => typeof value === 'string') : [];
  if (!keywords.length) return null;
  return <div className="space-y-2 text-sm">
    <p className="font-medium">Detected keywords</p>
    <div className="flex flex-wrap gap-2">{keywords.map((keyword, index) => <span key={`${keyword}-${index}`} className="rounded-full bg-primary/10 px-2 py-1 text-xs">{keyword}</span>)}</div>

  </div>;
}
