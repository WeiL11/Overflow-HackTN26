import { buildFoodQuery } from '../../supabase/functions/_shared/food-query.js';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserPosition, type LatLng } from '@/lib/geo';

export interface FoodPhotoSuggestion {
  isFood: boolean;
  foodName: string;
  quantity: number | null;
  shelfLifeHours: number | null;
  description: string;
  model: string;
  keywords: string[];
  llm_query: { schema_version: number; task: string; messages: { role: string; content: string }[] } | null;
}

const MAX_SIDE = 1024;

export interface PhotoMetadata {
  original_name: string;
  original_type: string;
  original_bytes: number;
  original_width: number;
  original_height: number;
  stored_type: string;
  stored_bytes: number;
  stored_width: number;
  stored_height: number;
}

// Capture metadata before re-encoding removes the original image headers.
export async function prepareFoodPhoto(file: File): Promise<{ image: string; file: File; metadata: PhotoMetadata }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, or WebP photo up to 5 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error('Could not read photo dimensions.');
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', 0.85);
    const blob = await (await fetch(image)).blob();
    const stored = new File([blob], 'food.jpg', { type: 'image/jpeg' });
    return { image, file: stored, metadata: {
      original_name: file.name.slice(0, 255), original_type: file.type, original_bytes: file.size,
      original_width: bitmap.width, original_height: bitmap.height,
      stored_type: stored.type, stored_bytes: stored.size,
      stored_width: canvas.width, stored_height: canvas.height,
    } };
  } finally { bitmap.close(); }
}

// Retain the existing helper contract for other callers.
export async function resizeImage(file: File): Promise<string> {
  return (await prepareFoodPhoto(file)).image;
}

export const analyzeFoodPhoto = async (image: string): Promise<FoodPhotoSuggestion> => {
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
    return { ...body, ...buildFoodQuery({ ...body, visibleItems: body.visible_items }), quantity: Number.isInteger(body.quantity) && body.quantity > 0 ? body.quantity : null, shelfLifeHours: null } as FoodPhotoSuggestion;
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
      model: typeof result.model === 'string' ? result.model : 'supabase-vision',
      ...buildFoodQuery({ isFood: result.contains_food, foodName: result.food_name, description: result.description, model: result.model || 'supabase-vision', keywords: result.keywords, visibleItems: result.visible_items }),
    };
  }
};

// Format a Date for <input type="datetime-local"> in the user's local time zone.
export const toDatetimeLocal = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

// Turn the browser's current position into a street address (OpenStreetMap Nominatim).
// Geolocation only works on HTTPS or localhost; returns null when unavailable or denied.
export const detectCurrentAddress = async (): Promise<{ address: string; position: LatLng } | null> => {
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
};
