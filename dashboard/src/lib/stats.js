// Numbers the live screen derives from the event stream. All public: transcript + Meta AI call log.

/** Seconds each person has spoken, from finished lines (Orbit excluded), largest first. */
export function talkTime(finals, partials) {
  const people = new Map();
  for (const e of finals) {
    if (e.userId === 'orbit') continue;
    const p = people.get(e.userId) ?? { userId: e.userId, name: e.speaker, seconds: 0 };
    p.name = e.speaker;
    p.seconds += Math.max(1, (new Date(e.endedAt) - new Date(e.startedAt)) / 1000);
    people.set(e.userId, p);
  }
  for (const p of Object.values(partials)) {
    if (!people.has(p.userId)) people.set(p.userId, { userId: p.userId, name: p.speaker, seconds: 0 });
  }
  return [...people.values()].sort((a, b) => b.seconds - a.seconds);
}

export function minSec(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const TOOLS = [
  { key: 'Muse Voice Transcribe', short: 'Voice Transcribe' },
  { key: 'Muse Spark', short: 'Muse Spark' },
  { key: 'Meta MMS-TTS', short: 'MMS-TTS' },
];

export function callMix(muse) {
  return TOOLS.map((t) => muse.filter((c) => c.tool === t.key).length);
}

export function avgLatency(muse) {
  const ok = muse.filter((c) => c.ok && typeof c.ms === 'number');
  return ok.length ? Math.round(ok.reduce((s, c) => s + c.ms, 0) / ok.length) : null;
}

export function wordsIn(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
