import { useEffect, useState } from 'react';
import { distanceMiles, getApproximatePosition, getBrowserPosition, VANDERBILT, type LatLng } from '@/lib/geo';

export interface ReceiverLocation {
  position: LatLng;
  source: 'gps' | 'approximate' | 'default';
  // Short phrase for "Distances from …".
  label: string;
}

// Only use a detected location inside the area the demo serves; anywhere else
// (a VPN, someone opening the demo from another city) falls back to Vanderbilt.
export const SERVICE_AREA_MILES = 50;

const DEFAULT_LOCATION: ReceiverLocation = { position: VANDERBILT, source: 'default', label: 'Vanderbilt campus' };

// Where distances are measured from: GPS when the browser shares it (HTTPS/localhost),
// else the approximate location from the visitor's IP, else Vanderbilt campus.
export function useReceiverLocation(): ReceiverLocation {
  const [location, setLocation] = useState<ReceiverLocation>(DEFAULT_LOCATION);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gps = await getBrowserPosition();
      if (cancelled) return;
      if (gps && distanceMiles(gps, VANDERBILT) <= SERVICE_AREA_MILES) {
        setLocation({ position: gps, source: 'gps', label: 'your location' });
        return;
      }
      const approx = await getApproximatePosition();
      if (cancelled || !approx || distanceMiles(approx, VANDERBILT) > SERVICE_AREA_MILES) return;
      setLocation({
        position: { lat: approx.lat, lng: approx.lng },
        source: 'approximate',
        label: `your approximate location${approx.city ? ` (${approx.city})` : ''}`,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return location;
}
