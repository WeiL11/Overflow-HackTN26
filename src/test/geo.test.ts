import { describe, expect, it } from 'vitest';
import { distanceMiles, formatMiles, toLatLng, FEATHERINGILL } from '@/lib/geo';
import { buildCatalog, distanceMiles as serverDistanceMiles } from '../../server/searchFood.mjs';

const DOWNTOWN_LIBRARY = { lat: 36.1625, lng: -86.7816 };

describe('distanceMiles', () => {
  it('measures Featheringill Hall to the downtown library at about 1.7 miles', () => {
    expect(distanceMiles(FEATHERINGILL, DOWNTOWN_LIBRARY)).toBeCloseTo(1.7, 1);
  });

  it('is zero for the same point and symmetric', () => {
    expect(distanceMiles(FEATHERINGILL, FEATHERINGILL)).toBe(0);
    expect(distanceMiles(DOWNTOWN_LIBRARY, FEATHERINGILL)).toBeCloseTo(distanceMiles(FEATHERINGILL, DOWNTOWN_LIBRARY), 10);
  });

  it('matches the server implementation', () => {
    expect(serverDistanceMiles(FEATHERINGILL, DOWNTOWN_LIBRARY)).toBeCloseTo(distanceMiles(FEATHERINGILL, DOWNTOWN_LIBRARY), 10);
  });
});

describe('formatMiles / toLatLng', () => {
  it('formats short and long distances', () => {
    expect(formatMiles(0.02)).toBe('< 0.1 mi');
    expect(formatMiles(0.43)).toBe('0.4 mi');
    expect(formatMiles(12.6)).toBe('13 mi');
  });

  it('returns null when a coordinate is missing', () => {
    expect(toLatLng(null, -86.8)).toBeNull();
    expect(toLatLng(36.1, -86.8)).toEqual({ lat: 36.1, lng: -86.8 });
  });
});

describe('buildCatalog distance', () => {
  const listing = (id: string, latitude: number | null, longitude: number | null) => ({
    id, food_name: id, category: 'pantry', tags: [], description: '', quantity: 1, location: 'X',
    expiry_time: new Date(Date.now() + 3_600_000).toISOString(), latitude, longitude,
  });

  it('adds miles from the receiver, or "distance unknown"', () => {
    const { text } = buildCatalog([listing('near', 36.1625, -86.7816), listing('nowhere', null, null)], Date.now(), FEATHERINGILL);
    const [first, second] = text.split('\n');
    expect(first).toContain('1.7 mi away');
    expect(second).toContain('distance unknown');
  });
});
