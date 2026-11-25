/**
 * Small bounded cache for upstream responses. Entries expire after `ttlMs`, the
 * oldest entry is dropped once `max` is exceeded, and concurrent loads of one
 * key share a single request. Failed loads are never cached.
 */
export class TtlCache {
  constructor({ ttlMs, max, clock = Date.now }) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.clock = clock;
    this.entries = new Map();
    this.pending = new Map();
  }

  get size() {
    return this.entries.size;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.clock() - entry.at < this.ttlMs) return entry.value;
    this.entries.delete(key);
    return undefined;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { at: this.clock(), value });
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value);
  }

  async load(key, loader) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this.pending.has(key)) return this.pending.get(key);
    const request = (async () => {
      try {
        const value = await loader();
        this.set(key, value);
        return value;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, request);
    return request;
  }

  /** Remove a key, but only while it still holds the given value. */
  delete(key, value) {
    if (this.entries.get(key)?.value === value) this.entries.delete(key);
  }

  prune() {
    const t = this.clock();
    for (const [key, entry] of this.entries) {
      if (t - entry.at >= this.ttlMs) this.entries.delete(key);
    }
  }

  clear() {
    this.entries.clear();
  }
}
