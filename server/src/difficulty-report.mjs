import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const GAMEPLAYS = ['daily', 'standard', 'audit', 'timed', 'arbitration'];

/**
 * Read the anonymous difficulty counters, hardest first (or easiest first).
 *
 * by: 'ship' (lifetime per hull) or 'kill' (per killmail, kept for a while).
 * gameplay: one of daily, standard, audit, timed, arbitration, or 'all' for the
 * first four together. Arbitration is its own gameplay because the dealer picks
 * the clues; its won/lost are per player, not per attempt.
 * A row is listed once it has `minFinished` won or lost plays; abandoned plays
 * are reported but stay out of the win rate.
 */
export function difficultyReport(db, {
  by = 'ship', gameplay = 'all', minFinished = 5, limit = 30, easiest = false,
} = {}) {
  if (by !== 'ship' && by !== 'kill') throw new Error("by must be 'ship' or 'kill'");
  if (gameplay !== 'all' && !GAMEPLAYS.includes(gameplay)) throw new Error(`unknown gameplay: ${gameplay}`);
  const table = by === 'ship' ? 'ship_difficulty' : 'kill_difficulty';
  const key = by === 'ship' ? 'ship_id' : 'kill_id';
  const select = by === 'ship' ? '' : ', MIN(ship_id) AS ship_id, MAX(last_at) AS last_at';
  const where = gameplay === 'all' ? "gameplay != 'arbitration'" : 'gameplay = ?';
  const rows = db.prepare(`SELECT ${key} AS id${select},
      SUM(won) AS won, SUM(lost) AS lost, SUM(abandoned) AS abandoned,
      SUM(won_guesses_sum) AS won_guesses_sum, SUM(won_ms_sum) AS won_ms_sum,
      SUM(CASE WHEN gameplay != 'arbitration' THEN won ELSE 0 END) AS won_counted,
      SUM(CASE WHEN gameplay = 'timed' THEN won ELSE 0 END) AS won_timed
    FROM ${table} WHERE ${where} GROUP BY ${key}
    HAVING SUM(won) + SUM(lost) >= ?`)
    .all(...(gameplay === 'all' ? [] : [gameplay]), Math.max(1, Math.floor(Number(minFinished)) || 1));
  const report = rows.map((row) => {
    const finished = Number(row.won) + Number(row.lost);
    const plays = finished + Number(row.abandoned);
    return {
      [by === 'ship' ? 'shipId' : 'killId']: Number(row.id),
      ...(by === 'kill' ? { shipId: Number(row.ship_id), lastAt: Number(row.last_at) } : {}),
      plays,
      won: Number(row.won),
      lost: Number(row.lost),
      abandoned: Number(row.abandoned),
      winRate: Number(row.won) / finished,
      abandonRate: Number(row.abandoned) / plays,
      // Only plays that record the value count: arbitration keeps no guesses, only timed keeps time.
      avgGuessesToWin: Number(row.won_counted) && Number(row.won_guesses_sum) ? Number(row.won_guesses_sum) / Number(row.won_counted) : null,
      avgSecondsToWin: Number(row.won_timed) && Number(row.won_ms_sum) ? Number(row.won_ms_sum) / Number(row.won_timed) / 1000 : null,
    };
  });
  report.sort((a, b) => (easiest ? b.winRate - a.winRate : a.winRate - b.winRate) || b.plays - a.plays);
  return report.slice(0, Math.max(1, Math.floor(Number(limit)) || 30));
}

function shipNames() {
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
    return new Map(catalog.ships.map((ship) => [Number(ship.id), ship.names?.en || '']));
  } catch {
    return new Map();
  }
}

const FLAG_OPTIONS = new Set(['easiest', 'json', 'help']);
const VALUE_OPTIONS = new Set(['by', 'gameplay', 'min', 'limit', 'db']);

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if (FLAG_OPTIONS.has(name)) {
      if (eq !== -1) throw new Error(`--${name} takes no value`);
      options[name] = true;
    } else if (VALUE_OPTIONS.has(name)) {
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value == null || value === '' || (eq === -1 && value.startsWith('--'))) throw new Error(`--${name} needs a value`);
      options[name] = value;
    } else {
      throw new Error(`unknown option: --${name}`);
    }
  }
  return options;
}

const USAGE = `Usage: node server/src/difficulty-report.mjs [--by ship|kill] [--gameplay all|daily|standard|audit|timed|arbitration]
  [--min 5] [--limit 30] [--easiest] [--json] [--db path]
Reads the difficulty counters of the database (DATABASE_PATH by default) without changing it.`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.resolve(options.db || process.env.DATABASE_PATH || path.join(ROOT, '.cache', 'fitdle-online.sqlite'));
  if (!fs.existsSync(file)) throw new Error(`database not found: ${file}`);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = difficultyReport(db, {
      by: options.by, gameplay: options.gameplay, minFinished: options.min, limit: options.limit, easiest: options.easiest,
    });
    if (options.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    const names = shipNames();
    const pct = (value) => `${(value * 100).toFixed(0)}%`;
    for (const row of rows) {
      const ship = names.get(row.shipId) || row.shipId;
      console.log([
        options.by === 'kill' ? `kill ${row.killId}` : '',
        String(ship).padEnd(28),
        `win ${pct(row.winRate).padStart(4)}`,
        `plays ${String(row.plays).padStart(5)}`,
        `abandoned ${pct(row.abandonRate).padStart(4)}`,
        row.avgGuessesToWin == null ? '' : `guesses ${row.avgGuessesToWin.toFixed(1)}`,
        row.avgSecondsToWin == null ? '' : `time ${row.avgSecondsToWin.toFixed(0)}s`,
      ].filter(Boolean).join('  '));
    }
    if (!rows.length) console.log('No rows with enough plays yet.');
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
