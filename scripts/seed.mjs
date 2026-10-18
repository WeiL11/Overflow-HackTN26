import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { resolveSeedUserIds } from "./seed-users.mjs";
import { listingExpiry } from "./seed-time.mjs";
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
  if (!Array.isArray(seedData.users) || !Array.isArray(seedData.listings) || !Array.isArray(seedData.requests)) {
    throw new Error("Seed data must contain users, listings, and requests arrays.");
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

  const seededAt = new Date();
  const listings = seedData.listings.map((listing) => ({
    id: listing.id,
    donor_id: userIds.get(listing.donorId) || listing.donorId,
    food_name: listing.foodName,
    category: listing.category ?? "other",
    tags: listing.tags ?? [],
    description: listing.description ?? null,
    quantity: listing.quantity,
    location: listing.location,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    notes: listing.notes || null,
    expiry_time: listingExpiry(listing, seededAt).toISOString(),
    status: listing.status,
  }));
  assertResponse(await admin.from("food_listings").upsert(listings, { onConflict: "id" }), "Upserting food listings");

  const requests = seedData.requests.map((request) => ({
    id: request.id,
    listing_id: request.listingId,
    receiver_id: userIds.get(request.receiverId) || request.receiverId,
    status: request.status,
    quantity: request.quantity,
    notes: request.notes || null,
  }));
  assertResponse(await admin.from("food_requests").upsert(requests, { onConflict: "id" }), "Upserting food requests");

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
