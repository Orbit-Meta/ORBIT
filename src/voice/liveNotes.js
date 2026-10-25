import { summarizeCall } from '../core/summarizeCall.js';
import { bus } from '../dashboard/bus.js';
import { config } from '../config.js';

const GATHER_MS = 4_000; // after a new line, wait briefly so a few lines go to Spark together
const MIN_INTERVAL_MS = 12_000; // at most one live update every 12 s

/**
 * Keeps Muse Spark's running notes up to date on the live screen while the call happens.
 * Never runs two Spark calls at once; lines that arrive mid-call trigger one follow-up run.
 */
export function createLiveNotes(session) {
  let timer = null;
  let running = false;
  let dirty = false;
  let stopped = false;
  let lastRunAt = 0;
  let lastLineCount = 0;

  function schedule() {
    if (stopped) return;
    if (running) {
      dirty = true;
      return;
    }
    // Throttle, not debounce: lines that arrive while a run is scheduled ride along,
    // so the notes keep updating even when nobody pauses.
    if (timer) return;
    timer = setTimeout(run, Math.max(GATHER_MS, lastRunAt + MIN_INTERVAL_MS - Date.now()));
  }

  async function run() {
    timer = null;
    const lines = [...session.transcript.entries];
    if (stopped || lines.length === lastLineCount) return;
    running = true;
    lastLineCount = lines.length;
    try {
      const summary = await summarizeCall({
        lines,
        inCall: session.participantNames(),
        absent: session.absentCrew().map((p) => p.name),
        timezone: config.timezone,
        purpose: 'live',
        onReasoning: (text) => bus.emit('thinking', { task: 'live notes', text, active: true }),
      });
      session.liveSummary = summary;
      if (!stopped) bus.emit('insights', { summary, at: Date.now(), lines: lines.length, final: false });
    } catch (err) {
      console.warn('[live notes] Muse Spark update failed:', err.message);
    } finally {
      running = false;
      lastRunAt = Date.now();
      bus.emit('thinking', { active: false });
      if (dirty) {
        dirty = false;
        schedule();
      }
    }
  }

  return {
    onLine: schedule,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
