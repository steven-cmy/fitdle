import { PROTOCOL_VERSION } from '../../js/mp/protocol.js';
import { RUN_PROTOCOL_VERSION } from '../../js/run-sync.js';
import { config as defaultConfig, ssoConfigured } from './config.mjs';

/** HTTP API generation: the `/api/v1` route prefix. */
export const API_VERSION = 1;

const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Warnings that depend on the clock; the settings warnings live in `config.warnings`. */
const red = (text, color) => (color ? `\u001b[1;31m${text}\u001b[0m` : text);

/** Red in the readable log on a terminal; plain text in JSON, files and pipes (or with NO_COLOR). */
const wantsColor = () => defaultConfig.logFormat === 'pretty'
  && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

/** Why a random session secret matters. Never contains the secret itself. */
export function sessionSecretWarnings(config = defaultConfig, { color = wantsColor() } = {}) {
  if (config.sessionSecretSource !== 'random') return [];
  return [
    'SESSION_SECRET is not set: a random temporary secret was generated for this run.',
    'Consequence: every restart invalidates all sign-in sessions and everyone has to sign in again.',
    'Why it is generated: the only alternative is the secret published in the source code, which would make the Daily target predictable and sign-in sessions forgeable.',
    "Fix: set a fixed long random SESSION_SECRET in the environment (for example: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"); restarts then keep sessions. Daily targets already stored are not affected by restarts.",
  ].map((line) => red(line, color));
}

export function startupWarnings(config = defaultConfig, { now = new Date() } = {}) {
  if (!config.shipUsage) return [];
  const generated = Date.parse(config.shipUsage.generatedAt);
  if (!Number.isFinite(generated)) return ['Ship usage file has no valid generation date; its age is unknown'];
  const age = Math.floor((now - generated) / 86400000);
  if (age <= config.usageStaleDays) return [];
  return [`Ship usage data is ${age} days old (generated ${new Date(generated).toISOString().slice(0, 10)}, limit ${config.usageStaleDays} days): the monthly usage workflow may have failed`];
}

/**
 * Startup summary, one short line per group. Only effective values and yes/no
 * flags: never secrets, tokens, sign-in codes, player ids or credentials.
 * ASCII only, so that consoles without UTF-8 (Windows code pages) show it as is.
 */
export function startupLines(config = defaultConfig, { node = process.version, now = new Date() } = {}) {
  const usage = config.shipUsage;
  let usageText = 'no usage file; every hull weighs 1';
  if (usage) {
    const hulls = Object.keys(usage.ships).length;
    const generated = Date.parse(usage.generatedAt);
    const age = Number.isFinite(generated)
      ? `generated ${new Date(generated).toISOString().slice(0, 10)}, ${Math.max(0, Math.floor((now - generated) / 86400000))} days old`
      : 'age unknown';
    const refresh = config.usageRefreshMs ? `refreshed every ${config.usageRefreshMs / 3600000} h` : 'refresh off';
    usageText = `${hulls} hulls from ${config.shipUsageSource || 'image'} (${age}), window ${config.usageWindowMonths} months, ${refresh}`;
  }
  const factors = [...(config.groupFactors || new Map())].map(([group, factor]) => `g${group}x${factor}`).join(' ') || 'none';
  const apiOrigin = config.apiOrigin && config.apiOrigin !== config.publicOrigin ? ` | API origin ${config.apiOrigin}` : '';
  return [
    `FITDLE ${config.version || 'unknown'} | API v${API_VERSION} | run protocol v${RUN_PROTOCOL_VERSION} | WebSocket protocol v${PROTOCOL_VERSION} | algorithm ${config.algorithmVersion} | Node ${node}`,
    `Origin ${config.publicOrigin || 'PUBLIC_ORIGIN not set'}${apiOrigin} | listen ${config.host}:${config.port} | proxy headers trusted`,
    `Data ${String(config.manifest?.dataVersion || 'unknown')} | database ${config.databasePath} | static ${config.staticDir}`,
    `Game day starts ${clock(config.gameDayStartMinutes)} UTC (${config.gameDayStartSource})`,
    `Sign-in: SSO ${ssoConfigured() ? 'configured' : 'not configured'} | session secret ${config.sessionSecret ? (config.sessionSecretSource === 'random' ? 'RANDOM, valid until restart' : 'configured') : 'NOT SET (public default)'} | dev sign-in ${config.devAuth ? 'ON' : 'off'}`,
    `Targets: daily empty hulls ${config.dailyAllowEmpty ? 'allowed' : 'excluded'} | usage ${usageText} | max usage ratio ${config.usageMaxRatio} | group factors ${factors} | shelf ${config.targetShelfSize} entries, ttl ${config.targetShelfTtlMs / 3600000} h`,
    `Limits: ${config.roomMaxPlayers} players a room | zKill spacing ${config.zkillMinIntervalMs} ms | shelf refill every ${config.targetRefillIntervalMs} ms | difficulty stats kept ${config.statsKillRetentionDays} days`,
  ];
}
