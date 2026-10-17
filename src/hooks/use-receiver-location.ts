import { useEffect, useState } from 'react';
import { getBrowserPosition, VANDERBILT, type LatLng } from '@/lib/geo';

export interface ReceiverLocation {
  position: LatLng;
  source: 'gps' | 'default';
}

// Where distances are measured from: the browser's location when it is shared,
// otherwise Vanderbilt campus (the live demo site is HTTP, where GPS is blocked).
export function useReceiverLocation(): ReceiverLocation {
  const [location, setLocation] = useState<ReceiverLocation>({ position: VANDERBILT, source: 'default' });

  useEffect(() => {
    let cancelled = false;
    getBrowserPosition().then(position => {
      if (!cancelled && position) setLocation({ position, source: 'gps' });
    });
    return () => { cancelled = true; };
  }, []);

  return location;
}
