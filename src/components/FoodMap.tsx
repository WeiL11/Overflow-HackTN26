import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@radix-ui/themes';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import { categoryLabel } from '@/config/foodTaxonomy';
import { formatMiles, type LatLng } from '@/lib/geo';

export interface MapListing {
  id: string;
  food_name: string;
  category: string;
  quantity: number;
  location: string;
  expiry_time: string;
  position: LatLng;
  distance: number;
}

interface FoodMapProps {
  listings: MapListing[];
  you: LatLng;
  youLabel: string;
  // Omitted when the viewer can't request food (e.g. a donor browsing).
  onRequest?: (listingId: string) => void;
}

const NEARBY_MILES = 1.5;

// Zoom to show the given pins plus the receiver whenever that set changes.
function FitToMarkers({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map(p => `${p.lat},${p.lng}`).join('|');
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1) map.fitBounds(latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [32, 32], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export default function FoodMap({ listings, you, youLabel, onRequest }: FoodMapProps) {
  // Open zoomed in on the neighborhood (pins within walking/biking range); zoom out for the rest.
  const nearby = listings.filter(listing => listing.distance <= NEARBY_MILES);
  // Several listings can share a pickup spot; group them so each spot is one pin.
  const spots = new Map<string, MapListing[]>();
  for (const listing of listings) {
    const key = `${listing.position.lat},${listing.position.lng}`;
    spots.set(key, [...(spots.get(key) ?? []), listing]);
  }

  return (
    <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-xl border border-border">
      <MapContainer center={you} zoom={12} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToMarkers points={[you, ...(nearby.length > 0 ? nearby : listings).map(l => l.position)]} />

        {[...spots.values()].map(group => (
          <CircleMarker
            key={group[0].id}
            center={group[0].position}
            radius={8 + Math.min(group.length, 6)}
            pathOptions={{ color: '#166534', fillColor: '#22a35a', fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>
              <div className="min-w-[200px] space-y-2">
                <p className="font-semibold">{group[0].location}</p>
                <p className="text-xs text-gray-500">{formatMiles(group[0].distance)} away · {group.length} {group.length === 1 ? 'listing' : 'listings'}</p>
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {group.map(listing => (
                    <li key={listing.id} className="flex items-start justify-between gap-2 border-t border-gray-100 pt-2">
                      <div>
                        <p className="text-sm font-medium">{listing.food_name}</p>
                        <p className="text-xs text-gray-500">{categoryLabel(listing.category)} · {listing.quantity} items</p>
                        <ExpiryCountdown expiryTime={listing.expiry_time} />
                      </div>
                      {onRequest && <Button size="1" onClick={() => onRequest(listing.id)}>Request</Button>}
                    </li>
                  ))}
                </ul>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Drawn last and kept in front so it isn't hidden under a pickup pin at the same spot. */}
        <CircleMarker
          center={you}
          radius={7}
          pathOptions={{ color: '#ffffff', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }}
          eventHandlers={{ add: event => event.target.bringToFront() }}
          interactive={false}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>{youLabel}</Tooltip>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
