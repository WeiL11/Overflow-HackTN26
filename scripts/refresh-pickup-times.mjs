// Keep the demo data alive: seed listings whose pickup deadline has passed are moved to the
// spot's next daily pickup time (always within 24h). Only seed listings that are still
// available are touched; user-created listings, requests and quantities are left alone.
// Run it on a schedule (deploy.sh installs a systemd timer on the server).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { getLocalCredentials } from "./local-supabase.mjs";
import { listingExpiry } from "./seed-time.mjs";
import { replaceOpenPickupSlots } from "./seed-slots.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedData = JSON.parse(await readFile(path.join(rootDir, "supabase", "seed-data.json"), "utf8"));
const credentials = getLocalCredentials();
const admin = createClient(credentials.apiUrl, credentials.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const now = new Date();
const { data: expired, error } = await admin
  .from("food_listings")
  .select("id, quantity")
  .in("id", seedData.listings.map((listing) => listing.id))
  .eq("status", "available")
  .lte("expiry_time", now.toISOString());
if (error) throw new Error(`Loading expired demo listings failed: ${error.message}`);

const byId = new Map(seedData.listings.map((listing) => [listing.id, listing]));
for (const { id, quantity } of expired) {
  const expiry = listingExpiry(byId.get(id), now);
  const { error: updateError } = await admin
    .from("food_listings")
    .update({ expiry_time: expiry.toISOString() })
    .eq("id", id);
  if (updateError) throw new Error(`Updating ${id} failed: ${updateError.message}`);
  // New deadline, new pickup slots (the old ones are in the past).
  await replaceOpenPickupSlots(admin, id, expiry, quantity, now);
}
console.log(`Refreshed ${expired.length} demo pickup deadline${expired.length === 1 ? "" : "s"}.`);
