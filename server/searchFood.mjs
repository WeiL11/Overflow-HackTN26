// Pure helpers for POST /api/search-food: build the catalog the model sees,
// validate what it returns, and rank listings by keywords when the model is unavailable.
// Keep CATEGORIES/TAGS in sync with the food_listings migration and src/config/foodTaxonomy.ts.

export const CATEGORIES = [
  "produce", "bakery", "prepared_meals", "dairy_eggs", "meat_seafood",
  "pantry", "snacks", "beverages", "baby_kids", "frozen", "other",
];

// Dietary tags are hard constraints: a result must carry every one the receiver asked for.
export const DIETARY_TAGS = ["vegetarian", "vegan", "halal", "kosher", "gluten_free", "dairy_free", "nut_free"];
export const TAGS = [
  ...DIETARY_TAGS,
  "cold", "warm", // cold: eat as-is; warm: needs cooking or microwaving
  "snack", "small_meal", "large_meal", // small_meal feeds one person, large_meal a family or group
];

export const MAX_RESULTS = 10;

// Parse the first complete JSON object in a model reply, ignoring any text before or after it.
export function extractJson(text) {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("Model did not return JSON.");
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("Model returned incomplete JSON.");
}

const hoursUntil = (iso, now) => Math.max(0, Math.round((new Date(iso).getTime() - now) / 3_600_000));

// Straight-line (haversine) distance in miles; matches src/lib/geo.ts.
export function distanceMiles(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

// One compact line per listing with short ids (L1, L2, ...) so the prompt stays small
// and the model can't echo back a UUID it made up. With `near`, each line says how far away it is.
export function buildCatalog(listings, now = Date.now(), near = null) {
  const idMap = new Map();
  const lines = listings.map((listing, index) => {
    const shortId = `L${index + 1}`;
    idMap.set(shortId, listing.id);
    return [
      shortId,
      listing.food_name,
      listing.category || "other",
      (listing.tags || []).join(", ") || "no tags",
      `qty ${listing.quantity}`,
      listing.location,
      `expires in ${hoursUntil(listing.expiry_time, now)}h`,
      near && listing.latitude != null && listing.longitude != null
        ? `${distanceMiles(near, { lat: listing.latitude, lng: listing.longitude }).toFixed(1)} mi away`
        : "distance unknown",
      listing.description || "",
    ].join(" | ");
  });
  return { text: lines.join("\n"), idMap };
}

export function buildSearchPrompt(query, catalogText) {
  return `You help people find free food on a food-sharing app. Read what the person needs and pick the
best matching listings from the catalog below.

Rules:
- Only use ids that appear in the catalog. Never invent listings.
- Dietary needs and allergies are strict: "vegan", "halal", "no nuts", "gluten free", etc. must match the
  listing's tags. If a listing does not have the tag, do not return it.
- Consider quantity for group sizes, meal time, whether they can cook or refrigerate, expiry, and distance.
  Respect distance requests: "near me" favors the closest; "within 2 miles" excludes anything farther.
- Include every listing that fits, up to ${MAX_RESULTS}, best match first: ready-made food that matches the
  need ranks above ingredients that need cooking. Return an empty list if nothing fits.
- Use only these categories: ${CATEGORIES.join(", ")}.
- Use only these tags: ${TAGS.join(", ")}.
  "cold" means it can be eaten as-is; "warm" means it needs cooking or microwaving.
  "small_meal" feeds one person; "large_meal" feeds a family or group; "snack" is a snack.
- Only add avoidTags for things the person explicitly rules out (e.g. "I can't cook" -> warm).
  Never put dietary tags in avoidTags: vegan food is also vegetarian, and allergies go in mustHaveTags
  (e.g. "nut allergy" -> nut_free).

Reply with ONLY a JSON object, no markdown:
{
  "summary": string,        // one short sentence restating what they are looking for
  "categories": string[],   // categories that fit the need (may be empty)
  "mustHaveTags": string[], // tags every result should have, e.g. dietary needs
  "avoidTags": string[],    // tags results must NOT have, e.g. "warm" if they cannot cook
  "maxMiles": number | null, // only when they give a distance limit, e.g. "within 2 miles" -> 2
  "results": [{ "id": "L3", "reason": "short reason it fits, under 15 words" }]
}

Catalog (id | name | category | tags | quantity | pickup location | expiry | distance | description):
${catalogText}

What they need: ${JSON.stringify(query)}`;
}

const pickKnown = (values, allowed) =>
  [...new Set((Array.isArray(values) ? values : []).map((v) => String(v).trim().toLowerCase()))]
    .filter((v) => allowed.includes(v));

const labelOf = (value) => value.replaceAll("_", " ");

const milesFrom = (near, listing) =>
  near && listing.latitude != null && listing.longitude != null
    ? distanceMiles(near, { lat: listing.latitude, lng: listing.longitude })
    : null;

// A distance limit is only enforced when we know where the receiver is; listings without
// coordinates can't be shown to be close enough, so they are left out too.
const withinLimit = (near, maxMiles) => (listing) => {
  if (!near || maxMiles == null) return true;
  const miles = milesFrom(near, listing);
  return miles != null && miles <= maxMiles;
};

const parseMaxMiles = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : null;
};

// "within 2 miles", "under 3 mi", "less than 1.5 km" -> miles
export function maxMilesFromText(text) {
  const match = String(text).toLowerCase().match(/(?:within|under|less than|no more than|up to)\s+(\d+(?:\.\d+)?)\s*(miles?|mi|km|kilometers?)\b/);
  if (!match) return null;
  return parseMaxMiles(match[2].startsWith("k") ? Number(match[1]) * 0.621371 : Number(match[1]));
}

// Turn raw model JSON into a safe response: known ids only, dietary and avoid tags enforced.
// Models sometimes skip listings that fit, so listings matching the model's own filters
// (all its tags, no avoided tags, one of its categories) are appended after its picks.
// With `near`, a distance limit from the model (or spelled out in the query) is enforced.
export function normalizeSearchResponse(raw, listings, idMap, near = null, query = "") {
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const categories = pickKnown(raw?.categories, CATEGORIES);
  const mustHaveTags = pickKnown(raw?.mustHaveTags, TAGS);
  const avoidTags = pickKnown(raw?.avoidTags, TAGS).filter((tag) => !DIETARY_TAGS.includes(tag));
  const requiredDietary = mustHaveTags.filter((tag) => DIETARY_TAGS.includes(tag));
  const preferredTags = mustHaveTags.filter((tag) => !DIETARY_TAGS.includes(tag));
  const maxMiles = parseMaxMiles(raw?.maxMiles) ?? maxMilesFromText(query);
  const closeEnough = withinLimit(near, maxMiles);
  const allowed = (listing) => {
    const tags = listing.tags || [];
    return requiredDietary.every((tag) => tags.includes(tag)) && !avoidTags.some((tag) => tags.includes(tag)) && closeEnough(listing);
  };

  const seen = new Set();
  const results = [];
  for (const item of Array.isArray(raw?.results) ? raw.results : []) {
    const id = idMap.get(String(item?.id ?? "").trim());
    const listing = id && byId.get(id);
    if (!listing || seen.has(id) || !allowed(listing)) continue;
    seen.add(id);
    results.push({ id, reason: String(item?.reason || "").trim().slice(0, 140) });
    if (results.length === MAX_RESULTS) break;
  }

  if (results.length < MAX_RESULTS && categories.length > 0 && (requiredDietary.length > 0 || preferredTags.length > 0 || maxMiles != null)) {
    const extras = listings
      .filter((listing) => !seen.has(listing.id) && allowed(listing) && categories.includes(listing.category))
      .map((listing) => ({ listing, hits: preferredTags.filter((tag) => (listing.tags || []).includes(tag)) }))
      .filter(({ hits }) => hits.length === preferredTags.length);
    for (const { listing, hits } of extras.slice(0, MAX_RESULTS - results.length)) {
      results.push({ id: listing.id, reason: `Also fits: ${[...requiredDietary, ...hits].map(labelOf).join(", ")}` });
    }
  }

  return {
    summary: String(raw?.summary || "").trim().slice(0, 200),
    filters: { categories, mustHaveTags, avoidTags, maxMiles: near ? maxMiles : null },
    results,
  };
}

// Words people type -> tags/categories, for the keyword fallback.
const SYNONYMS = [
  [/\bvegan|plant[- ]based\b/, { tag: "vegan", required: true }],
  [/\bvegetarian|veggie|no meat\b/, { tag: "vegetarian", required: true }],
  [/\bhalal\b/, { tag: "halal", required: true }],
  [/\bkosher\b/, { tag: "kosher", required: true }],
  [/gluten|celiac|coeliac/, { tag: "gluten_free", required: true }],
  [/dairy[- ]free|no dairy|lactose/, { tag: "dairy_free", required: true }],
  [/\bnuts?\b|peanut|nut[- ]free|nut allerg/, { tag: "nut_free", required: true }],
  [/\bno cook|without cooking|can'?t cook|ready to eat|no kitchen|no microwave|\bcold\b/, { tag: "cold" }],
  [/\bhot\b|\bwarm\b|\bheat|(?<!no )microwave/, { tag: "warm" }],
  [/\bkids?\b|child|toddler|\bbab(y|ies)|infant\b/, { category: "baby_kids" }],
  [/family|people|group|crowd|party|\bfor (3|4|5|6|7|8|9|10)\b/, { tag: "large_meal" }],
  [/just me|myself|one person|single|\bsolo\b/, { tag: "small_meal" }],
  [/snack/, { tag: "snack" }],
  [/fruit|vegetable|produce|salad/, { category: "produce" }],
  [/bread|bak|pastr|bagel|muffin/, { category: "bakery" }],
  [/meal|cooked|hot food/, { category: "prepared_meals" }],
  [/egg|milk|cheese|yogurt/, { category: "dairy_eggs" }],
  [/meat|chicken|fish|beef|turkey/, { category: "meat_seafood" }],
  [/canned|pantry|rice|pasta|beans/, { category: "pantry" }],
  [/drink|water|juice|beverage/, { category: "beverages" }],
  [/frozen/, { category: "frozen" }],
];

const STOP_WORDS = new Set(["a", "an", "the", "for", "and", "or", "of", "to", "i", "me", "my", "we", "need", "want", "some", "food", "with", "please", "any", "something"]);

export function keywordSearch(query, listings, near = null) {
  const maxMiles = near ? maxMilesFromText(query) : null;
  const closeEnough = withinLimit(near, maxMiles);
  const text = String(query).toLowerCase();
  const required = new Set();
  const wantedTags = new Set();
  const wantedCategories = new Set();
  for (const [pattern, hit] of SYNONYMS) {
    if (!pattern.test(text)) continue;
    if (hit.tag) (hit.required ? required : wantedTags).add(hit.tag);
    if (hit.category) wantedCategories.add(hit.category);
  }
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const scored = listings
    .filter((listing) => closeEnough(listing) && [...required].every((tag) => (listing.tags || []).includes(tag)))
    .map((listing) => {
      const tags = listing.tags || [];
      const name = listing.food_name.toLowerCase();
      const description = (listing.description || "").toLowerCase();
      let score = required.size || maxMiles != null ? 2 : 0;
      for (const tag of wantedTags) if (tags.includes(tag)) score += 3;
      if (wantedCategories.has(listing.category)) score += 3;
      for (const word of words) {
        if (name.includes(word)) score += 2;
        else if (description.includes(word)) score += 1;
      }
      return { listing, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    summary: `Keyword matches for "${String(query).trim()}"`,
    filters: { categories: [...wantedCategories], mustHaveTags: [...required, ...wantedTags], avoidTags: [], maxMiles },
    results: scored.slice(0, MAX_RESULTS).map(({ listing }) => ({
      id: listing.id,
      reason: `Matches ${[listing.category, ...(listing.tags || []).filter((t) => required.has(t) || wantedTags.has(t))].map(labelOf).join(", ")}`,
    })),
  };
}
