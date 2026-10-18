import { pickupSlotsUntil } from "./seed-time.mjs";

// Replace a demo listing's pickup slots that nobody has booked with fresh 15-minute slots
// ending by its deadline. Slots already allocated to a request are left in place.
export async function replaceOpenPickupSlots(admin, listingId, expiry, capacity, now = new Date()) {
  const { data: slots, error } = await admin
    .from("pickup_slots")
    .select("id, allocations:request_pickup_allocations(request_id)")
    .eq("listing_id", listingId);
  if (error) throw new Error(`Loading pickup slots for ${listingId} failed: ${error.message}`);
  const open = slots.filter((slot) => slot.allocations.length === 0).map((slot) => slot.id);
  if (open.length > 0) {
    const { error: deleteError } = await admin.from("pickup_slots").delete().in("id", open);
    if (deleteError) throw new Error(`Clearing pickup slots for ${listingId} failed: ${deleteError.message}`);
  }
  const fresh = pickupSlotsUntil(listingId, expiry, capacity, now);
  if (fresh.length > 0) {
    const { error: insertError } = await admin
      .from("pickup_slots")
      .upsert(fresh, { onConflict: "listing_id,starts_at", ignoreDuplicates: true });
    if (insertError) throw new Error(`Creating pickup slots for ${listingId} failed: ${insertError.message}`);
  }
  return fresh.length;
}
