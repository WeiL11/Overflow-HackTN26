// Small API server for the app's OCI Generative AI features.
//
//   POST /api/analyze-food  { image: "data:image/jpeg;base64,..." }
//   -> { foodName, quantity, shelfLifeHours, description, model }
//   POST /api/search-food   { query: "vegetarian dinner for 4, no nuts" }
//   -> { summary, filters, results: [{ id, reason }], model, fallback }
//
// Requests must carry the signed-in user's Supabase access token so only
// logged-in users can spend OCI credits. OCI credentials come from
// ~/.oci/config (see server/README.md).
import http from "node:http";
import { createRequire } from "node:module";

import { buildCatalog, buildSearchPrompt, keywordSearch, normalizeSearchResponse } from "./searchFood.mjs";

const require = createRequire(import.meta.url);

// Optional local overrides (SUPABASE_ANON_KEY, OCI_*); see server/README.md.
try {
  process.loadEnvFile(new URL("../.env.server", import.meta.url));
} catch {
  // No .env.server: rely on the real environment.
}
const common = require("oci-common");
const inference = require("oci-generativeaiinference");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const SUPABASE_URL = (process.env.SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const OCI_PROFILE = process.env.OCI_CONFIG_PROFILE || "DEFAULT";
const OCI_REGION = process.env.OCI_REGION || "us-chicago-1";
const MODELS = (process.env.OCI_GENAI_MODELS ||
  "meta.llama-4-maverick-17b-128e-instruct-fp8,meta.llama-4-scout-17b-16e-instruct").split(",");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

if (!SUPABASE_ANON_KEY) {
  console.error("SUPABASE_ANON_KEY is required (run `npx supabase status` to find it).");
  process.exit(1);
}

const provider = new common.ConfigFileAuthenticationDetailsProvider(undefined, OCI_PROFILE);
const compartmentId = process.env.OCI_COMPARTMENT_ID || provider.getTenantId();
const client = new inference.GenerativeAiInferenceClient({ authenticationDetailsProvider: provider });
client.endpoint = `https://inference.generativeai.${OCI_REGION}.oci.oraclecloud.com`;

const PROMPT = `You help donors list surplus food on a food-sharing app.
Look at the photo and reply with ONLY a JSON object, no markdown:
{
  "isFood": boolean,            // false if the photo does not show food
  "foodName": string,           // short, specific listing title, e.g. "Margherita pizza", "Mixed fresh fruit"
  "quantity": integer,          // number of items/portions/servings you can count or reasonably estimate, at least 1
  "shelfLifeHours": integer,    // how many hours from now it stays safe to eat, given how it looks (cooked food at room temp ~4, bread ~48, whole fruit ~96, sealed packaged goods ~168)
  "description": string         // one short sentence describing what you see
}`;

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES * 1.4) {
        reject(Object.assign(new Error("Image is too large (max 5 MB)."), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const getUser = async (authHeader) => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authHeader },
  });
  return r.ok ? r.json() : null;
};

const extractJson = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return JSON.");
  return JSON.parse(match[0]);
};

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Ask each model in turn until one returns parseable JSON.
const chatJson = async (content, maxTokens) => {
  let lastError;
  for (const modelId of MODELS) {
    try {
      const response = await client.chat({
        chatDetails: {
          compartmentId,
          servingMode: { servingType: "ON_DEMAND", modelId },
          chatRequest: {
            apiFormat: "GENERIC",
            maxTokens,
            temperature: 0,
            messages: [{ role: "USER", content }],
          },
        },
      });
      const text = response.chatResult.chatResponse.choices[0].message.content
        .map((part) => part.text || "")
        .join("");
      return { raw: extractJson(text), model: modelId };
    } catch (error) {
      lastError = error;
      console.warn(`[ai] ${modelId} failed: ${error.statusCode || ""} ${error.message}`);
    }
  }
  throw lastError;
};

const analyze = async (image) => {
  const { raw, model } = await chatJson([
    { type: "TEXT", text: PROMPT },
    { type: "IMAGE", imageUrl: { url: image } },
  ], 300);
  return {
    isFood: raw.isFood !== false,
    foodName: String(raw.foodName || "").trim().slice(0, 80),
    quantity: clampInt(raw.quantity, 1, 1000, 1),
    shelfLifeHours: clampInt(raw.shelfLifeHours, 1, 24 * 30, 4),
    description: String(raw.description || "").trim().slice(0, 200),
    model,
  };
};

// Available, unexpired listings as the signed-in user sees them (RLS applies).
const fetchAvailableListings = async (authHeader) => {
  const params = new URLSearchParams({
    select: "id,food_name,category,tags,description,quantity,location,expiry_time",
    status: "eq.available",
    expiry_time: `gte.${new Date().toISOString()}`,
    order: "created_at.desc",
    limit: "200",
  });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/food_listings?${params}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authHeader },
  });
  if (!r.ok) throw new Error(`Loading listings failed (${r.status}).`);
  return r.json();
};

const searchFood = async (query, authHeader) => {
  const listings = await fetchAvailableListings(authHeader);
  if (listings.length === 0) {
    return { summary: "", filters: { categories: [], mustHaveTags: [], avoidTags: [] }, results: [], model: null, fallback: false };
  }
  const catalog = buildCatalog(listings);
  try {
    const { raw, model } = await chatJson([{ type: "TEXT", text: buildSearchPrompt(query, catalog.text) }], 900);
    return { ...normalizeSearchResponse(raw, listings, catalog.idMap), model, fallback: false };
  } catch (error) {
    console.warn(`[search-food] falling back to keyword search: ${error.message}`);
    return { ...keywordSearch(query, listings), model: null, fallback: true };
  }
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") return json(res, 200, { ok: true });
    if (req.method === "POST" && req.url === "/api/search-food") {
      const user = await getUser(req.headers.authorization);
      if (!user) return json(res, 401, { error: "Please log in to search with AI." });
      const { query } = JSON.parse((await readBody(req)) || "{}");
      if (typeof query !== "string" || !query.trim() || query.length > 300) {
        return json(res, 400, { error: "Describe what you need in 300 characters or less." });
      }
      const started = Date.now();
      const result = await searchFood(query.trim(), req.headers.authorization);
      console.log(`[search-food] user=${user.id} model=${result.model ?? "keyword"} ${Date.now() - started}ms -> ${result.results.length} results`);
      return json(res, 200, result);
    }
    if (req.method !== "POST" || req.url !== "/api/analyze-food") return json(res, 404, { error: "Not found" });

    const user = await getUser(req.headers.authorization);
    if (!user) return json(res, 401, { error: "Please log in to use photo autofill." });

    const { image } = JSON.parse((await readBody(req)) || "{}");
    if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
      return json(res, 400, { error: "Upload a JPEG, PNG, or WebP image." });
    }

    const started = Date.now();
    const result = await analyze(image);
    console.log(`[analyze-food] user=${user.id} model=${result.model} ${Date.now() - started}ms -> ${result.foodName}`);
    return json(res, 200, result);
  } catch (error) {
    console.error(`[${req.url}]`, error.message);
    const fallbackMessage = req.url === "/api/search-food"
      ? "AI search is unavailable right now. Try a keyword search."
      : "Couldn't analyze the photo. Please fill in the form manually.";
    return json(res, error.status || 502, { error: error.status ? error.message : fallbackMessage });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AI API (analyze-food, search-food) listening on http://${HOST}:${PORT} (models: ${MODELS.join(", ")})`);
});
