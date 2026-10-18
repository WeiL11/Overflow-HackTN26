import { describe, expect, it } from 'vitest';
import { PickupIntervalMinutes } from '@/types/food';
import { canonicalPickupTimestamp, expandAvailabilityBlocks, formatPickupRange, formatPickupWindow, getDuplicatedPickupBlocks, getWeekStart, mergeSelectedCells, validatePickupRange } from '@/lib/pickupSlots';

describe('pickup slots', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z');

  it('canonicalizes equivalent database timestamp formats', () => {
    expect(canonicalPickupTimestamp('2026-10-18T13:00:00+00:00')).toBe('2026-10-18T13:00:00.000Z');
  });

  it('uses the fifteen-minute pickup interval and keeps expanded segments aligned', () => {
    expect(PickupIntervalMinutes.Fifteen).toBe(15);
    expect(expandAvailabilityBlocks([{ startsAt: '2026-10-18T13:00:00.000Z', endsAt: '2026-10-18T13:45:00.000Z' }])).toEqual([
      { startsAt: '2026-10-18T13:00:00.000Z', endsAt: '2026-10-18T13:15:00.000Z' },
      { startsAt: '2026-10-18T13:15:00.000Z', endsAt: '2026-10-18T13:30:00.000Z' },
      { startsAt: '2026-10-18T13:30:00.000Z', endsAt: '2026-10-18T13:45:00.000Z' },
    ]);
  });

  it('expands and deduplicates sorted 15-minute segments', () => {
    expect(expandAvailabilityBlocks([
      { startsAt: '2026-10-18T13:00:00.000Z', endsAt: '2026-10-18T13:45:00.000Z' },
      { startsAt: '2026-10-18T13:15:00.000Z', endsAt: '2026-10-18T14:00:00.000Z' },
    ])).toEqual([
      { startsAt: '2026-10-18T13:00:00.000Z', endsAt: '2026-10-18T13:15:00.000Z' },
      { startsAt: '2026-10-18T13:15:00.000Z', endsAt: '2026-10-18T13:30:00.000Z' },
      { startsAt: '2026-10-18T13:30:00.000Z', endsAt: '2026-10-18T13:45:00.000Z' },
      { startsAt: '2026-10-18T13:45:00.000Z', endsAt: '2026-10-18T14:00:00.000Z' },
    ]);
  });

  it('starts weeks on Sunday', () => {
    expect(getWeekStart(new Date('2026-10-21T12:00:00.000Z')).getDay()).toBe(0);
  });

  it('accepts future 30-minute and multi-slot ranges', () => {
    expect(validatePickupRange('2026-10-18T13:00:00.000Z', '2026-10-18T13:30:00.000Z', '2026-10-18T14:00:00.000Z', now)).toBeNull();
    expect(validatePickupRange('2026-10-18T13:00:00.000Z', '2026-10-18T14:00:00.000Z', '2026-10-18T15:00:00.000Z', now)).toBeNull();
  });

  it('rejects past, invalid, non-30-minute, and post-expiry ranges', () => {
    expect(validatePickupRange('bad', '2026-10-18T13:30:00.000Z', '2026-10-18T14:00:00.000Z', now)).toContain('valid');
    expect(validatePickupRange('2026-10-18T11:00:00.000Z', '2026-10-18T11:30:00.000Z', '2026-10-18T14:00:00.000Z', now)).toContain('future');
    expect(validatePickupRange('2026-10-18T13:00:00.000Z', '2026-10-18T13:45:00.000Z', '2026-10-18T14:00:00.000Z', now)).toContain('30-minute');
    expect(validatePickupRange('2026-10-18T13:00:00.000Z', '2026-10-18T14:30:00.000Z', '2026-10-18T14:00:00.000Z', now)).toContain('availability');
  });

  it('merges contiguous 15-minute cells into one availability block', () => {
    expect(mergeSelectedCells([
      '2026-10-18T13:15:00.000Z',
      '2026-10-18T13:00:00.000Z',
      '2026-10-18T13:30:00.000Z',
    ])).toEqual([{ startsAt: '2026-10-18T13:00:00.000Z', endsAt: '2026-10-18T13:45:00.000Z' }]);
  });

  it('duplicates only pickup slots between now and expiration', () => {
    const slots = [
      { starts_at: '2026-10-18T11:00:00.000Z', ends_at: '2026-10-18T11:15:00.000Z' },
      { starts_at: '2026-10-18T13:00:00.000Z', ends_at: '2026-10-18T13:15:00.000Z' },
      { starts_at: '2026-10-18T13:15:00.000Z', ends_at: '2026-10-18T13:30:00.000Z' },
      { starts_at: '2026-10-18T14:00:00.000Z', ends_at: '2026-10-18T14:15:00.000Z' },
    ];

    expect(getDuplicatedPickupBlocks(slots, '2026-10-18T14:00:00.000Z', now)).toEqual([
      { startsAt: '2026-10-18T13:00:00.000Z', endsAt: '2026-10-18T13:30:00.000Z' },
    ]);
  });

  it('formats the global pickup range from earliest to latest slot', () => {
    const slots = [
      { starts_at: '2026-10-20T14:00:00.000Z', ends_at: '2026-10-20T14:15:00.000Z' },
      { starts_at: '2026-10-18T09:30:00.000Z', ends_at: '2026-10-18T09:45:00.000Z' },
    ];
    const result = formatPickupRange(slots);
    const earliest = new Date(slots[1].starts_at).toLocaleString(undefined, { month: 'short', day: 'numeric' });
    const latest = new Date(slots[0].ends_at).toLocaleString(undefined, { month: 'short', day: 'numeric' });
    expect(result).toContain(earliest);
    expect(result).toContain(latest);
    expect(result.indexOf(earliest)).toBeLessThan(result.indexOf(latest));
    expect(formatPickupRange([])).toBe('');
  });

  it('formats a pickup window for local display', () => {
    expect(formatPickupWindow({ starts_at: '2026-10-18T13:00:00.000Z', ends_at: '2026-10-18T13:30:00.000Z' })).toMatch(/Oct 18/);
  });
});
