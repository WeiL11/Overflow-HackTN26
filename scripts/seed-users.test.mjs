import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSeedUserIds } from './seed-users.mjs';

test('reuses existing email UUID and remains stable on repeated seed', () => {
  const users = [{ id: 'seed-donor', email: 'donor@example.test' }];
  const existing = [{ id: 'existing-donor', email: 'DONOR@example.test' }];
  assert.equal(resolveSeedUserIds(users, existing).get('seed-donor'), 'existing-donor');
  assert.deepEqual(resolveSeedUserIds(users, existing), resolveSeedUserIds(users, existing));
});
test('retains deterministic IDs for new accounts', () => {
  assert.equal(resolveSeedUserIds([{ id: 'new', email: 'new@example.test' }], []).get('new'), 'new');
});
test('allocates a new UUID rather than overwriting an unrelated account', () => {
  const ids = resolveSeedUserIds([{ id: 'seed', email: 'donor@example.test' }], [{ id: 'seed', email: 'other@example.test' }]);
  assert.notEqual(ids.get('seed'), 'seed');
  assert.match(ids.get('seed'), /^[0-9a-f-]{36}$/);
});

test('prefers the matching email even when the old seed UUID is occupied', () => {
  const ids = resolveSeedUserIds([{ id: 'seed', email: 'donor@example.test' }], [
    { id: 'seed', email: 'other@example.test' },
    { id: 'actual', email: 'donor@example.test' },
  ]);
  assert.equal(ids.get('seed'), 'actual');
});
