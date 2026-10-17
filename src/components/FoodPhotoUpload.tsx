import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button, Text } from '@radix-ui/themes';

export interface FoodAnalysis {
  contains_food: boolean;
  food_name: string;
  description: string;
  visible_items: string[];
}

interface Props {
  photo: File | null;
  onPhoto: (photo: File | null) => void;
  onAnalysis: (analysis: FoodAnalysis | null) => void;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}

export default function FoodPhotoUpload({ photo, onPhoto, onAnalysis, disabled, onBusy }: Props) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const analyze = async () => {
    if (!photo) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('photo', photo);
      const { data, error: invokeError } = await supabase.functions.invoke('analyze-food', { body });
      if (invokeError) {
        const response = invokeError.context;
        const detail = response instanceof Response ? await response.json().catch(() => null) : null;
        throw new Error(detail?.error || 'Analysis failed. Please retry or enter details manually.');
      }
      if (!data?.analysis) throw new Error('No analysis returned. Please retry.');
      setAnalysis(data.analysis);
      onAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please retry.');
    } finally { setBusy(false); onBusy(false); }
  };

  return <div className="space-y-3 rounded-lg border p-4">
    <Text as="label" size="2" weight="medium" htmlFor="food-photo">Food photo (optional)</Text>
    <p className="text-sm text-muted-foreground">Upload a JPEG, PNG, or WebP up to 5 MB. Analyze it to suggest a food name. Analysis sends the photo to Google Gemini.</p>
    <input className="block w-full rounded-md border p-2 text-sm" id="food-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={event => {
      const file = event.target.files?.[0] || null;
      setAnalysis(null); onAnalysis(null); onPhoto(null); setError('');
      if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024)) {
        setError('Choose a JPEG, PNG, or WebP photo up to 5 MB.'); event.target.value = ''; return;
      }
      onPhoto(file);
    }} />
    {preview && <img src={preview} alt="Selected food donation" className="max-h-56 rounded-md object-contain" />}
    {photo && <Button type="button" variant="soft" disabled={disabled || busy} onClick={analyze}>{busy ? 'Analyzing photo…' : 'Analyze food photo'}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {analysis && <div role="status" className="space-y-1 text-sm">
      <p className="font-medium">{analysis.contains_food ? analysis.food_name : 'No recognizable food detected'}</p>
      <p>{analysis.description}</p>
      {analysis.visible_items.length > 0 && <p>Visible items: {analysis.visible_items.join(', ')}</p>}
      <p className="text-muted-foreground">Review the suggestion. A photo cannot confirm food safety, allergens, quantity, or expiry.</p>
    </div>}
  </div>;
}
