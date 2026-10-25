import { transcribe, transcribeFile } from '../meta/muse.js';
import { bus } from '../dashboard/bus.js';
import { CAPTURE_BYTES_PER_SECOND, pcmToWav } from './audio.js';

const MIN_UTTERANCE_BYTES = 0.3 * CAPTURE_BYTES_PER_SECOND; // ignore coughs and clicks under 300 ms

/**
 * Capture sink that sends each utterance to Muse Voice Transcribe as it is spoken,
 * streams partial text to the live screen, and adds final lines to the transcript.
 */
export function createTranscriberSink(session) {
  const active = new Map(); // userId -> current utterance
  const pending = new Set(); // utterances waiting for their final transcript

  function begin(userId) {
    session.ensureName(userId); // server nickname; labels below read it when they're emitted
    const keywords = session.keywords();
    const u = { userId, keywords, startedAt: new Date().toISOString(), chunks: [], bytes: 0 };
    Object.defineProperty(u, 'speaker', { get: () => session.nameOf(userId) });
    u.stream = transcribe({ keywords, onPartial: (text) => bus.emit('partial', { userId, speaker: u.speaker, text }) });
    active.set(userId, u);
    return u;
  }

  async function finish(u) {
    const endedAt = new Date().toISOString();
    if (u.bytes < MIN_UTTERANCE_BYTES) {
      u.stream.abort();
      bus.emit('partial-clear', { userId: u.userId });
      return;
    }

    let text = '';
    try {
      ({ text } = await u.stream.end());
    } catch (err) {
      console.warn(`[transcribe] realtime failed for ${u.speaker} (${err.message}); retrying as a file upload`);
      try {
        ({ text } = await transcribeFile(pcmToWav(Buffer.concat(u.chunks)), { keywords: u.keywords }));
      } catch (err2) {
        session.failedUtterances++;
        console.error(`[transcribe] lost an utterance from ${u.speaker}: ${err2.message}`);
        session.notice('transcribe', '⚠️', "Muse Voice Transcribe isn't responding, so I'm missing some of what's said. If it keeps happening, `/stop` and run `/demo`.");
      }
    }
    bus.emit('partial-clear', { userId: u.userId });
    if (!text) return;
    session.addLine({ userId: u.userId, speaker: u.speaker, startedAt: u.startedAt, endedAt, text });
  }

  return {
    onAudio(userId, pcm) {
      const u = active.get(userId) ?? begin(userId);
      u.chunks.push(pcm);
      u.bytes += pcm.length;
      u.stream.write(pcm);
    },
    onUtteranceEnd(userId) {
      const u = active.get(userId);
      if (!u) return;
      active.delete(userId);
      const job = finish(u)
        .catch((err) => console.error(`[transcribe] failed to record a line from ${u.speaker}:`, err))
        .finally(() => pending.delete(job));
      pending.add(job);
    },
    /** Wait for every in-flight utterance to get its final transcript. */
    async drain() {
      await Promise.allSettled([...pending]);
    },
  };
}
