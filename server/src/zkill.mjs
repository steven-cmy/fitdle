import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { slimKillmails } from '../../js/killmail.js';
import { freshnessMs, retryAfterMs } from '../../js/retry-after.js';
import { config } from './config.mjs';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1000;
// Wait out a short server pause; report longer ones to the caller at once.
const MAX_WAIT_MS = 10_000;
const CACHE_BYTES = 96 * 1024 * 1024;

export class ZkillError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ZkillError';
    this.status = status;
  }
}

/**
 * The only way the service talks to zKillboard: identified by User-Agent, one
 * shared response cache that honours the upstream freshness (one hour), one
 * request per path at a time, spaced requests, and one pause for everybody when
 * zKillboard asks to slow down.
 */
export class ZkillClient {
  constructor({
    base, userAgent, minIntervalMs = 250, concurrency = 2,
    cacheBytes = CACHE_BYTES, clock = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }) {
    this.base = base;
    this.userAgent = userAgent;
    this.minIntervalMs = minIntervalMs;
    this.concurrency = concurrency;
    this.cacheBytes = cacheBytes;
    this.clock = clock;
    this.sleep = sleep;
    this.reset();
  }

  reset() {
    this.entries = new Map();
    this.pending = new Map();
    this.bytes = 0;
    this.active = 0;
    this.waiters = [];
    this.nextStart = 0;
    this.pausedUntil = 0;
  }

  /** Parsed JSON for an API path plus the time until it may be reused. */
  async get(pathname) {
    const entry = this.entries.get(pathname);
    if (entry) {
      if (entry.expiresAt > this.clock()) {
        return { data: JSON.parse(await gunzip(entry.body)), expiresAt: entry.expiresAt };
      }
      this.drop(pathname);
    }
    if (this.pending.has(pathname)) return this.pending.get(pathname);
    const request = this.load(pathname).finally(() => this.pending.delete(pathname));
    this.pending.set(pathname, request);
    return request;
  }

  async load(pathname) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.request(pathname);
      } catch (error) {
        const retryable = error.status === 429 || error.status >= 500 || error.status === 0;
        if (attempt >= 1 || !retryable) throw error;
        if (this.pausedUntil - this.clock() > MAX_WAIT_MS) throw error;
        await this.sleep(RETRY_DELAY_MS);
      }
    }
  }

  async request(pathname) {
    await this.acquire();
    let response;
    let body;
    try {
      response = await globalThis.fetch(`${this.base()}${pathname}`, {
        headers: { Accept: 'application/json', 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 429 || response.status === 503) {
        const wait = retryAfterMs(response.headers.get('retry-after'), {
          now: this.clock(), fallbackMs: response.status === 429 ? 60_000 : 5000,
        });
        this.pausedUntil = Math.max(this.pausedUntil, this.clock() + wait);
      }
      if (!response.ok) throw new ZkillError(`zKill ${response.status}`, response.status);
      body = await response.text();
    } catch (error) {
      throw error instanceof ZkillError ? error : new ZkillError(error?.message || 'zKill unavailable');
    } finally {
      this.release();
    }
    let data;
    try {
      data = slimKillmails(JSON.parse(body));
    } catch {
      throw new ZkillError('zKill returned invalid JSON', 502);
    }
    const now = this.clock();
    const fresh = freshnessMs(response.headers, { now });
    if (fresh > 0) await this.store(pathname, JSON.stringify(data), now + fresh);
    return { data, expiresAt: now + fresh };
  }

  async acquire() {
    for (;;) {
      const now = this.clock();
      const pause = this.pausedUntil - now;
      if (pause > MAX_WAIT_MS) {
        // Pass the turn on, or everyone queued behind this request would wait forever.
        this.wakeNext();
        throw new ZkillError('zKill asked to slow down', 429);
      }
      if (pause > 0) {
        await this.sleep(pause);
        continue;
      }
      if (this.active >= this.concurrency) {
        await new Promise((resolve) => this.waiters.push(resolve));
        continue;
      }
      // Reserve the slot and the start time before waiting for it.
      this.active += 1;
      const startAt = Math.max(now, this.nextStart);
      this.nextStart = startAt + this.minIntervalMs;
      if (startAt > now) await this.sleep(startAt - now);
      if (this.pausedUntil <= this.clock()) return;
      // The upstream asked to slow down while this request waited for its turn.
      this.release();
    }
  }

  release() {
    this.active -= 1;
    this.wakeNext();
  }

  wakeNext() {
    this.waiters.shift()?.();
  }

  async store(pathname, body, expiresAt) {
    const packed = await gzip(body);
    this.drop(pathname);
    this.entries.set(pathname, { body: packed, expiresAt });
    this.bytes += packed.length;
    while (this.bytes > this.cacheBytes && this.entries.size > 1) this.drop(this.entries.keys().next().value);
  }

  drop(pathname) {
    const entry = this.entries.get(pathname);
    if (!entry) return;
    this.bytes -= entry.body.length;
    this.entries.delete(pathname);
  }

  prune() {
    const now = this.clock();
    for (const [pathname, entry] of this.entries) if (entry.expiresAt <= now) this.drop(pathname);
  }
}

export const zkill = new ZkillClient({
  base: () => String(config.manifest?.zkillboard?.baseUrl || 'https://zkillboard.com').replace(/\/$/, ''),
  userAgent: config.userAgent,
  minIntervalMs: config.zkillMinIntervalMs,
});

/** fetch-shaped adapter for code shared with the browser (js/mp/target.js). */
export async function zkillFetch(url) {
  const base = zkill.base();
  const pathname = String(url).startsWith(base) ? String(url).slice(base.length) : new URL(String(url)).pathname;
  try {
    const { data } = await zkill.get(pathname);
    return { ok: true, status: 200, headers: new Headers(), json: async () => data };
  } catch {
    // The client already retried; a non-retryable status stops another round.
    return { ok: false, status: 424, headers: new Headers(), json: async () => null };
  }
}
