// ─────────────────────────────────────────────────────────────────────────────
// Demo mode: a backup for the stage if live audio fails. Replays a call through the
// SAME pipeline as a live call; only where the transcript lines come from changes:
//
//   script  demo/script.json lines appear as transcript lines (no speech-to-text)
//   audio   each script line is spoken by Meta MMS-TTS and streamed through Muse Voice
//           Transcribe (realtime), exactly like live Discord audio
//   file    demo/call.wav (your own recording) → Muse Voice Transcribe with speaker labels
//
// Everything after that is real: Muse Spark live notes, "Any questions, Meta?", recap,
// private DM check-ins, plan resolution, and Google Calendar.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import { endSession, getSession, startSession, wrapUpCall } from '../voice/session.js';
import { synthesize } from '../meta/tts.js';
import { transcribeFile } from '../meta/muse.js';
import { bus } from '../dashboard/bus.js';
import { stateNotice } from '../discord/format.js';
import { listPeople } from '../store/people.js';
import { CAPTURE_BYTES_PER_SECOND, CAPTURE_PCM } from '../voice/audio.js';

const SCRIPT_FILE = new URL('../../demo/script.json', import.meta.url);
const CALL_FILE = new URL('../../demo/call.wav', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const DEMO_MODES = {
  script: 'Scripted call (most reliable, no speech-to-text)',
  audio: 'Script spoken by Meta MMS-TTS → Muse Voice Transcribe',
  file: 'Your recording demo/call.wav → Muse Voice Transcribe (speaker labels)',
};

/** Who plays whom: real people where possible, so DMs and calendar invites at the end are real. */
function castFor(member, voiceChannel) {
  const s1 = { id: member.id, name: member.displayName };
  const friend = voiceChannel?.members.find((m) => !m.user.bot && m.id !== member.id);
  const s2 = friend ? { id: friend.id, name: friend.displayName } : { id: 'demo-friend', name: 'Jordan' };
  const absent = listPeople().find((p) => p.id !== s1.id && p.id !== s2.id);
  return { s1, s2, absentName: absent?.name ?? 'Angel' };
}

function readWavInfo(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('demo/call.wav is not a WAV file.');
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  if (channels !== 1 || bits !== 16 || ![16000, 24000].includes(sampleRate)) {
    throw new Error(
      `demo/call.wav must be mono 16-bit PCM at 16 or 24 kHz (it is ${channels} ch, ${bits}-bit, ${sampleRate} Hz). Convert it with: ffmpeg -i your-recording.m4a -ac 1 -ar 24000 -c:a pcm_s16le demo/call.wav`,
    );
  }
}

export function demoFileExists() {
  return fs.existsSync(CALL_FILE);
}

/** Make transcript lines appear word by word on the live screen, like a person talking. */
async function typeOut(session, { id, name, text }) {
  const words = text.split(' ');
  for (let i = 1; i < words.length; i++) {
    bus.emit('partial', { userId: id, speaker: name, text: words.slice(0, i).join(' ') });
    await sleep(110);
  }
  bus.emit('partial-clear', { userId: id });
  session.addLine({ userId: id, speaker: name, text });
}

/** Speak a line with Meta MMS-TTS and push it through the live transcription path at real-time pace. */
async function speakIntoPipeline(session, { id, text }) {
  const { pcm } = await synthesize(text, { sampleRate: CAPTURE_PCM.sampleRate, channels: CAPTURE_PCM.channels });
  const chunk = Math.round(CAPTURE_BYTES_PER_SECOND / 10); // 100 ms
  const started = Date.now();
  let sent = 0;
  while (sent < pcm.length) {
    const due = Math.min(pcm.length, (Math.floor((Date.now() - started) / 100) + 1) * chunk);
    if (due > sent) {
      session.sink.onAudio(id, pcm.subarray(sent, due));
      sent = due;
    }
    await sleep(40);
  }
  session.sink.onUtteranceEnd(id);
  await session.sink.drain(); // wait for Muse Voice Transcribe's final text
}

/**
 * Run a demo call from start to finish. Joins the caller's voice channel if they're in one
 * (so Orbit can speak), otherwise runs without voice. Returns when the call is wrapped up.
 */
export async function runDemo({ guild, member, textChannel, mode = 'script' }) {
  const voiceChannel = member.voice?.channel ?? null;
  const { s1, s2, absentName } = castFor(member, voiceChannel);

  // Load the lines before joining, so a bad demo file fails fast with a clear message.
  let lines;
  let wav = null;
  if (mode === 'file') {
    if (!demoFileExists()) throw new Error('No demo/call.wav found. Record a call, convert it (see README), or use mode `script`.');
    wav = fs.readFileSync(CALL_FILE);
    readWavInfo(wav);
  } else {
    const script = JSON.parse(fs.readFileSync(SCRIPT_FILE, 'utf8'));
    const fill = (t) => t.replaceAll('{s1}', s1.name).replaceAll('{s2}', s2.name).replaceAll('{absent}', absentName);
    lines = script.lines.map((l) => ({ ...(l.speaker === 's1' ? s1 : s2), text: fill(l.text) }));
  }

  let session;
  try {
    session = await startSession({ guild, voiceChannel, textChannel, capture: false });
  } catch (err) {
    if (!voiceChannel || getSession(guild.id)) throw err;
    // Voice is broken (the reason demo mode exists): run the same demo without a voice connection.
    console.warn(`[demo] couldn't join voice (${err.message}); running without voice`);
    await textChannel.send({ embeds: [stateNotice('🎬', "Couldn't join voice, so I'm running the demo without it. Orbit's questions will be posted as text.")] });
    session = await startSession({ guild, voiceChannel: null, textChannel, capture: false });
  }
  session.demo = true;
  session.names.set(s1.id, s1.name).set(s2.id, s2.name);
  await session.voiceChannel.send({
    embeds: [stateNotice('🎬', `**Demo mode** · ${DEMO_MODES[mode]}\nReplaying a call through the same Meta pipeline. Watch the live screen!`)],
  });

  if (mode === 'file') {
    // Muse Voice Transcribe labels speakers A, B, …; map them onto the cast in order of appearance.
    const { turns } = await transcribeFile(wav, { mode: 'DIARIZATION', keywords: session.keywords() });
    const bySpeaker = new Map();
    const castList = [s1, s2];
    lines = turns
      .filter((t) => t.transcript?.trim())
      .map((t) => {
        const label = t.speaker ?? 'A';
        if (!bySpeaker.has(label)) {
          const person = castList[bySpeaker.size] ?? { id: `demo-${label}`, name: `Speaker ${label}` };
          bySpeaker.set(label, person);
          session.names.set(person.id, person.name);
        }
        return { ...bySpeaker.get(label), text: t.transcript.trim() };
      });
    if (!lines.length) throw new Error('Muse Voice Transcribe found no speech in demo/call.wav.');
  }

  for (const line of lines) {
    if (getSession(guild.id) !== session) return null; // someone ran /stop
    if (mode === 'audio') await speakIntoPipeline(session, line);
    else await typeOut(session, line);
    await sleep(400);
    while (session.asking) await sleep(250); // let Orbit finish answering "Any questions, Meta?"
    await sleep(900);
  }

  if (getSession(guild.id) !== session) return null;
  await sleep(1500);
  await endSession(guild.id);
  const result = await wrapUpCall(session);
  await session.voiceChannel.send({ embeds: [stateNotice('🎬', ['Demo call finished.', ...result].join('\n'))] }).catch(() => {});
  return result;
}
