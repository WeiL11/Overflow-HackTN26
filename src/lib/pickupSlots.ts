import { PickupIntervalMinutes, type AvailabilityBlock, type PickupSlotSummary } from '@/types/food';

export const canonicalPickupTimestamp = (value: string): string => new Date(value).toISOString();

export const expandAvailabilityBlocks = (blocks: AvailabilityBlock[]): AvailabilityBlock[] => {
  const segments = blocks.flatMap(block => {
    const start = new Date(block.startsAt).getTime();
    const end = new Date(block.endsAt).getTime();
    const result: AvailabilityBlock[] = [];
    for (let time = start; time < end; time += PickupIntervalMinutes.Fifteen * 60 * 1000) {
      result.push({ startsAt: new Date(time).toISOString(), endsAt: new Date(time + PickupIntervalMinutes.Fifteen * 60 * 1000).toISOString() });
    }
    return result;
  });
  return [...new Map(segments.map(segment => [segment.startsAt, segment])).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
};

export const getDuplicatedPickupBlocks = (
  slots: Array<Pick<PickupSlotSummary, 'starts_at' | 'ends_at'>>,
  expiration: string,
  now = Date.now(),
): AvailabilityBlock[] => {
  const expirationTime = new Date(expiration).getTime();
  const validStarts = slots
    .filter(slot => {
      const startsAt = new Date(slot.starts_at).getTime();
      const endsAt = new Date(slot.ends_at).getTime();
      return startsAt >= now && endsAt <= expirationTime;
    })
    .map(slot => slot.starts_at);
  return mergeSelectedCells(validStarts);
};

export const formatPickupRange = (slots: Array<Pick<PickupSlotSummary, 'starts_at' | 'ends_at'>>): string => {
  if (slots.length === 0) return '';
  const startsAt = new Date(Math.min(...slots.map(slot => new Date(slot.starts_at).getTime())));
  const endsAt = new Date(Math.max(...slots.map(slot => new Date(slot.ends_at).getTime())));
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  return `${startsAt.toLocaleString(undefined, options)} – ${endsAt.toLocaleString(undefined, options)}`;
};

export const formatPickupWindow = (slot: Pick<PickupSlotSummary, 'starts_at' | 'ends_at'>): string => {
  const startsAt = new Date(slot.starts_at);
  const endsAt = new Date(slot.ends_at);
  const date = startsAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${date}, ${startsAt.toLocaleTimeString(undefined, timeOptions)} – ${endsAt.toLocaleTimeString(undefined, timeOptions)}`;
};

export const validatePickupRange = (start: string, end: string, expiry: string, now = Date.now()): string | null => {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  const expiryTime = new Date(expiry).getTime();
  if (![startTime, endTime, expiryTime].every(Number.isFinite)) return 'Choose valid pickup and availability times.';
  if (startTime <= now) return 'Pickup must start in the future.';
  if (endTime <= startTime) return 'Pickup must end after it starts.';
  const duration = endTime - startTime;
  if (duration < 30 * 60 * 1000 || duration % (30 * 60 * 1000) !== 0) return 'Pickup range must use 30-minute windows.';
  if (endTime > expiryTime) return 'Pickup must end before food availability expires.';
  return null;
};

export const getWeekStart = (date = new Date()): Date => {
  const day = new Date(date);
  const offset = day.getDay();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - offset);
  return day;
};

export const getWeekDays = (weekStart: Date): Date[] => Array.from({ length: 7 }, (_, index) => {
  const day = new Date(weekStart);
  day.setDate(day.getDate() + index);
  return day;
});

export const mergeSelectedCells = (cells: string[]): AvailabilityBlock[] => {
  const sorted = [...new Set(cells)].sort();
  const blocks: AvailabilityBlock[] = [];
  sorted.forEach(cell => {
    const start = new Date(cell);
    const end = new Date(start.getTime() + PickupIntervalMinutes.Fifteen * 60 * 1000);
    const previous = blocks[blocks.length - 1];
    const previousStart = previous ? new Date(previous.startsAt) : null;
    const sameLocalDay = previousStart
      && previousStart.getFullYear() === start.getFullYear()
      && previousStart.getMonth() === start.getMonth()
      && previousStart.getDate() === start.getDate();
    if (previous && sameLocalDay && new Date(previous.endsAt).getTime() === start.getTime()) previous.endsAt = end.toISOString();
    else blocks.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
  });
  return blocks;
};

export const validatePickupBlocks = (blocks: AvailabilityBlock[], now = Date.now()): string | null => {
  if (blocks.length === 0) return 'Select at least one pickup availability block.';
  for (const block of blocks) {
    const start = new Date(block.startsAt).getTime();
    const end = new Date(block.endsAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= now || end <= start) return 'Pickup blocks must be future windows.';
    if (end - start < PickupIntervalMinutes.Fifteen * 60 * 1000) return 'Pickup blocks must be at least 15 minutes.';
  }
  return null;
};
