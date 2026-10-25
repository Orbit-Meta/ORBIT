import { Readable } from 'node:stream';
import { AudioPlayerStatus, createAudioResource, entersState, StreamType } from '@discordjs/voice';
import { askQuestions } from '../core/askQuestions.js';
import { synthesize } from '../meta/tts.js';
import { bus } from '../dashboard/bus.js';
import { stateNotice } from '../discord/format.js';

const VOICE_COOLDOWN_MS = 30_000; // one spoken trigger per 30 s, so echoes can't loop

/** "Any questions, Meta?" — loose on purpose: speech recognition may write "Metta" or "Mehta". */
export function isWakePhrase(text) {
  const t = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ');
  return /\bquestions?\b/.test(t) && /\b(meta|metta|mehta|meda|medda|metah)\b/.test(t);
}

/**
 * Muse Spark finds what the plan is missing; Orbit posts the questions in the voice chat
 * and speaks them in the call with Meta MMS-TTS.
 * @returns {Promise<object|null>} askQuestions() result, or null if skipped
 */
export async function answerQuestions(session, { by, fromVoice = false }) {
  if (session.asking) return null;
  if (fromVoice && Date.now() - (session.lastAskedAt ?? 0) < VOICE_COOLDOWN_MS) return null;
  session.asking = true;

  try {
    bus.emit('thinking', { task: 'questions', text: '', active: true });
    const result = await askQuestions({
      lines: session.transcript.entries,
      inCall: session.participantNames(),
      absent: session.absentCrew().map((p) => p.name),
      notes: session.liveSummary ?? session.summary,
      onReasoning: (text) => bus.emit('thinking', { task: 'questions', text, active: true }),
    });
    bus.emit('thinking', { active: false });
    if (result.dropped.length) console.log('[questions] privacy guard dropped:', result.dropped);
    console.log(`[questions] Orbit: ${result.spokenText}`);

    // Orbit's turn goes into the transcript so people's answers make sense to Muse Spark later.
    session.addLine({ userId: 'orbit', speaker: 'Orbit', text: result.spokenText });

    const lines = result.questions.map((q) => `• ${q.text}`);
    if (!lines.length) lines.push("• Nothing! You've covered everything I need.");
    const after = [result.followUpWith.length ? `I'll check with ${result.followUpWith.join(', ')} separately.` : '', "I'll DM each of you privately about food preferences and budget."];
    await session.voiceChannel
      .send({ embeds: [stateNotice('🎙️', [`**Orbit asks** (for ${by}):`, ...lines, '', `*${after.filter(Boolean).join(' ')}*`].join('\n'))] })
      .catch((err) => console.warn('[questions] could not post in voice chat:', err.message));

    await speak(session, result.spokenText).catch((err) => console.warn('[questions] could not speak:', err.message));
    return result;
  } finally {
    bus.emit('thinking', { active: false });
    session.asking = false;
    session.lastAskedAt = Date.now();
  }
}

async function speak(session, text) {
  if (!session.player) return; // no voice connection (voiceless demo): the text post is enough
  const { pcm, durationMs } = await synthesize(text);
  session.player.play(createAudioResource(Readable.from([pcm]), { inputType: StreamType.Raw }));
  await entersState(session.player, AudioPlayerStatus.Playing, 5_000);
  await entersState(session.player, AudioPlayerStatus.Idle, durationMs + 15_000);
}
