import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { CAPTURE_BYTES_PER_SECOND, pcmToWav } from './audio.js';

// Phase 1 receive spike: proves we can get clean per-speaker audio through DAVE.
// Saves the first SPIKE_SECONDS of each person's speech to data/spike/<name>-<id>.wav.
// Phase 2 replaces this sink with Muse Voice Transcribe.
const SPIKE_SECONDS = 10;
const LIMIT = SPIKE_SECONDS * CAPTURE_BYTES_PER_SECOND;
const DIR = path.join(config.dataDir, 'spike');

export function createSpikeSink(session) {
  const buffers = new Map(); // userId -> { chunks, bytes, saved }
  const results = [];

  function save(userId) {
    const b = buffers.get(userId);
    if (!b || b.saved || b.bytes === 0) return;
    b.saved = true;
    fs.mkdirSync(DIR, { recursive: true });
    const safeName = session.nameOf(userId).replace(/[^\w-]+/g, '_');
    const file = path.join(DIR, `${safeName}-${userId}.wav`);
    fs.writeFileSync(file, pcmToWav(Buffer.concat(b.chunks)));
    const stats = session.statsFor(userId);
    const seconds = (b.bytes / CAPTURE_BYTES_PER_SECOND).toFixed(1);
    console.log(
      `[spike] saved ${seconds}s for ${session.nameOf(userId)} → ${file} ` +
        `(packets=${stats.packets}, decodeErrors=${stats.decodeErrors}, streamErrors=${stats.streamErrors})`,
    );
    results.push({ name: session.nameOf(userId), seconds, file, ...stats });
  }

  return {
    onAudio(userId, pcm) {
      let b = buffers.get(userId);
      if (!b) buffers.set(userId, (b = { chunks: [], bytes: 0, saved: false }));
      if (b.saved) return;
      b.chunks.push(pcm);
      b.bytes += pcm.length;
      if (b.bytes >= LIMIT) save(userId);
    },
    onUtteranceEnd() {},
    /** Save anyone who spoke but didn't reach the limit. Returns one result per saved user. */
    flush() {
      for (const userId of buffers.keys()) save(userId);
      return results;
    },
  };
}
