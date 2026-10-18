import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { resolveSeedUserIds } from "./seed-users.mjs";
import { generateDevAccounts } from "./generate-dev-accounts.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedDataPath = path.join(rootDir, "supabase", "seed-data.json");
const envLocalPath = path.join(rootDir, ".env.local");

const parseStatusEnv = (output) =>
  Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^"(.*)"$/, "$1")]),
  );

const getLocalCredentials = () => {
  try {
    const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15000,
    });
    const values = parseStatusEnv(output);
    const required = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"];
    if (required.some((key) => !values[key])) {
      throw new Error("Supabase status did not return the required local credentials.");
    }
    const apiUrl = new URL(values.API_URL);
    if (!["localhost", "127.0.0.1"].includes(apiUrl.hostname)) {
      throw new Error("Seeding is only allowed against a local Supabase API.");
    }
    return { apiUrl: apiUrl.toString().replace(/\/$/, ""), anonKey: values.ANON_KEY, serviceRoleKey: values.SERVICE_ROLE_KEY };
  } catch (error) {
    if (error instanceof Error && error.message.includes("required local credentials")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("only allowed")) {
      throw error;
    }
    throw new Error("Unable to read local Supabase status.");
  }
};

const assertResponse = ({ data, error }, operation) => {
  if (error) {
    throw new Error(`${operation} failed: ${error.message}`);
  }
  return data;
};

const seed = async () => {
  const credentials = getLocalCredentials();
  const seedData = JSON.parse(await readFile(seedDataPath, "utf8"));
  if (!Array.isArray(seedData.users) || !Array.isArray(seedData.listings) || !Array.isArray(seedData.pickupSlots) || !Array.isArray(seedData.requests)) {
    throw new Error("Seed data must contain users, listings, pickupSlots, and requests arrays.");
  }

  const admin = createClient(credentials.apiUrl, credentials.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const password = process.env.SEED_PASSWORD || "overflowDev123!";
  const authUsers = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Listing auth users failed: ${error.message}`);
    authUsers.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const userIds = resolveSeedUserIds(seedData.users, authUsers);

  for (const user of seedData.users) {
    const userId = userIds.get(user.id);
    const existing = authUsers.some(candidate => candidate.id === userId);
    const existingByEmail = authUsers.find((candidate) => candidate.email === user.email);
    if (existingByEmail && existingByEmail.id !== userId) {
      throw new Error(`Auth email is already assigned to another user: ${user.email}`);
    }
    const attributes = {
      id: userId,
      email: user.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName, role: user.role },
    };
    if (existing) {
      const response = await admin.auth.admin.updateUserById(userId, attributes);
      assertResponse(response, `Updating auth user ${user.email}`);
    } else {
      const response = await admin.auth.admin.createUser(attributes);
      assertResponse(response, `Creating auth user ${user.email}`);
    }
    const profileResponse = await admin.from("profiles").upsert(
      { user_id: userId, full_name: user.fullName, role: user.role },
      { onConflict: "user_id" },
    );
    assertResponse(profileResponse, `Upserting profile ${user.email}`);
  }

  const expiryBase = Date.now();
  const listings = seedData.listings.map((listing) => ({
    id: listing.id,
    donor_id: userIds.get(listing.donorId) || listing.donorId,
    food_name: listing.foodName,
    quantity: listing.quantity,
    original_quantity: listing.originalQuantity ?? listing.quantity,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    photo_metadata: listing.photoMetadata || null,
    location: listing.location,
    notes: listing.notes || null,
    expiry_time: new Date(expiryBase + listing.expiryOffsetHours * 60 * 60 * 1000).toISOString(),
    status: listing.status,
  }));
  assertResponse(await admin.from("food_listings").upsert(listings, { onConflict: "id" }), "Upserting food listings");

  const pickupBase = Math.ceil(Date.now() / (15 * 60 * 1000)) * 15 * 60 * 1000;
  const pickupSlots = seedData.pickupSlots.map((slot) => {
    const startsAt = new Date(pickupBase + slot.startOffsetHours * 60 * 60 * 1000);
    return {
      id: slot.id,
      listing_id: slot.listingId,
      capacity: slot.capacity,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 15 * 60 * 1000).toISOString(),
    };
  });
  for (const [index, slot] of pickupSlots.entries()) {
    const temporaryStart = new Date(Date.UTC(2099, 0, index + 1));
    assertResponse(await admin.from("pickup_slots").update({
      starts_at: temporaryStart.toISOString(),
      ends_at: new Date(temporaryStart.getTime() + 15 * 60 * 1000).toISOString(),
    }).eq("id", slot.id), `Preparing pickup slot ${slot.id}`);
  }
  assertResponse(await admin.from("pickup_slots").upsert(pickupSlots, { onConflict: "id" }), "Upserting pickup slots");

  const requests = seedData.requests.map((request) => ({
    id: request.id,
    listing_id: request.listingId,
    receiver_id: userIds.get(request.receiverId) || request.receiverId,
    status: request.status,
    quantity: request.quantity,
    notes: request.notes || null,
    pickup_confirmed_at: null,
    status_note: null,
    status_note_author: null,
  }));
  assertResponse(await admin.from("food_requests").upsert(requests, { onConflict: "id" }), "Upserting food requests");
  for (const request of seedData.requests) {
    assertResponse(await admin.from("request_pickup_allocations").delete().eq("request_id", request.id), `Clearing allocations for request ${request.id}`);
    const allocations = (request.allocations || []).map(allocation => ({
      request_id: request.id,
      pickup_slot_id: allocation.slotId,
      quantity: allocation.quantity,
    }));
    if (allocations.length > 0) {
      assertResponse(await admin.from("request_pickup_allocations").insert(allocations), `Inserting allocations for request ${request.id}`);
    }
  }

  await writeFile(
    envLocalPath,
    `VITE_SUPABASE_URL=${credentials.apiUrl}\nVITE_SUPABASE_PUBLISHABLE_KEY=${credentials.anonKey}\nVITE_SUPABASE_PROJECT_ID="local"\n`,
  );
  await generateDevAccounts(password);
  console.log("Local Supabase seed completed.");
};

try {
  await seed();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local Supabase seed failed.");
  process.exitCode = 1;
}
