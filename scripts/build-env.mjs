/**
 * Build-time configuration for the static site.
 *
 * `.env` is intentionally optional and ignored by Git. CI or a local shell can
 * provide the same values as environment variables; the environment wins.
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_GAME_DAY_START_UTC = '11:00';
export const DEFAULT_KB_SELECTION_START_DATE = '2012-05-22';
export const DEFAULT_KB_RECENCY_HALF_LIFE_DAYS = 365;
export const DEFAULT_KB_MAX_SCAN_PAGES = 20;
export const DEFAULT_REVEAL = Object.freeze({
  openingBudget: 9,
  openingMaxWeight: 13,
  openingMinClues: 3,
  openingMaxClues: 7,
  candidateFloor: 6,
  queueWeightPower: 1.8,
  standardEquipmentBase: 4,
  standardEquipmentMax: 9,
  standardEquipmentDivisor: 8,
  standardCargoBudget: 6,
  abyssEquipmentPerMiss: 1,
  abyssOtherBase: 1,
  abyssShortfallDivisor: 2,
  abyssCargoDivisor: 10,
});
export const DEFAULT_DRAND = Object.freeze({
  chain: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
  publicKey: '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
  period: 3,
  genesisTime: 1692803367,
  graceSeconds: 5,
  baseUrls: [
    'https://api.drand.sh',
    'https://api2.drand.sh',
    'https://api3.drand.sh',
    'https://drand.cloudflare.com',
  ],
});

function parseDotEnv(contents) {
  const values = {};
  for (const rawLine of String(contents || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function loadBuildEnv(root) {
  const file = path.join(root, '.env');
  const fromFile = fs.existsSync(file)
    ? parseDotEnv(fs.readFileSync(file, 'utf8'))
    : {};
  return { ...fromFile, ...process.env };
}

export function parseGameDayStart(value) {
  const raw = String(value ?? DEFAULT_GAME_DAY_START_UTC).trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) {
    throw new Error(`FITDLE_GAME_DAY_START_UTC must be HH:MM in UTC, got "${raw}"`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return {
    text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
  };
}

export function parseDateOnly(value) {
  const raw = String(value ?? DEFAULT_KB_SELECTION_START_DATE).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`FITDLE_KB_SELECTION_START_DATE must be YYYY-MM-DD, got "${raw}"`);
  }
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error(`FITDLE_KB_SELECTION_START_DATE is not a valid date: "${raw}"`);
  }
  return raw;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function revealNumber(env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}, got "${raw}"`);
  }
  return parsed;
}

function loadRevealConfig(env) {
  const reveal = {
    openingBudget: revealNumber(env, 'FITDLE_REVEAL_OPENING_BUDGET', DEFAULT_REVEAL.openingBudget, { min: 1, max: 100, integer: true }),
    openingMaxWeight: revealNumber(env, 'FITDLE_REVEAL_OPENING_MAX_WEIGHT', DEFAULT_REVEAL.openingMaxWeight, { min: 1, max: 1000, integer: true }),
    openingMinClues: revealNumber(env, 'FITDLE_REVEAL_OPENING_MIN_CLUES', DEFAULT_REVEAL.openingMinClues, { min: 1, max: 100, integer: true }),
    openingMaxClues: revealNumber(env, 'FITDLE_REVEAL_OPENING_MAX_CLUES', DEFAULT_REVEAL.openingMaxClues, { min: 1, max: 100, integer: true }),
    candidateFloor: revealNumber(env, 'FITDLE_REVEAL_CANDIDATE_FLOOR', DEFAULT_REVEAL.candidateFloor, { min: 1, max: 100, integer: true }),
    queueWeightPower: revealNumber(env, 'FITDLE_REVEAL_QUEUE_WEIGHT_POWER', DEFAULT_REVEAL.queueWeightPower, { min: 0.5, max: 8 }),
    standardEquipmentBase: revealNumber(env, 'FITDLE_REVEAL_STANDARD_EQUIPMENT_BASE', DEFAULT_REVEAL.standardEquipmentBase, { min: 1, max: 100, integer: true }),
    standardEquipmentMax: revealNumber(env, 'FITDLE_REVEAL_STANDARD_EQUIPMENT_MAX', DEFAULT_REVEAL.standardEquipmentMax, { min: 1, max: 1000, integer: true }),
    standardEquipmentDivisor: revealNumber(env, 'FITDLE_REVEAL_STANDARD_EQUIPMENT_DIVISOR', DEFAULT_REVEAL.standardEquipmentDivisor, { min: 1, max: 1000, integer: true }),
    standardCargoBudget: revealNumber(env, 'FITDLE_REVEAL_STANDARD_CARGO_BUDGET', DEFAULT_REVEAL.standardCargoBudget, { min: 1, max: 1000, integer: true }),
    abyssEquipmentPerMiss: revealNumber(env, 'FITDLE_REVEAL_ABYSS_EQUIPMENT_PER_MISS', DEFAULT_REVEAL.abyssEquipmentPerMiss, { min: 1, max: 100, integer: true }),
    abyssOtherBase: revealNumber(env, 'FITDLE_REVEAL_ABYSS_OTHER_BASE', DEFAULT_REVEAL.abyssOtherBase, { min: 1, max: 100, integer: true }),
    abyssShortfallDivisor: revealNumber(env, 'FITDLE_REVEAL_ABYSS_SHORTFALL_DIVISOR', DEFAULT_REVEAL.abyssShortfallDivisor, { min: 1, max: 100, integer: true }),
    abyssCargoDivisor: revealNumber(env, 'FITDLE_REVEAL_ABYSS_CARGO_DIVISOR', DEFAULT_REVEAL.abyssCargoDivisor, { min: 1, max: 1000, integer: true }),
  };
  if (reveal.openingMaxClues < reveal.openingMinClues) {
    throw new Error('FITDLE_REVEAL_OPENING_MAX_CLUES must be >= FITDLE_REVEAL_OPENING_MIN_CLUES');
  }
  if (reveal.standardEquipmentMax < reveal.standardEquipmentBase) {
    throw new Error('FITDLE_REVEAL_STANDARD_EQUIPMENT_MAX must be >= FITDLE_REVEAL_STANDARD_EQUIPMENT_BASE');
  }
  return reveal;
}

export function loadBuildConfig(root) {
  const env = loadBuildEnv(root);
  const gameDayStart = parseGameDayStart(env.FITDLE_GAME_DAY_START_UTC);
  const kbSelectionStartDate = parseDateOnly(env.FITDLE_KB_SELECTION_START_DATE);
  const kbRecencyHalfLifeDays = revealNumber(
    env,
    'FITDLE_KB_RECENCY_HALF_LIFE_DAYS',
    DEFAULT_KB_RECENCY_HALF_LIFE_DAYS,
    { min: 1, max: 3650, integer: true },
  );
  const kbMaxScanPages = revealNumber(
    env,
    'FITDLE_KB_MAX_SCAN_PAGES',
    DEFAULT_KB_MAX_SCAN_PAGES,
    { min: 1, max: 100, integer: true },
  );
  const reveal = loadRevealConfig(env);
  const chain = String(env.FITDLE_DRAND_CHAIN || DEFAULT_DRAND.chain).trim();
  if (!/^[0-9a-f]{64}$/i.test(chain)) {
    throw new Error('FITDLE_DRAND_CHAIN must be a 64-character lowercase hex chain hash');
  }
  const publicKey = String(env.FITDLE_DRAND_PUBLIC_KEY || DEFAULT_DRAND.publicKey).trim();
  if (!/^[0-9a-f]+$/i.test(publicKey)) {
    throw new Error('FITDLE_DRAND_PUBLIC_KEY must be hex');
  }
  return {
    gameDayStartUtc: gameDayStart.text,
    gameDayStartMinutes: gameDayStart.minutes,
    kbSelectionStartDate,
    kbRecencyHalfLifeDays,
    kbMaxScanPages,
    reveal,
    beacon: {
      baseUrls: DEFAULT_DRAND.baseUrls,
      chain,
      publicKey,
      period: positiveInt(env.FITDLE_DRAND_PERIOD, DEFAULT_DRAND.period),
      genesisTime: positiveInt(env.FITDLE_DRAND_GENESIS, DEFAULT_DRAND.genesisTime),
      graceSeconds: positiveInt(env.FITDLE_DRAND_GRACE_SECONDS, DEFAULT_DRAND.graceSeconds),
    },
  };
}
