// Pickup deadlines for seed listings: each pickup spot has a daily "pick up by" time
// (closing time or last pickup), and a listing's expiry_time is the next time that clock
// time comes around in Nashville, so it is always within the next 24 hours.

export const PICKUP_TIME_ZONE = "America/Chicago";

// Milliseconds the time zone's wall clock is ahead of UTC at `date` (negative for the US).
const zoneOffsetMs = (date, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const wallClock = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wallClock - Math.floor(date.getTime() / 1000) * 1000;
};

// "21:00" -> the next 9:00 PM in `timeZone` after `now` (today if still ahead, else tomorrow).
export function nextPickupTime(hhmm, now = new Date(), timeZone = PICKUP_TIME_ZONE) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm));
  if (!match) throw new Error(`Invalid pickup time "${hhmm}" (expected HH:MM).`);
  const offset = zoneOffsetMs(now, timeZone);
  const wallNow = new Date(now.getTime() + offset);
  const wallTarget = Date.UTC(wallNow.getUTCFullYear(), wallNow.getUTCMonth(), wallNow.getUTCDate(), +match[1], +match[2]);
  let target = wallTarget - offset;
  if (target <= now.getTime()) target += 24 * 60 * 60 * 1000;
  return new Date(target);
}

// A listing's deadline: its daily pickupBy time, or (older seed files) an hour offset capped at 24h.
export function listingExpiry(listing, now = new Date()) {
  if (listing.pickupBy) return nextPickupTime(listing.pickupBy, now);
  const hours = Math.min(Number(listing.expiryOffsetHours) || 24, 24);
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

const SLOT_MS = 15 * 60 * 1000;

// Up to `max` back-to-back 15-minute pickup slots from the next quarter hour that end by
// the pickup deadline. Each slot holds one request, so a listing needs several to be shared.
export function pickupSlotsUntil(listingId, expiry, capacity, now = new Date(), max = 8) {
  const slots = [];
  let start = Math.ceil(now.getTime() / SLOT_MS) * SLOT_MS;
  while (slots.length < max && start + SLOT_MS <= expiry.getTime()) {
    slots.push({
      listing_id: listingId,
      capacity,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + SLOT_MS).toISOString(),
    });
    start += SLOT_MS;
  }
  return slots;
}
