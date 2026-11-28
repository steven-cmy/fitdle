/**
 * How the service writes its log: pino JSON lines (containers and pipes) or one
 * readable line per entry for a local terminal. The readable form only rewrites
 * the serialized JSON, so it can never show more than the JSON log would.
 */

/** `LOG_FORMAT` wins; otherwise readable only on a terminal outside production. */
export function resolveLogFormat(env = process.env, isTTY = Boolean(process.stdout.isTTY)) {
  const raw = String(env.LOG_FORMAT ?? '').trim().toLowerCase();
  const automatic = isTTY && env.NODE_ENV !== 'production' ? 'pretty' : 'json';
  if (raw === 'json' || raw === 'pretty') return { format: raw, warning: '' };
  if (!raw) return { format: automatic, warning: '' };
  return { format: automatic, warning: `LOG_FORMAT="${raw}" is not json or pretty; ${automatic} is used` };
}

const LABELS = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' };
const LEVEL_COLORS = { 40: '33', 50: '31', 60: '31' };
const two = (value) => String(value).padStart(2, '0');

/** Request data must not drive the terminal: control characters become spaces. */
const plain = (value) => String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');

/** Messages are our own and may keep colour codes (the session secret warning). */
const message = (value) => String(value).split(/(\u001b\[[\d;]*m)/)
  .map((part, index) => (index % 2 ? part : plain(part)))
  .join('');

const field = (value) => plain(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);

/** One pino JSON line as readable text; anything else is returned unchanged. */
export function prettyLine(line, { color = false } = {}) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return line;
  }
  if (!entry || typeof entry !== 'object' || !LABELS[entry.level]) return line;
  const { level, time, pid, hostname, msg, reqId, req, res, responseTime, err, ...rest } = entry;
  const at = new Date(time ?? Date.now());
  let label = LABELS[level].padEnd(5);
  if (color && LEVEL_COLORS[level]) label = `\u001b[${LEVEL_COLORS[level]}m${label}\u001b[0m`;
  const details = [
    req ? `${plain(req.method)} ${plain(req.url)} from ${plain(req.remoteAddress)}` : '',
    res ? `status=${plain(res.statusCode)}` : '',
    typeof responseTime === 'number' ? `${responseTime.toFixed(1)}ms` : '',
    ...Object.entries(rest).map(([key, value]) => `${plain(key)}=${field(value)}`),
  ].filter(Boolean).join(' ');
  const head = [
    `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`,
    label,
    reqId ? `[${plain(reqId)}]` : '',
  ].filter(Boolean).join(' ');
  const body = [message(msg ?? ''), details].filter(Boolean).join(': ');
  const trace = err
    ? String(err.stack || `${err.type || 'Error'}: ${err.message}`)
      .split(/\r?\n/).map((row) => `\n    ${plain(row)}`).join('')
    : '';
  return `${head} ${body}${trace}\n`;
}

/** A destination for pino that prints readable lines to `output`. */
export function prettyStream(output = process.stdout, options = {}) {
  return { write: (line) => { output.write(prettyLine(line, options)); } };
}
