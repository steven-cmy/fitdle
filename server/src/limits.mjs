import { now } from './db.mjs';

const windows = new Map();

/** Fixed-window limit: true while `key` stays within `limit` uses per window. */
export function withinLimit(key, limit, windowMs) {
  const at = now();
  let entry = windows.get(key);
  if (!entry || at >= entry.resetAt) {
    entry = { count: 0, resetAt: at + windowMs };
    windows.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function pruneLimits() {
  const at = now();
  for (const [key, entry] of windows) if (at >= entry.resetAt) windows.delete(key);
}
