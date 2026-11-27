import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config, ssoConfigured } from './config.mjs';
import { getUser, now, signInUser, statement } from './db.mjs';

export const SESSION_COOKIE = 'fitdle_session';
// Binds a login to the browser that started it; several tabs may log in at once.
const STATE_COOKIE = 'fitdle_sso';
const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_STATES = 5;
const METADATA_TTL_MS = 5 * 60 * 1000;
let metadataCache = null;
let jwksCache = null;

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function nameKey(name) {
  return String(name).normalize('NFKC').trim().toLowerCase();
}

export function characterIdFromSubject(subject) {
  const match = /^CHARACTER:EVE:(\d{1,20})$/.exec(String(subject || '').trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function safeReturn(value) {
  const text = String(value || '/');
  if (!text.startsWith('/') || text.startsWith('//') || text.includes('\\')) return '/';
  return text;
}

async function getMetadata() {
  if (metadataCache && Date.now() - metadataCache.at < METADATA_TTL_MS) return metadataCache.value;
  const response = await fetch(config.eve.metadataUrl, {
    headers: { Accept: 'application/json', 'User-Agent': config.userAgent },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`SSO metadata ${response.status}`);
  const value = await response.json();
  metadataCache = { at: Date.now(), value };
  return value;
}

async function getJwks() {
  const metadata = await getMetadata();
  const uri = String(metadata.jwks_uri || '');
  if (!uri) throw new Error('SSO jwks_uri missing');
  if (!jwksCache || jwksCache.uri !== uri) jwksCache = { uri, set: createRemoteJWKSet(new URL(uri)) };
  return jwksCache.set;
}

async function exchangeCode(metadata, code, verifier) {
  const tokenEndpoint = String(metadata?.token_endpoint || '');
  if (!tokenEndpoint) throw new Error('SSO token_endpoint missing');
  const basic = Buffer.from(`${config.eve.clientId}:${config.eve.clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
  });
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': config.userAgent,
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`SSO token ${response.status}`);
  return response.json();
}

async function verifyAccessToken(token) {
  const jwks = await getJwks();
  const { payload } = await jwtVerify(token, jwks, {
    issuer: ['https://login.eveonline.com', 'login.eveonline.com'],
    clockTolerance: 30,
  });
  const audiences = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud].filter(Boolean);
  if (!audiences.includes('EVE Online') || !audiences.includes(config.eve.clientId)) {
    throw new Error('SSO token audience mismatch');
  }
  return identityFromClaims(payload);
}

/**
 * What a verified token says about the pilot. `owner` changes when the character
 * moves to another EVE account; only its hash leaves this function.
 */
export function identityFromClaims(payload) {
  const name = String(payload?.name || '').trim();
  if (!name) throw new Error('SSO token has no name');
  return {
    name,
    characterId: characterIdFromSubject(payload?.sub),
    ownerHash: ownerHashOf(payload?.owner),
  };
}

function ownerHashOf(owner) {
  const value = typeof owner === 'string' ? owner.trim() : '';
  return value ? hashToken(value) : null;
}

export function createSession(name, reply) {
  const token = randomToken();
  const t = now();
  statement('DELETE FROM sessions WHERE expires_at <= ?').run(t);
  statement('INSERT INTO sessions(token_hash, name_key, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), nameKey(name), t, t + config.sessionTtlMs);
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

export function destroySession(request, reply) {
  const token = request.cookies?.[SESSION_COOKIE];
  if (token) statement('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function getSessionUser(request) {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const session = statement('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(hashToken(token), now());
  if (!session) return null;
  return getUser(session.name_key);
}

function browserStates(request) {
  return String(request.cookies?.[STATE_COOKIE] || '').split('.').filter((value) => /^[\w-]{16,64}$/.test(value));
}

function setBrowserStates(reply, states) {
  reply.setCookie(STATE_COOKIE, states.slice(-MAX_STATES).join('.'), {
    path: '/api/v1/auth/eve',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: Math.floor(STATE_TTL_MS / 1000),
  });
}

function loginFailed(reply, reason) {
  return reply.redirect(`${config.publicOrigin}/?auth_error=${reason}`);
}

/** `onAccountReplaced(nameKey)` runs when a sign-in starts a name over. */
export function registerAuthRoutes(app, { onAccountReplaced = null } = {}) {
  const signIn = ({ name, characterId, ownerHash }) => signInUser(nameKey(name), name, {
    characterId,
    ownerHash,
    onReplace: onAccountReplaced,
  });

  app.get('/api/v1/auth/me', async (request) => {
    const user = getSessionUser(request);
    return user
      ? {
        loggedIn: true,
        name: user.display_name,
        nameKey: user.name_key,
        characterId: user.character_id == null ? null : Number(user.character_id),
      }
      : { loggedIn: false };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    destroySession(request, reply);
    return { ok: true };
  });

  app.get('/api/v1/auth/eve/start', async (request, reply) => {
    if (!ssoConfigured()) {
      reply.code(503).send({ error: 'sso-not-configured' });
      return;
    }
    let metadata;
    try {
      metadata = await getMetadata();
    } catch {
      return loginFailed(reply, 'sso');
    }
    const state = randomToken(24);
    const verifier = randomToken(32);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const t = now();
    statement('DELETE FROM oauth_states WHERE expires_at <= ?').run(t);
    statement('INSERT INTO oauth_states(state, verifier, return_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(state, verifier, safeReturn(request.query?.return), t, t + STATE_TTL_MS);
    setBrowserStates(reply, [...browserStates(request), state]);
    const url = new URL(metadata.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.eve.clientId);
    url.searchParams.set('redirect_uri', config.eve.redirectUri);
    url.searchParams.set('scope', config.eve.scope);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return reply.redirect(url.toString());
  });

  app.get('/api/v1/auth/eve/callback', async (request, reply) => {
    if (!ssoConfigured()) {
      reply.code(503).send({ error: 'sso-not-configured' });
      return;
    }
    const state = String(request.query?.state || '');
    const code = String(request.query?.code || '');
    const row = statement('SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?').get(state, now());
    const states = browserStates(request);
    if (!row || !code || !states.includes(state)) return loginFailed(reply, 'state');
    statement('DELETE FROM oauth_states WHERE state = ?').run(state);
    setBrowserStates(reply, states.filter((value) => value !== state));
    try {
      const metadata = await getMetadata();
      const token = await exchangeCode(metadata, code, row.verifier);
      const identity = await verifyAccessToken(token.access_token);
      const user = signIn(identity);
      createSession(user.display_name, reply);
      const target = safeReturn(row.return_to);
      const redirect = config.publicOrigin ? `${config.publicOrigin}${target}` : target;
      return reply.redirect(redirect);
    } catch {
      return loginFailed(reply, 'sso');
    }
  });

  if (config.devAuth) {
    app.get('/api/v1/auth/dev', async (request, reply) => {
      const name = String(request.query?.name || '').trim().slice(0, 64);
      if (name.length < 2) {
        reply.code(400).send({ error: 'invalid-name' });
        return;
      }
      const rawCharacterId = request.query?.characterId;
      const characterId = rawCharacterId == null || rawCharacterId === ''
        ? null
        : Number(rawCharacterId);
      if (rawCharacterId != null && rawCharacterId !== ''
        && (!Number.isSafeInteger(characterId) || characterId <= 0)) {
        reply.code(400).send({ error: 'invalid-character-id' });
        return;
      }
      const user = signIn({ name, characterId, ownerHash: ownerHashOf(request.query?.owner) });
      createSession(user.display_name, reply);
      return { ok: true, name: user.display_name, characterId: user.character_id ?? null };
    });
  }
}
