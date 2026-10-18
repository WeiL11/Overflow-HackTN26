// Upload demo food photos (supabase/seed-photos/) to the food-photos bucket and attach them
// to their seed listings. Photos are public domain or CC0 from Wikimedia Commons; the source,
// author and license of each are kept in photo_metadata and in seed-photos/credits.json.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const photosDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "seed-photos");

export async function uploadSeedPhotos(admin, seedData, userIds) {
  let credits;
  try {
    credits = JSON.parse(await readFile(path.join(photosDir, "credits.json"), "utf8"));
  } catch {
    return; // no demo photos in this checkout
  }
  const donors = new Map(seedData.listings.map((listing) => [listing.id, userIds.get(listing.donorId) || listing.donorId]));
  let attached = 0;
  for (const [listingId, credit] of Object.entries(credits)) {
    const donorId = donors.get(listingId);
    if (!donorId) continue;
    const storagePath = `${donorId}/seed-${listingId}.jpg`;
    const bytes = await readFile(path.join(photosDir, credit.file));
    const { error: uploadError } = await admin.storage
      .from("food-photos")
      .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new Error(`Uploading photo for ${listingId} failed: ${uploadError.message}`);
    const { error } = await admin
      .from("food_listings")
      .update({
        photo_path: storagePath,
        photo_metadata: { source: credit.source, title: credit.title, author: credit.author, license: credit.license },
      })
      .eq("id", listingId);
    if (error) throw new Error(`Attaching photo to ${listingId} failed: ${error.message}`);
    attached += 1;
  }
  console.log(`Attached ${attached} demo photo${attached === 1 ? "" : "s"}.`);
}
