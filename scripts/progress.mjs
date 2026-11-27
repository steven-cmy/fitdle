/**
 * Progress bar with an estimate of the time left, for long one-by-one jobs.
 *
 * On a terminal one line is redrawn after every step. Elsewhere (CI logs) a
 * complete line is written at the start, at every `stepPercent` of the work, after
 * `intervalMs` without a line, and at the end.
 */
const BAR_WIDTH = 24;

export function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = String(seconds % 60).padStart(2, '0');
  if (h) return `${h}h ${String(m).padStart(2, '0')}m ${s}s`;
  return m ? `${m}m ${s}s` : `${seconds}s`;
}

/** Time left from the average of the finished items; null before the first one. */
export function estimateRemaining({ done, total, elapsedMs }) {
  if (done >= total) return 0;
  return done > 0 ? (elapsedMs / done) * (total - done) : null;
}

export function formatProgress({ done, total, elapsedMs, failed = 0 }) {
  const share = total > 0 ? Math.min(1, done / total) : 1;
  const filled = Math.floor(share * BAR_WIDTH);
  const left = estimateRemaining({ done, total, elapsedMs });
  return [
    `[${'#'.repeat(filled)}${'-'.repeat(BAR_WIDTH - filled)}] ${String(Math.floor(share * 100)).padStart(3)}% ${done}/${total}`,
    ...(failed ? [`${failed} failed`] : []),
    `elapsed ${formatDuration(elapsedMs)}`,
    `ETA ${left === null ? '--' : formatDuration(left)}`,
  ].join(' | ');
}

export function createProgress({
  total, stream = process.stdout, now = Date.now, stepPercent = 5, intervalMs = 60_000,
}) {
  const live = Boolean(stream.isTTY);
  const startedAt = now();
  let state = { done: 0, failed: 0 };
  let printedAt = startedAt;
  let printedStep = 0;
  // Whether a redrawn line is on screen and still needs its newline.
  let open = false;
  const line = () => formatProgress({ ...state, total, elapsedMs: now() - startedAt });
  const print = () => {
    if (live) stream.write(`\r${line()}\u001b[K`);
    else stream.write(`${line()}\n`);
    open = live;
    printedAt = now();
  };
  print();
  return {
    update(done, failed = 0) {
      state = { done, failed };
      const step = total > 0 ? Math.floor((done * 100) / total / stepPercent) : 0;
      if (live || done >= total || step > printedStep || now() - printedAt >= intervalMs) {
        printedStep = step;
        print();
      }
    },
    /** End the redrawn line, so that other output starts on its own line. */
    stop() {
      if (open) stream.write('\n');
      open = false;
    },
  };
}
