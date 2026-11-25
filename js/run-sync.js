const STORAGE_KEY = 'fitdle:v1:pending-runs';
const MAX_PENDING_RUNS = 20;
const RETRY_MIN_MS = 3000;
const RETRY_MAX_MS = 60_000;

/** The answer is final: asking again cannot change it. */
function isFinal(error) {
  return [400, 404, 409].includes(Number(error?.status));
}

/**
 * Delivers the guesses of online runs to the service: in order, one at a time,
 * kept in storage until they are confirmed and retried after failures.
 *
 * `onRun(runId, run)` gets every confirmed run, `onRejected(runId, error)` a
 * submission the service refused for good.
 */
export class RunSync {
  constructor({ api, storage, user = '', onRun = () => {}, onRejected = () => {}, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (timer) => clearTimeout(timer) }) {
    this.api = api;
    this.storage = storage;
    this.user = user;
    this.onRun = onRun;
    this.onRejected = onRejected;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.retryMs = RETRY_MIN_MS;
    this.active = null;
    this.runs = this.read();
  }

  read() {
    try {
      const data = JSON.parse(this.storage.getItem(STORAGE_KEY) || 'null');
      if (data?.user === this.user && Array.isArray(data.runs)) return new Map(data.runs);
    } catch {
      // Unreadable data is replaced by the next write.
    }
    return new Map();
  }

  write() {
    try {
      if (this.runs.size) {
        this.storage.setItem(STORAGE_KEY, JSON.stringify({ user: this.user, runs: [...this.runs] }));
      } else {
        const data = JSON.parse(this.storage.getItem(STORAGE_KEY) || 'null');
        // Another account's unsent guesses stay until that account returns.
        if (!data || data.user === this.user) this.storage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Best effort: the queue still works for this page.
    }
  }

  entry(runId) {
    let entry = this.runs.get(runId);
    if (!entry) {
      entry = { begunAt: 0, guesses: [], lost: null };
      this.runs.set(runId, entry);
      while (this.runs.size > MAX_PENDING_RUNS) this.runs.delete(this.runs.keys().next().value);
    }
    return entry;
  }

  pending(runId) {
    return this.runs.has(runId);
  }

  /** The clock of a timed run started at a local time. */
  begin(runId, at = Date.now()) {
    this.entry(runId).begunAt = at;
    this.write();
    return this.flush();
  }

  guess(runId, shipId, elapsedMs = 0) {
    const entry = this.entry(runId);
    if (!entry.guesses.some((item) => item.shipId === shipId)) entry.guesses.push({ shipId, elapsedMs });
    this.write();
    return this.flush();
  }

  /** A timed run ended without the answer. */
  lose(runId, elapsedMs = 0) {
    this.entry(runId).lost = { elapsedMs };
    this.write();
    return this.flush();
  }

  /** Send everything that is waiting; resolves to true once nothing is left. */
  flush() {
    if (this.active) return this.active;
    this.clearTimer(this.timer);
    this.timer = null;
    this.active = this.send().finally(() => { this.active = null; });
    return this.active;
  }

  async send() {
    for (const runId of [...this.runs.keys()]) {
      for (;;) {
        const entry = this.runs.get(runId);
        if (!entry) break;
        const guess = entry.guesses[0];
        if (!entry.begunAt && !guess && !entry.lost) {
          this.runs.delete(runId);
          this.write();
          break;
        }
        try {
          let run;
          if (entry.begunAt) {
            run = await this.api.begin(runId, Math.max(0, Date.now() - entry.begunAt));
            entry.begunAt = 0;
          } else if (guess) {
            run = await this.api.guess(runId, guess.shipId, guess.elapsedMs);
            entry.guesses.shift();
          } else {
            run = await this.api.finish(runId, { status: 'lost', elapsedMs: entry.lost.elapsedMs });
            entry.lost = null;
          }
          this.write();
          this.retryMs = RETRY_MIN_MS;
          this.onRun(runId, run);
        } catch (error) {
          if (!isFinal(error)) {
            // Signed out: the queue waits until this account signs in again.
            if (Number(error?.status) !== 401) this.scheduleRetry();
            return false;
          }
          this.runs.delete(runId);
          this.write();
          this.onRejected(runId, error);
          break;
        }
      }
    }
    return this.runs.size === 0 || this.send();
  }

  scheduleRetry() {
    this.clearTimer(this.timer);
    this.timer = this.setTimer(() => { void this.flush(); }, this.retryMs);
    this.timer?.unref?.();
    this.retryMs = Math.min(RETRY_MAX_MS, this.retryMs * 2);
  }
}

/** Guesses of a run: the service's list first, then local ones not sent yet. */
export function mergeGuesses(confirmed = [], local = []) {
  return [...new Set([...confirmed, ...local].map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}
