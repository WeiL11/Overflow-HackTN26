import { describe, expect, it } from 'vitest';
import { listingExpiry, nextPickupTime, pickupSlotsUntil } from '../../scripts/seed-time.mjs';

// 2026-10-17 is CDT (UTC-5); 2026-12-15 is CST (UTC-6).
describe('nextPickupTime', () => {
  it('uses today when the pickup time is still ahead in Nashville', () => {
    const now = new Date('2026-10-17T15:00:00Z'); // 10:00 AM CDT
    expect(nextPickupTime('21:00', now).toISOString()).toBe('2026-10-18T02:00:00.000Z'); // 9:00 PM CDT
  });

  it('rolls to tomorrow once the pickup time has passed', () => {
    const now = new Date('2026-10-18T03:30:00Z'); // 10:30 PM CDT on the 17th
    expect(nextPickupTime('21:00', now).toISOString()).toBe('2026-10-19T02:00:00.000Z');
  });

  it('handles standard time', () => {
    const now = new Date('2026-12-15T12:00:00Z'); // 6:00 AM CST
    expect(nextPickupTime('14:00', now).toISOString()).toBe('2026-12-15T20:00:00.000Z');
  });

  it('is always within the next 24 hours', () => {
    const now = new Date('2026-10-17T20:59:00Z');
    for (const hhmm of ['00:00', '06:30', '15:59', '16:00', '21:30', '23:59']) {
      const ms = nextPickupTime(hhmm, now).getTime() - now.getTime();
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(24 * 3_600_000);
    }
  });

  it('rejects malformed times', () => {
    expect(() => nextPickupTime('9pm')).toThrow();
  });
});

describe('listingExpiry', () => {
  it('caps old hour offsets at 24 hours', () => {
    const now = new Date('2026-10-17T15:00:00Z');
    expect(listingExpiry({ expiryOffsetHours: 2160 }, now).getTime() - now.getTime()).toBe(24 * 3_600_000);
  });
});

describe('pickupSlotsUntil', () => {
  const now = new Date('2026-10-18T15:07:00Z');

  it('makes back-to-back 15-minute slots from the next quarter hour that end by the deadline', () => {
    const slots = pickupSlotsUntil('L1', new Date('2026-10-18T16:00:00Z'), 5, now);
    expect(slots.map(slot => slot.starts_at)).toEqual([
      '2026-10-18T15:15:00.000Z', '2026-10-18T15:30:00.000Z', '2026-10-18T15:45:00.000Z',
    ]);
    expect(slots.every(slot => new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime() === 15 * 60_000)).toBe(true);
    expect(slots[0]).toMatchObject({ listing_id: 'L1', capacity: 5 });
  });

  it('caps the number of slots and returns none when the deadline is too close', () => {
    expect(pickupSlotsUntil('L1', new Date('2026-10-19T15:00:00Z'), 1, now)).toHaveLength(8);
    expect(pickupSlotsUntil('L1', new Date('2026-10-18T15:20:00Z'), 1, now)).toHaveLength(0);
  });
});
