import OpusScript from 'opusscript';
import { EndBehaviorType } from '@discordjs/voice';
import { CAPTURE_PCM } from './audio.js';

const SILENCE_END_MS = 800; // an utterance ends after this much silence

/**
 * Subscribes to every human speaking in the call and hands decoded PCM to the sink.
 * Discord gives one audio stream per user, which is where our speaker labels come from.
 *
 *   sink.onAudio(userId, pcm)      – 24 kHz mono PCM16 chunk (~20 ms)
 *   sink.onUtteranceEnd(userId)    – the user went quiet
 *
 * Packets that arrive while the session is paused are dropped before decoding:
 * nothing said during a pause is decoded, stored, or sent anywhere.
 *
 * Returns a function that stops capture.
 */
export function startCapture(session, sink) {
  const { receiver } = session.connection;

  const onSpeakingStart = (userId) => {
    if (session.state !== 'listening') return;
    if (receiver.subscriptions.has(userId)) return;
    if (session.isBot(userId)) return;

    const stats = session.statsFor(userId);
    const decoder = new OpusScript(CAPTURE_PCM.sampleRate, CAPTURE_PCM.channels, OpusScript.Application.VOIP);
    const stream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_END_MS },
    });

    stream.on('data', (packet) => {
      if (session.state !== 'listening') return;
      stats.packets++;
      // Decode packet-by-packet so one bad packet (e.g. during a DAVE key change)
      // costs 20 ms of audio instead of killing the stream.
      try {
        sink.onAudio(userId, decoder.decode(packet));
      } catch {
        stats.decodeErrors++;
      }
    });
    stream.on('error', (err) => {
      stats.streamErrors++;
      console.warn(`[capture] stream error for ${session.nameOf(userId)}: ${err.message}`);
    });
    stream.once('close', () => {
      decoder.delete();
      sink.onUtteranceEnd(userId);
    });
  };

  receiver.speaking.on('start', onSpeakingStart);
  return () => {
    receiver.speaking.off('start', onSpeakingStart);
    for (const stream of receiver.subscriptions.values()) stream.destroy();
  };
}
