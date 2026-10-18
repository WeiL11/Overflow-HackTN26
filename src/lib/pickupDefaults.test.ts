import { describe, expect, it } from 'vitest';
import { defaultPickupBlocks, trimStartedPickupBlocks } from '@/lib/pickupSlots';

const now = new Date('2026-10-18T19:07:00Z').getTime();

describe('defaultPickupBlocks', () => {
  it('opens pickup from the next quarter hour until the expiration', () => {
    expect(defaultPickupBlocks('2026-10-18T21:07:00Z', now)).toEqual([
      { startsAt: '2026-10-18T19:15:00.000Z', endsAt: '2026-10-18T21:00:00.000Z' },
    ]);
  });

  it('returns nothing when less than 15 minutes fit before the expiration', () => {
    expect(defaultPickupBlocks('2026-10-18T19:20:00Z', now)).toEqual([]);
    expect(defaultPickupBlocks('not a date', now)).toEqual([]);
  });
});

describe('trimStartedPickupBlocks', () => {
  it('moves a started block to the next quarter hour and drops ones that are over', () => {
    const blocks = [
      { startsAt: '2026-10-18T19:00:00.000Z', endsAt: '2026-10-18T20:00:00.000Z' },
      { startsAt: '2026-10-18T18:45:00.000Z', endsAt: '2026-10-18T19:15:00.000Z' },
      { startsAt: '2026-10-18T21:00:00.000Z', endsAt: '2026-10-18T21:30:00.000Z' },
    ];
    expect(trimStartedPickupBlocks(blocks, now)).toEqual([
      { startsAt: '2026-10-18T19:15:00.000Z', endsAt: '2026-10-18T20:00:00.000Z' },
      { startsAt: '2026-10-18T21:00:00.000Z', endsAt: '2026-10-18T21:30:00.000Z' },
    ]);
  });
});
