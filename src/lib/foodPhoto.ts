import { buildFoodQuery } from '../../supabase/functions/_shared/food-query.js';
import { supabase } from '@/integrations/supabase/client';
import type { FoodPhotoSuggestion } from '@/types/food-photo';

const MAX_SIDE = 1024;
export type PhotoMetadata = { original_name: string; original_type: string; original_bytes: number; original_width: number; original_height: number; stored_width: number; stored_height: number; stored_type: string; stored_bytes: number };
export const prepareFoodPhoto = async (file: File): Promise<{ file: File; metadata: PhotoMetadata }> => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG, or WebP photo up to 5 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  return { file: new File([blob], 'food.jpg', { type: 'image/jpeg' }), metadata: { original_name: file.name, original_type: file.type, original_bytes: file.size, original_width: bitmap.width, original_height: bitmap.height, stored_width: canvas.width, stored_height: canvas.height, stored_type: 'image/jpeg', stored_bytes: blob.size } };
};

// Shrink the photo in the browser so uploads stay small and fast.
export const resizeImage = async (file: File): Promise<string> => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, or WebP photo up to 5 MB.');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
};

// Errors the AI server answered with (bad photo, not signed in, ...): show them as-is
// instead of retrying through the Supabase function.
class AnalyzeFoodError extends Error {}

export const analyzeFoodPhoto = async (image: string): Promise<FoodPhotoSuggestion> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new AnalyzeFoodError('Sign in to analyze a photo.');
    const response = await fetch('/api/analyze-food', {
      signal: AbortSignal.timeout(20000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ image }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok && response.status < 500) throw new AnalyzeFoodError(body.error || 'Photo analysis failed.');
    if (!response.ok) throw new Error(body.error || 'Photo analysis failed.');
    if (typeof body.isFood !== 'boolean' || typeof body.foodName !== 'string' || typeof body.description !== 'string') throw new Error('Invalid photo analysis response.');
    return {
      ...body,
      ...buildFoodQuery({
        isFood: body.isFood,
        foodName: body.foodName,
        description: body.description,
        model: body.model,
        keywords: body.keywords,
        visibleItems: body.visible_items,
      }),
      quantity: Number.isInteger(body.quantity) && body.quantity > 0 ? body.quantity : null,
      shelfLifeHours: null,
    } as FoodPhotoSuggestion;
  } catch (caught) {
    if (caught instanceof AnalyzeFoodError) throw caught;
    // AI server unreachable or timed out: try the Supabase vision function as a fallback.
    const photo = await (await fetch(image)).blob();
    const body = new FormData();
    body.append('photo', new File([photo], 'food.jpg', { type: 'image/jpeg' }));
    const { data, error } = await supabase.functions.invoke('analyze-food', { body, signal: AbortSignal.timeout(20000) });
    if (error) {
      const detail = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
      throw new Error(detail?.error || 'Photo analysis is unavailable. Check that your AI backend is running, then retry or enter details manually.');
    }
    if (!data?.analysis) throw new Error('No photo analysis was returned. Please retry.');
    const result = data.analysis;
    if (typeof result.contains_food !== 'boolean' || typeof result.food_name !== 'string' || typeof result.description !== 'string') {
      throw new Error('Could not interpret the photo analysis. Please enter details manually.');
    }
    return {
      isFood: result.contains_food,
      foodName: result.food_name,
      quantity: null,
      shelfLifeHours: null,
      description: result.description,
      model: typeof result.model === 'string' ? result.model : 'supabase-vision',
      ...buildFoodQuery({
        isFood: result.contains_food,
        foodName: result.food_name,
        description: result.description,
        model: result.model || 'supabase-vision',
        keywords: result.keywords,
        visibleItems: result.visible_items,
      }),
    };
  }
};

// Format a Date for <input type="datetime-local"> in the user's local time zone.
export const toDatetimeLocal = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const getPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 300_000 }),
  );

// Turn the browser's current position into a street address (OpenStreetMap Nominatim).
// Geolocation only works on HTTPS or localhost; returns null when unavailable or denied.
export const detectCurrentAddress = async (): Promise<string | null> => {
  if (!window.isSecureContext || !('geolocation' in navigator)) return null;
  try {
    const { coords } = await getPosition();
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${coords.latitude}&lon=${coords.longitude}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('reverse geocoding failed');
    const { address, display_name: displayName } = await response.json();
    const street = [address?.house_number, address?.road].filter(Boolean).join(' ');
    const city = address?.city || address?.town || address?.village || address?.suburb;
    const short = [street, city, address?.state].filter(Boolean).join(', ');
    return short || displayName || `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  } catch {
    return null;
  }
};
