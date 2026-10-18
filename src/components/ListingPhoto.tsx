import FoodQueryDetails from './FoodQueryDetails';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

const ListingPhoto = ({ path, analysis, name }: { path: string | null; analysis: Json | null; name: string }) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl(''); setError(false);
    if (!path) return;
    const refresh = async () => {
      const { data, error } = await supabase.storage.from('food-photos').createSignedUrl(path, 3600);
      if (active) { setUrl(data?.signedUrl || ''); setError(Boolean(error)); }
    };
    refresh();
    const interval = window.setInterval(refresh, 50 * 60 * 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [path]);
  const description = analysis && typeof analysis === 'object' && !Array.isArray(analysis) && typeof analysis.description === 'string' ? analysis.description : '';
  if (!path && !description) return null;
  return <div className="mb-4 space-y-2">
    {url && !error && <img src={url} alt={name} onError={() => setError(true)} className="max-h-56 w-full rounded-lg object-contain bg-muted/30" />}
    {error && <p className="text-sm text-muted-foreground">Photo unavailable.</p>}
    <FoodQueryDetails analysis={analysis} />
    {description && <p className="text-sm text-muted-foreground"><span className="font-medium">AI photo description: </span>{description}</p>}
  </div>;
};

export default ListingPhoto;
