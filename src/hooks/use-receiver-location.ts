import { useEffect, useState } from 'react';
import { distanceMiles, FEATHERINGILL, getBrowserPosition, type LatLng } from '@/lib/geo';

export interface ReceiverLocation {
  position: LatLng;
  source: 'gps' | 'default';
  // Short phrase for "Distances from …".
  label: string;
}

// Only use GPS inside the area the demo serves; anywhere else falls back to campus.
export const SERVICE_AREA_MILES = 50;

const DEFAULT_LOCATION: ReceiverLocation = { position: FEATHERINGILL, source: 'default', label: 'Featheringill Hall (Vanderbilt)' };

// Where distances are measured from: GPS when the browser shares it (HTTPS/localhost),
// otherwise Featheringill Hall on Vanderbilt's campus.
export function useReceiverLocation(): ReceiverLocation {
  const [location, setLocation] = useState<ReceiverLocation>(DEFAULT_LOCATION);

  useEffect(() => {
    let cancelled = false;
    getBrowserPosition().then(gps => {
      if (!cancelled && gps && distanceMiles(gps, FEATHERINGILL) <= SERVICE_AREA_MILES) {
        setLocation({ position: gps, source: 'gps', label: 'your location' });
      }
    });
    return () => { cancelled = true; };
  }, []);

  return location;
}
