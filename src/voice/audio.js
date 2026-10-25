// We decode Discord's Opus straight to the format Muse Voice Transcribe wants:
// 24 kHz, mono, 16-bit little-endian PCM ("PCM_24KHZ" in the realtime API).
export const CAPTURE_PCM = { sampleRate: 24000, channels: 1 };
export const CAPTURE_BYTES_PER_SECOND = CAPTURE_PCM.sampleRate * CAPTURE_PCM.channels * 2;

/** Wrap raw 16-bit little-endian PCM in a 44-byte RIFF/WAVE header. */
export function pcmToWav(pcm, { sampleRate, channels } = CAPTURE_PCM) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
