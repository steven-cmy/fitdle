/**
 * Milliseconds to wait for a Retry-After header, which holds either seconds or
 * an HTTP date. Returns `fallbackMs` when it is missing or unreadable.
 */
export function retryAfterMs(value, { now = Date.now(), fallbackMs = 60_000, maxMs = 15 * 60_000 } = {}) {
  const text = String(value ?? '').trim();
  let wait = fallbackMs;
  if (/^\d+(\.\d+)?$/.test(text)) wait = Number(text) * 1000;
  else if (text) {
    const at = Date.parse(text);
    if (Number.isFinite(at)) wait = at - now;
  }
  return Math.max(0, Math.min(maxMs, wait));
}

/** Milliseconds a response may be reused, from Cache-Control/Age or Expires. */
export function freshnessMs(headers, { now = Date.now(), fallbackMs = 60 * 60_000 } = {}) {
  const control = String(headers?.get?.('cache-control') || '').toLowerCase();
  if (control.includes('no-store')) return 0;
  const maxAge = /(?:^|[,\s])max-age=(\d+)/.exec(control);
  if (maxAge && Number(maxAge[1]) > 0) {
    // A shared cache may have held the response for a while already.
    const age = Math.max(0, Number(headers.get('age')) || 0);
    return Math.max(1000, (Number(maxAge[1]) - age) * 1000);
  }
  const expires = Date.parse(String(headers?.get?.('expires') || ''));
  if (Number.isFinite(expires) && expires > now) return expires - now;
  return fallbackMs;
}
