import { supabase } from '@/integrations/supabase/client';
import { getBrowserPosition, type LatLng } from '@/lib/geo';

export interface FoodPhotoSuggestion {
  isFood: boolean;
  foodName: string;
  quantity: number;
  shelfLifeHours: number;
  description: string;
  model: string;
}

const MAX_SIDE = 1024;

// Shrink the photo in the browser so uploads stay small and fast.
export async function resizeImage(file: File): Promise<string> {
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
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/analyze-food', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ image }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Photo analysis failed.');
  return body as FoodPhotoSuggestion;
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
