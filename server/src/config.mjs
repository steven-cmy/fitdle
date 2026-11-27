import fs from 'node:fs';
import path from 'node:path';
import { buildUserAgent, parseContact } from '../../js/user-agent.js';
import { resolveGameDayStart } from '../../js/game.js';
import { DEFAULT_GROUP_FACTORS, parseGroupFactors } from './selection.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const manifest = readJson(path.join(ROOT, 'data', 'manifest.json'), {});
const catalog = readJson(path.join(ROOT, 'data', 'catalog.json'), { ships: [] });

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

/** true/false/1/0/yes/no in any case; null for anything else. */
export function parseFlag(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(text)) return true;
  if (['false', '0', 'no'].includes(text)) return false;
  return null;
}

function boundedIntEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function originEnv(name) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must be an http(s) origin`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must not contain credentials, query or hash`);
  }
  return url.origin;
}

const publicOrigin = originEnv('PUBLIC_ORIGIN');
const apiOrigin = originEnv('API_ORIGIN') || publicOrigin;
const redirectUri = apiOrigin ? `${apiOrigin}/api/v1/auth/eve/callback` : '';
const allowedOrigins = publicOrigin && apiOrigin && publicOrigin !== apiOrigin ? [publicOrigin] : [];
const production = process.env.NODE_ENV === 'production';
const loopback = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(publicOrigin ? new URL(publicOrigin).hostname : '');
const devAuth = boolEnv('FITDLE_DEV_AUTH', false);
const warnings = [];
if (production && devAuth && !loopback) {
  warnings.push('FITDLE_DEV_AUTH is ignored: it would let anyone sign in as any pilot');
}
if (production && !String(process.env.SESSION_SECRET || '').trim()) {
  warnings.push('SESSION_SECRET is not set: Daily targets can be predicted from the public default');
}
// Runtime setting: the served manifest and /api/v1/meta carry this value, so it
// takes effect on restart without rebuilding the image.
const gameDayStart = resolveGameDayStart(
  process.env.FITDLE_GAME_DAY_START_UTC,
  Number.isInteger(manifest.gameDayStartMinutes) ? manifest.gameDayStartMinutes : 11 * 60,
);
if (gameDayStart.warning) warnings.push(gameDayStart.warning);
// Applies to Daily targets picked from now on; a day already pinned keeps its target.
const dailyAllowEmptyRaw = String(process.env.FITDLE_DAILY_ALLOW_EMPTY ?? '').trim();
const dailyAllowEmpty = parseFlag(dailyAllowEmptyRaw);
if (dailyAllowEmptyRaw && dailyAllowEmpty === null) {
  warnings.push(`FITDLE_DAILY_ALLOW_EMPTY="${dailyAllowEmptyRaw}" is not true/false/1/0/yes/no; empty hulls stay allowed`);
}
// Per-killmail difficulty counters not played for this long are deleted.
const statsKillRetentionDays = boundedIntEnv('FITDLE_STATS_KILL_RETENTION_DAYS', 60, 1, 3650);
// Target selection: usage bonus, group factors and the prepared-target shelf.
const usageMaxRatioRaw = String(process.env.FITDLE_USAGE_MAX_RATIO ?? '').trim();
let usageMaxRatio = 3;
if (usageMaxRatioRaw) {
  const value = Number(usageMaxRatioRaw);
  if (Number.isFinite(value) && value >= 1 && value <= 20) usageMaxRatio = value;
  else warnings.push(`FITDLE_USAGE_MAX_RATIO="${usageMaxRatioRaw}" must be a number from 1 to 20; 3 is used`);
}
const groupFactorsRaw = process.env.FITDLE_SHIP_GROUP_FACTORS;
const parsedFactors = parseGroupFactors(groupFactorsRaw == null ? DEFAULT_GROUP_FACTORS : groupFactorsRaw);
for (const warning of parsedFactors.warnings) warnings.push(`FITDLE_SHIP_GROUP_FACTORS: ${warning}`);
const usageFile = [
  process.env.FITDLE_SHIP_USAGE_FILE,
  path.join(ROOT, 'data', 'ship-usage.json'),
  path.join(ROOT, '.cache', 'ship-usage.json'),
].filter(Boolean).find((file) => fs.existsSync(file));
const shipUsage = usageFile ? readJson(usageFile, null) : null;
const apiContact = parseContact(process.env.API_CONTACT);
const roomArbitrationBigRounds = boundedIntEnv('ROOM_ARBITRATION_BIG_ROUNDS', 1, 1, 32);
const roomArbitrationMaxBigRounds = boundedIntEnv('ROOM_ARBITRATION_MAX_BIG_ROUNDS', 5, 1, 32);
const roomTimedDurationMinutes = boundedIntEnv('ROOM_TIMED_DURATION_MINUTES', 10, 1, 60);
const roomTimedMaxDurationMinutes = boundedIntEnv('ROOM_TIMED_MAX_DURATION_MINUTES', 60, 1, 60);
if (roomArbitrationBigRounds > roomArbitrationMaxBigRounds) {
  throw new Error('ROOM_ARBITRATION_BIG_ROUNDS must not exceed ROOM_ARBITRATION_MAX_BIG_ROUNDS');
}
if (roomTimedDurationMinutes > roomTimedMaxDurationMinutes) {
  throw new Error('ROOM_TIMED_DURATION_MINUTES must not exceed ROOM_TIMED_MAX_DURATION_MINUTES');
}

export const config = {
  root: ROOT,
  dataDir: path.join(ROOT, 'data'),
  staticDir: path.resolve(process.env.STATIC_DIR || path.join(ROOT, 'dist')),
  databasePath: path.resolve(process.env.DATABASE_PATH || path.join(ROOT, '.cache', 'fitdle-online.sqlite')),
  host: process.env.HOST || '0.0.0.0',
  port: intEnv('PORT', 8787),
  publicOrigin,
  apiOrigin,
  sessionSecret: process.env.SESSION_SECRET || '',
  cookieSecure: apiOrigin.startsWith('https://'),
  devAuth: devAuth && (!production || loopback),
  warnings,
  gameDayStartMinutes: gameDayStart.minutes,
  gameDayStartSource: process.env.FITDLE_GAME_DAY_START_UTC && !gameDayStart.warning ? 'FITDLE_GAME_DAY_START_UTC' : 'data manifest',
  version: String(readJson(path.join(ROOT, 'package.json'), {}).version || ''),
  algorithmVersion: 'online-v2',
  dailyAllowEmpty: dailyAllowEmpty ?? true,
  statsKillRetentionDays,
  eve: {
    clientId: process.env.EVE_CLIENT_ID || '',
    clientSecret: process.env.EVE_CLIENT_SECRET || '',
    redirectUri,
    metadataUrl: process.env.EVE_SSO_METADATA_URL || 'https://login.eveonline.com/.well-known/oauth-authorization-server',
    scope: 'publicData',
  },
  userAgent: buildUserAgent({
    version: readJson(path.join(ROOT, 'package.json'), {}).version,
    repo: 'https://github.com/steven-cmy/fitdle',
    contact: apiContact,
  }),
  // Shared with every visitor, so it needs its own explicit opt-in.
  publicContact: boolEnv('API_CONTACT_PUBLIC', false) ? apiContact : '',
  manifest,
  catalogShips: Array.isArray(catalog.ships) ? catalog.ships : [],
  allowedOrigins,
  roomMaxPlayers: boundedIntEnv('ROOM_MAX_PLAYERS', 8, 2, 32),
  roomArbitrationBigRounds,
  roomArbitrationMaxBigRounds,
  roomTimedDurationMinutes,
  roomTimedMaxDurationMinutes,
  zkillMinIntervalMs: boundedIntEnv('ZKILL_MIN_INTERVAL_MS', 250, 0, 5000),
  usageMaxRatio,
  groupFactors: parsedFactors.factors,
  usageStaleDays: boundedIntEnv('FITDLE_USAGE_STALE_DAYS', 45, 1, 365),
  usageWindowMonths: boundedIntEnv('FITDLE_USAGE_WINDOW_MONTHS', 3, 1, 12),
  // Monthly zKill usage and loss counts per hull; null means every hull weighs 1.
  shipUsageFile: usageFile || '',
  shipUsage: shipUsage?.version === 1 && shipUsage.ships && typeof shipUsage.ships === 'object' ? shipUsage : null,
  noKillRetryMs: boundedIntEnv('FITDLE_NO_KILL_RETRY_HOURS', 24, 1, 720) * 60 * 60 * 1000,
  targetShelfSize: boundedIntEnv('TARGET_SHELF_SIZE', 150, 0, 1000),
  targetShelfTtlMs: boundedIntEnv('TARGET_SHELF_TTL_HOURS', 24, 1, 168) * 60 * 60 * 1000,
  // Spacing of the requests that fill the shelf; 2000 ms is 0.5 requests a second.
  targetRefillIntervalMs: boundedIntEnv('TARGET_REFILL_INTERVAL_MS', 2000, 0, 60000),
  roomReconnectGraceMs: boundedIntEnv('ROOM_RECONNECT_GRACE_MS', 60000, 5000, 300000),
  roomHeartbeatMs: 25 * 1000,
  roomTtlMs: 2 * 60 * 60 * 1000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
};

export function ssoConfigured() {
  return Boolean(config.eve.clientId && config.eve.clientSecret && config.eve.redirectUri);
}
