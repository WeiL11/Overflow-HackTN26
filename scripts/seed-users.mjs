import { randomUUID } from "node:crypto";

// Reuse a local account by email when an earlier seed or signup gave it a different UUID.
export function resolveSeedUserIds(seedUsers, authUsers) {
  const normalize = email => email?.trim().toLowerCase();
  const result = new Map();
  const used = new Set();
  for (const user of seedUsers) {
    const byEmail = authUsers.find(candidate => normalize(candidate.email) === normalize(user.email));
    const byId = authUsers.find(candidate => candidate.id === user.id);
    const resolvedId = byEmail?.id || (byId ? randomUUID() : user.id);
    if (used.has(resolvedId)) throw new Error(`Duplicate seed account: ${user.email}`);
    used.add(resolvedId);
    result.set(user.id, resolvedId);
  }
  return result;
}
