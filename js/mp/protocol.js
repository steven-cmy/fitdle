/**
 * Multiplayer wire protocol. Every message is versioned JSON and every field
 * that comes from another browser is validated before it reaches the UI.
 */

// 2: race rounds keep the answer on the service (boards over the socket).
export const PROTOCOL_VERSION = 2;
export const MAX_MESSAGE_BYTES = 16384;
export const MAX_NAME = 24;
export const MAX_TEXT = 120;

export const HOST_TYPES = new Set([
  'welcome', 'error', 'room', 'start', 'target', 'tick', 'roundResult',
  'settle', 'gameEnd', 'ping', 'pong', 'bye', 'chat-ack', 'chat-error',
]);

export const DEALER_TYPES = new Set([
  'dealerReady', 'clue', 'solved', 'chat', 'dealerResult', 'dealerError',
]);

const MESSAGE_TYPES = new Set([
  'hello', 'welcome', 'error', 'room', 'start', 'target', 'tick', 'result',
  'roundResult', 'dealerReady', 'clue', 'guess', 'solved', 'chat', 'settle',
  'dealerResult', 'dealerError', 'gameEnd', 'ping', 'pong', 'bye', 'chat-ack', 'chat-error',
]);

export function encodeMessage(message) {
  const body = JSON.stringify(message);
  if (new TextEncoder().encode(body).byteLength > MAX_MESSAGE_BYTES) {
    throw new Error('message too large');
  }
  return body;
}

export function decodeMessage(raw) {
  if (raw && typeof raw === 'object') {
    if (Number(raw.v) !== PROTOCOL_VERSION || !MESSAGE_TYPES.has(raw.t)) return null;
    return raw;
  }
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  if (!text || new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Number(value.v) !== PROTOCOL_VERSION || !MESSAGE_TYPES.has(value.t)) return null;
  return value;
}

export function sanitizeName(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

export function normalizeName(raw) {
  return sanitizeName(raw).toLocaleLowerCase();
}

export function sanitizeText(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

export function sanitizeChatText(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trimEnd())
    .join('\n')
    .trim()
    .slice(0, MAX_TEXT);
}

export function validName(raw) {
  const name = sanitizeName(raw);
  return name.length >= 2 && name.length <= MAX_NAME;
}

/**
 * Only the fields a dealer may expose before settlement. Bonus text is
 * localized for every client; equipment/identity values are resolved from
 * each client's own refs. No ship id, killmail id, victim or full clue list.
 */
export function clueForWire(clue) {
  if (!clue || typeof clue !== 'object') return null;
  // Bonus text is attached by the authority under `text` (all locales).
  const payload = {
    i: Number(clue.i ?? clue.index ?? -1),
    k: String(clue.k ?? ''),
    c: String(clue.c ?? ''),
    v: clue.v,
    w: Number(clue.w) || 0,
  };
  if (Array.isArray(clue.tags) && clue.tags.length) payload.tags = clue.tags.map(String).slice(0, 4);
  if (clue.k === 'bonus' && clue.text && typeof clue.text === 'object') {
    payload.text = Object.fromEntries(
      Object.entries(clue.text).map(([lang, text]) => [String(lang), String(text ?? '').slice(0, 240)]),
    );
  }
  return payload;
}

export function validClueForWire(clue) {
  if (!clue || typeof clue !== 'object') return false;
  if (!Number.isInteger(clue.i) || clue.i < 0) return false;
  if (!clue.k || !clue.c) return false;
  if (!Number.isFinite(Number(clue.w))) return false;
  if (clue.k === 'bonus' && (!clue.text || typeof clue.text !== 'object')) return false;
  return true;
}

export function validHello(message) {
  if (!message || message.t !== 'hello') return false;
  if (!validName(message.name)) return false;
  if (message.password != null && String(message.password).length > 64) return false;
  return true;
}

/** Sliding-window rate limiter for guest messages. */
export class RateLimiter {
  constructor({ messages = 5, guesses = 2, windowMs = 1000 } = {}) {
    this.messages = Math.max(1, Number(messages) || 5);
    this.guesses = Math.max(1, Number(guesses) || 2);
    this.windowMs = Math.max(100, Number(windowMs) || 1000);
    this.state = new Map();
  }

  allow(key, kind = 'message', now = Date.now()) {
    const id = String(key);
    const bucket = this.state.get(id) || { message: [], guess: [] };
    const list = kind === 'guess' ? bucket.guess : bucket.message;
    const max = kind === 'guess' ? this.guesses : this.messages;
    const cutoff = now - this.windowMs;
    while (list.length && list[0] < cutoff) list.shift();
    if (list.length >= max) return false;
    list.push(now);
    this.state.set(id, bucket);
    return true;
  }

  clear(key) {
    this.state.delete(String(key));
  }
}
