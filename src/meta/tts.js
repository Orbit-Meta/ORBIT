// ─────────────────────────────────────────────────────────────────────────────
// Meta MMS-TTS (facebook/mms-tts-eng, open weights), run locally with transformers.js.
// The Meta Model API has no text-to-speech, so Orbit speaks with Meta's open model.
// ─────────────────────────────────────────────────────────────────────────────
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { config } from '../config.js';
import { bus } from '../dashboard/bus.js';

const MODEL = 'Xenova/mms-tts-eng'; // ONNX export of facebook/mms-tts-eng
env.cacheDir = path.join(config.dataDir, 'models'); // survives `npm install`

let loading = null;

/** Load the model once (≈10 s first time, then cached on disk). Safe to call repeatedly. */
export function warmUpTts() {
  loading ??= (async () => {
    const started = Date.now();
    const tts = await pipeline('text-to-speech', MODEL, { dtype: 'fp32' });
    console.log(`[tts] Meta MMS-TTS ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return tts;
  })();
  loading.catch(() => (loading = null)); // allow a retry after a failed download
  return loading;
}

/**
 * Text → 16-bit PCM. Default: 48 kHz stereo, ready for Discord (StreamType.Raw).
 * Demo mode asks for 24 kHz mono, the format Muse Voice Transcribe takes.
 * @returns {Promise<{ pcm: Buffer, durationMs: number }>}
 */
export async function synthesize(text, { sampleRate = 48000, channels = 2 } = {}) {
  const started = Date.now();
  const spoken = normalizeForSpeech(text);
  try {
    const tts = await warmUpTts();
    const { audio, sampling_rate: rate } = await tts(spoken);
    const pcm = toPcm(audio, rate, sampleRate, channels);
    const durationMs = Math.round((audio.length / rate) * 1000);
    bus.emit('muse', {
      at: Date.now(),
      tool: 'Meta MMS-TTS',
      endpoint: 'local',
      ok: true,
      ms: Date.now() - started,
      note: `${(durationMs / 1000).toFixed(1)}s of speech`,
    });
    return { pcm, durationMs };
  } catch (err) {
    bus.emit('muse', { at: Date.now(), tool: 'Meta MMS-TTS', endpoint: 'local', ok: false, ms: Date.now() - started, note: err.message });
    throw err;
  }
}

/** Mono float samples at `rate` → int16 PCM at `outRate` with `channels`, peak-normalized, linear resampling. */
function toPcm(samples, rate, outRate, channels) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.9 / peak : 1;
  const ratio = rate / outRate;
  const outLen = Math.floor(samples.length / ratio);
  const frame = channels * 2;
  const out = Buffer.alloc(outLen * frame);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const frac = pos - j;
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    const int = Math.round(Math.max(-1, Math.min(1, (a + (b - a) * frac) * gain)) * 32767);
    for (let c = 0; c < channels; c++) out.writeInt16LE(int, i * frame + c * 2);
  }
  return out;
}

// ─── Text normalization: MMS-TTS only knows letters, so digits would be silent ───

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ''}`;
  return String(n).split('').map((d) => ONES[d]).join(' ');
}

const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 5: 'fifth', 8: 'eighth', 9: 'ninth', 12: 'twelfth', 20: 'twentieth', 30: 'thirtieth' };

function ordinalToWords(n) {
  if (ORDINALS[n]) return ORDINALS[n];
  if (n > 20 && n < 100 && n % 10) return `${TENS[Math.floor(n / 10)]} ${ordinalToWords(n % 10)}`;
  return `${numberToWords(n)}th`;
}

export function normalizeForSpeech(text) {
  return text
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n) => ordinalToWords(+n))
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => `${numberToWords(+h)} ${m === '00' ? '' : +m < 10 ? `oh ${ONES[+m]}` : numberToWords(+m)}`)
    .replace(/\b(\d+)\s*(am|pm)\b/gi, (_, n, ap) => `${numberToWords(+n)} ${ap.toLowerCase().split('').join(' ')}`)
    .replace(/\b(a\.m\.|p\.m\.)/gi, (m) => m.toLowerCase().replace(/\./g, ' ').trim())
    .replace(/\$(\d+)/g, (_, n) => `${numberToWords(+n)} dollars`)
    .replace(/\b\d+\b/g, (n) => numberToWords(+n))
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}
