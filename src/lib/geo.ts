export interface LatLng {
  lat: number;
  lng: number;
}

// Demo default when the browser won't share a location (e.g. the HTTP live site).
export const VANDERBILT: LatLng & { label: string } = { lat: 36.1447, lng: -86.8027, label: 'Vanderbilt campus' };

const EARTH_RADIUS_MILES = 3958.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Straight-line (haversine) distance in miles.
export function distanceMiles(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export const formatMiles = (miles: number) =>
  miles < 0.1 ? '< 0.1 mi' : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;

export const toLatLng = (latitude: number | null | undefined, longitude: number | null | undefined): LatLng | null =>
  latitude == null || longitude == null ? null : { lat: latitude, lng: longitude };

// Browser geolocation only works on HTTPS or localhost; returns null when unavailable or denied.
export async function getBrowserPosition(): Promise<LatLng | null> {
  if (!window.isSecureContext || !('geolocation' in navigator)) return null;
  try {
    const { coords } = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 300_000 }),
    );
    return { lat: coords.latitude, lng: coords.longitude };
  } catch {
    return null;
  }
}

// Look up an address with OpenStreetMap Nominatim, preferring results around Nashville.
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const query = address.trim();
  if (!query) return null;
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    q: query,
    viewbox: '-87.05,36.40,-86.50,35.95',
    countrycodes: 'us',
  });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const [hit] = await response.json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}
