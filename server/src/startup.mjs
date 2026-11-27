import { PROTOCOL_VERSION } from '../../js/mp/protocol.js';
import { config as defaultConfig, ssoConfigured } from './config.mjs';

/** HTTP API generation: the `/api/v1` route prefix. */
export const API_VERSION = 1;

const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Startup summary, one short line per group. Only effective values and yes/no
 * flags: never secrets, tokens, sign-in codes, player ids or credentials.
 */
export function startupLines(config = defaultConfig, { node = process.version, now = new Date() } = {}) {
  const usage = config.shipUsage;
  let usageText = 'no usage file; every hull weighs 1';
  if (usage) {
    const hulls = Object.keys(usage.ships).length;
    const generated = Date.parse(usage.generatedAt);
    const age = Number.isFinite(generated) ? `${Math.max(0, Math.floor((now - generated) / 86400000))} days old` : 'age unknown';
    usageText = `${hulls} hulls, ${age}, window ${config.usageWindowMonths} months`;
  }
  const factors = [...(config.groupFactors || new Map())].map(([group, factor]) => `g${group}×${factor}`).join(' ') || 'none';
  const apiOrigin = config.apiOrigin && config.apiOrigin !== config.publicOrigin ? ` · API origin ${config.apiOrigin}` : '';
  return [
    `FITDLE ${config.version || 'unknown'} · API v${API_VERSION} · WebSocket protocol v${PROTOCOL_VERSION} · algorithm ${config.algorithmVersion} · Node ${node}`,
    `Origin ${config.publicOrigin || 'PUBLIC_ORIGIN not set'}${apiOrigin} · listen ${config.host}:${config.port} · proxy headers trusted`,
    `Data ${String(config.manifest?.dataVersion || 'unknown')} · database ${config.databasePath} · static ${config.staticDir}`,
    `Game day starts ${clock(config.gameDayStartMinutes)} UTC (${config.gameDayStartSource})`,
    `Sign-in: SSO ${ssoConfigured() ? 'configured' : 'not configured'} · session secret ${config.sessionSecret ? 'configured' : 'NOT SET (public default)'} · dev sign-in ${config.devAuth ? 'ON' : 'off'}`,
    `Targets: daily empty hulls ${config.dailyAllowEmpty ? 'allowed' : 'excluded'} · usage ${usageText} · max usage ratio ${config.usageMaxRatio} · group factors ${factors} · shelf ${config.targetShelfSize} entries, ttl ${config.targetShelfTtlMs / 3600000} h`,
    `Limits: ${config.roomMaxPlayers} players a room · zKill spacing ${config.zkillMinIntervalMs} ms · shelf refill every ${config.targetRefillIntervalMs} ms · difficulty stats kept ${config.statsKillRetentionDays} days`,
  ];
}
