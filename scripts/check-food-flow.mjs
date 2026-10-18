import { buildFoodQuery } from '../supabase/functions/_shared/food-query.js';
// Local integration check: uses seeded accounts, creates and removes its own test data.
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const env = Object.fromEntries(output.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  return match ? [[match[1], match[2]]] : [];
}));
assert(['127.0.0.1', 'localhost'].includes(new URL(env.API_URL).hostname));
const client = () => createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const donor = client(); const receiver = client();
const check = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
const password = process.env.SEED_PASSWORD || 'overlfowDev123!';
const { user } = check(await donor.auth.signInWithPassword({ email: 'donor@overlfow.local', password }));
check(await receiver.auth.signInWithPassword({ email: 'receiver@overlfow.local', password }));
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const id = randomUUID();
const path = `${user.id}/${id}.png`;
try {
  check(await donor.storage.from('food-photos').upload(path, image, { contentType: 'image/png' }));
  const draftRead = await receiver.storage.from('food-photos').download(path);
  assert(draftRead.error, 'Receiver must not read unattached photos');
  check(await donor.from('food_listings').insert({ id, donor_id: user.id, food_name: 'Integration test', quantity: 1, location: 'Test kitchen', expiry_time: new Date(Date.now() + 3600000).toISOString(), photo_path: path, photo_metadata: { original_name: 'test.png', original_type: 'image/png', original_bytes: image.length, original_width: 1, original_height: 1, stored_width: 1, stored_height: 1, stored_bytes: image.length, stored_type: 'image/png' }, photo_uploaded_at: '2000-01-01T00:00:00Z', food_analysis: { description: 'Integration test description', ...buildFoodQuery({ isFood: true, foodName: 'Apples', description: 'Integration test description', model: 'integration-check', keywords: ['apple', 'bag'], visibleItems: [] }) } }));
  const listing = check(await receiver.from('food_listings').select('photo_path, food_analysis, photo_metadata, photo_uploaded_at').eq('id', id).single());
  assert.equal(listing.photo_path, path);
  assert.equal(listing.photo_metadata.original_name, 'test.png');
  assert(Date.now() - Date.parse(listing.photo_uploaded_at) < 60000, 'Photo timestamp must be set by the database');
  check(await donor.from('food_listings').update({ food_name: 'Edited integration test', photo_uploaded_at: '2000-01-01T00:00:00Z' }).eq('id', id));
  const edited = check(await donor.from('food_listings').select('photo_uploaded_at').eq('id', id).single());
  assert.equal(edited.photo_uploaded_at, listing.photo_uploaded_at, 'Editing a listing must preserve its photo timestamp');
  assert.equal(listing.food_analysis.description, 'Integration test description');
  assert.deepEqual(listing.food_analysis.keywords, ['apple', 'bag']);
  assert.equal(listing.food_analysis.llm_query.schema_version, 1);
  assert.deepEqual(JSON.parse(listing.food_analysis.llm_query.messages[1].content).keywords, ['apple', 'bag']);
  check(await receiver.storage.from('food-photos').download(path));
  check(await receiver.storage.from('food-photos').createSignedUrl(path, 60));
  console.log('PASS: upload, persisted image metadata and server timestamp, keywords/LLM query, listing/analysis, private draft isolation, receiver photo access');
  if (process.env.CHECK_AI === '1') {
    const body = new FormData();
    body.append('photo', new Blob([image], { type: 'image/png' }), 'test.png');
    const result = await donor.functions.invoke('analyze-food', { body });
    if (result.error) {
      const detail = await result.error.context?.json().catch(() => null);
      throw new Error(`Live AI failed: ${detail?.error || result.error.message}`);
    }
    assert.equal(typeof result.data.analysis.contains_food, 'boolean');
    assert(Array.isArray(result.data.analysis.keywords), 'Analyzer must return structured keywords');
    if (!result.data.analysis.contains_food) assert.equal(result.data.analysis.llm_query, null);
    else assert.equal(result.data.analysis.llm_query.schema_version, 1);
    console.log('PASS: authenticated live AI returned structured analysis and keyword/query fields');
  }
} finally {
  check(await donor.from('food_listings').delete().eq('id', id));
  check(await donor.storage.from('food-photos').remove([path]));
  await donor.auth.signOut(); await receiver.auth.signOut();
}
