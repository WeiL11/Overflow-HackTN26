// Exercise the text upgrade and repeat application inside a rolled-back scratch schema.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const project = readFileSync('supabase/config.toml', 'utf8').match(/project_id\s*=\s*"([^"]+)"/)[1];
const schema = `migration_check_${randomUUID().replaceAll('-', '')}`;
const migration = readFileSync('supabase/migrations/20261017000001_add_atomic_request_quantities.sql', 'utf8').replaceAll('public', schema);
const sql = `BEGIN;
CREATE SCHEMA ${schema};
CREATE TABLE ${schema}.profiles (user_id uuid, role text);
CREATE TABLE ${schema}.food_listings (id uuid, donor_id uuid, quantity text NOT NULL, status text, expiry_time timestamptz);
CREATE TABLE ${schema}.food_requests (id uuid, listing_id uuid, receiver_id uuid, status text);
INSERT INTO ${schema}.food_listings (quantity) VALUES ('5 packs'), ('12');
${migration}
DO $$ BEGIN
  IF (SELECT sum(quantity) FROM ${schema}.food_listings) <> 17 THEN RAISE EXCEPTION 'Text conversion changed quantities'; END IF;
END $$;
UPDATE ${schema}.food_listings SET quantity = 0 WHERE quantity = 5;
${migration}
DO $$ BEGIN
  IF (SELECT sum(quantity) FROM ${schema}.food_listings) <> 12 THEN RAISE EXCEPTION 'Repeat migration changed quantities'; END IF;
END $$;
ROLLBACK;`;
execFileSync('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
console.log('PASS: text quantity conversion, existing integer/zero quantities, repeat application; scratch schema rolled back');
