import { supabase } from '@/integrations/supabase/client';
import { getBrowserPosition, type LatLng } from '@/lib/geo';

export interface FoodPhotoSuggestion {
  isFood: boolean;
  foodName: string;
  quantity: number | null;
  shelfLifeHours: number | null;
  description: string;
  model: string;
}

const MAX_SIDE = 1024;

// Shrink the photo in the browser so uploads stay small and fast.
export async function resizeImage(file: File): Promise<string> {
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
}

export async function analyzeFoodPhoto(image: string): Promise<FoodPhotoSuggestion> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sign in to analyze a photo.');
    const response = await fetch('/api/analyze-food', {
      signal: AbortSignal.timeout(45000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ image }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Photo analysis failed.');
    if (typeof body.isFood !== 'boolean' || typeof body.foodName !== 'string' || typeof body.description !== 'string') throw new Error('Invalid photo analysis response.');
    return { ...body, quantity: Number.isInteger(body.quantity) && body.quantity > 0 ? body.quantity : null, shelfLifeHours: null } as FoodPhotoSuggestion;
  } catch {
    // Keep the existing autofill service, with the Supabase vision function as fallback.
    const photo = await (await fetch(image)).blob();
    const body = new FormData();
    body.append('photo', new File([photo], 'food.jpg', { type: 'image/jpeg' }));
    const { data, error } = await supabase.functions.invoke('analyze-food', { body });
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
      model: 'supabase-vision',
    };
  }
}

// Format a Date for <input type="datetime-local"> in the user's local time zone.
export function toDatetimeLocal(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

// Turn the browser's current position into a street address (OpenStreetMap Nominatim).
// Geolocation only works on HTTPS or localhost; returns null when unavailable or denied.
export async function detectCurrentAddress(): Promise<{ address: string; position: LatLng } | null> {
  const position = await getBrowserPosition();
  if (!position) return null;
  const fallback = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${position.lat}&lon=${position.lng}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('reverse geocoding failed');
    const { address, display_name: displayName } = await response.json();
    const street = [address?.house_number, address?.road].filter(Boolean).join(' ');
    const city = address?.city || address?.town || address?.village || address?.suburb;
    const short = [street, city, address?.state].filter(Boolean).join(', ');
    return { address: short || displayName || fallback, position };
  } catch {
    return { address: fallback, position };
  }
}
