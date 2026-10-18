import { useRef, useState } from 'react';
import { Button, IconButton, Tooltip } from '@radix-ui/themes';
import { Camera, Loader2, Sparkles, Trash2 } from 'lucide-react';
import type { FoodPhotoSuggestion } from '@/types/food-photo';
import { analyzeFoodPhoto, resizeImage } from '@/lib/foodPhoto';

type FoodPhotoUploadProps = {
  disabled: boolean;
  onPhotoChange: (photo: File | null) => void;
  onSuggestion: (suggestion: FoodPhotoSuggestion | null) => void;
  onBusyChange: (busy: boolean) => void;
};

const FoodPhotoUpload = ({ disabled, onPhotoChange, onSuggestion, onBusyChange }: FoodPhotoUploadProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FoodPhotoSuggestion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ask the AI for suggestions; the caller has already marked the component busy.
  const analyze = async (image: string) => {
    setAnalysis(null);
    onSuggestion(null);
    try {
      const suggestion = await analyzeFoodPhoto(image);
      setAnalysis(suggestion);
      onSuggestion(suggestion);
      if (!suggestion.isFood) setError('No recognizable food detected. Try a clearer photo or enter details manually.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Photo analysis failed.');
    }
  };

  const runAnalysis = async (image: string) => {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      await analyze(image);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setAnalysis(null);
    onSuggestion(null);
    try {
      const image = await resizeImage(file);
      setPreview(image);
      const blob = await (await fetch(image)).blob();
      onPhotoChange(new File([blob], 'food.jpg', { type: 'image/jpeg' }));
      // Analyze right away so picking a photo is enough; the ✨ button re-runs it.
      await analyze(image);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read this photo.');
    } finally {
      setBusy(false);
      onBusyChange(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removePhoto = () => {
    setPreview(null);
    setAnalysis(null);
    setError('');
    onPhotoChange(null);
    onSuggestion(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label="Food photo"
        className="hidden"
        disabled={disabled || busy}
        onChange={event => handleFile(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="flex w-full items-center gap-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/10 disabled:cursor-wait"
      >
        {preview ? (
          <img src={preview} alt="Food photo" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Camera className="h-7 w-7 text-primary" />
          </span>
        )}
        <span className="flex-1">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin text-primary" /> Analyzing photo…</> : <><Sparkles className="h-4 w-4 text-primary" /> {preview ? 'Use a different photo' : 'Snap or upload a photo'}</>}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">AI suggests food details. Review all suggestions and confirm quantity and availability.</span>
        </span>
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {preview && (
        <div className="flex gap-3">
          <Tooltip content={analysis ? 'Analyze again' : 'Analyze food photo'}>
            <IconButton type="button" variant="soft" disabled={disabled || busy} aria-label={analysis ? 'Analyze again' : 'Analyze food photo'} onClick={() => runAnalysis(preview)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </IconButton>
          </Tooltip>
          <Tooltip content="Remove photo"><IconButton type="button" variant="ghost" color="red" className="!bg-transparent hover:!bg-red-500/10" disabled={disabled || busy} aria-label="Remove photo" onClick={removePhoto}><Trash2 className="h-4 w-4" /></IconButton></Tooltip>
        </div>
      )}
      {analysis?.description && <p role="status" className="text-sm text-muted-foreground">{analysis.description}</p>}
    </div>
  );
};

export default FoodPhotoUpload;
