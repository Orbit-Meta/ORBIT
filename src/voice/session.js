import { ChannelType } from 'discord.js';
import { createAudioPlayer, entersState, joinVoiceChannel, NoSubscriberBehavior, VoiceConnectionStatus } from '@discordjs/voice';
import { answerQuestions, isWakePhrase } from './askMeta.js';
import { config } from '../config.js';
import { startCapture } from './capture.js';
import { createTranscriberSink } from './transcriber.js';
import { createLiveNotes } from './liveNotes.js';
import { Transcript } from './transcript.js';
import { stateNotice } from '../discord/format.js';
import { postRecap } from '../discord/recap.js';
import { startRound } from '../plan/round.js';
import { listPeople } from '../store/people.js';
import { bus } from '../dashboard/bus.js';

// One listening session per server. State: 'listening' | 'paused' | 'ended'.
const sessions = new Map();
const lastEnded = new Map(); // guildId -> most recent ended session, so /recap works after /stop

class Session {
  constructor({ guild, voiceChannel, connection }) {
    this.guild = guild;
    this.voiceChannel = voiceChannel;
    this.connection = connection;
    this.state = 'listening';
    this.startedAt = new Date();
    this.transcript = new Transcript(this.startedAt);
    this.failedUtterances = 0;
    this.stats = new Map(); // userId -> { packets, decodeErrors, streamErrors }
    this.participantIds = new Set(voiceChannel.members.filter((m) => !m.user.bot).map((m) => m.id));
    this.recappedLines = 0;
    this.summary = null; // latest recap from Muse Spark
    this.liveNotes = createLiveNotes(this);
  }

  /** Called by the transcriber for every new final line. */
  onTranscriptLine(entry) {
    this.participantIds.add(entry.userId);
    this.liveNotes.onLine();
    if (isWakePhrase(entry.text)) {
      console.log(`[questions] wake phrase from ${entry.speaker}: "${entry.text}"`);
      answerQuestions(this, { by: entry.speaker, fromVoice: true }).catch((err) => console.error('[questions] failed:', err.message));
    }
  }

  participantNames() {
    return [...this.participantIds].map((id) => this.nameOf(id));
  }

  /** Registered crew members who were never in this call: they get the recap ping and a private DM. */
  absentCrew() {
    return listPeople().filter((p) => !this.participantIds.has(p.id));
  }

  /** Everything a planning round needs (all public: names, summary, transcript). */
  callInfo() {
    return {
      id: this.transcript.id,
      summary: this.summary,
      transcriptText: this.transcript.toText(),
      inCall: [...this.participantIds].map((id) => ({ id, name: this.nameOf(id) })),
      absent: this.absentCrew().map((p) => ({ id: p.id, name: p.name })),
    };
  }

  /** Words Muse Voice Transcribe should listen for: everyone's names, plus our wake words. */
  keywords() {
    const names = [
      ...this.voiceChannel.members.filter((m) => !m.user.bot).map((m) => m.displayName),
      ...listPeople().map((p) => p.name),
    ];
    return [...new Set([...names, 'Meta', 'Orbit'])];
  }

  publish() {
    bus.emit('session', { state: this.state, channel: this.voiceChannel.name, startedAt: this.startedAt.toISOString() });
  }

  isBot(userId) {
    return this.guild.client.users.cache.get(userId)?.bot ?? false;
  }

  nameOf(userId) {
    return (
      this.guild.members.cache.get(userId)?.displayName ??
      this.guild.client.users.cache.get(userId)?.username ??
      userId
    );
  }

  statsFor(userId) {
    if (!this.stats.has(userId)) this.stats.set(userId, { packets: 0, decodeErrors: 0, streamErrors: 0 });
    return this.stats.get(userId);
  }
}

export function getSession(guildId) {
  return sessions.get(guildId) ?? null;
}

/** The active session, or the one that just ended. */
export function getRecentSession(guildId) {
  return sessions.get(guildId) ?? lastEnded.get(guildId) ?? null;
}

export async function startSession({ guild, voiceChannel }) {
  if (sessions.has(guild.id)) {
    throw new Error(`I'm already in **${sessions.get(guild.id).voiceChannel.name}**. Use \`/stop\` first.`);
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false, // must hear the call to take notes
    selfMute: false, // will speak for "Any questions, Meta?" (Phase 3b)
    debug: config.voiceDebug,
  });

  connection.on('stateChange', (from, to) => {
    if (from.status !== to.status) console.log(`[voice] ${from.status} → ${to.status}`);
  });
  connection.on('transitioned', (id) => console.log(`[voice] DAVE transition ${id} complete`));
  connection.on('error', (err) => console.error('[voice] connection error:', err.message));
  if (config.voiceDebug) connection.on('debug', (msg) => console.log('[voice:debug]', msg));

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch {
    connection.destroy();
    throw new Error('I couldn\'t connect to voice within 20 seconds. Check that I have **Connect** permission, then try again.');
  }

  // Stage channel fallback: bots join as audience; try to become a speaker so we can talk later.
  if (voiceChannel.type === ChannelType.GuildStageVoice) {
    await guild.members.me.voice.setSuppressed(false).catch(() => {
      console.warn('[voice] could not become a Stage speaker (needs Mute Members). Listening only.');
    });
  }

  const session = new Session({ guild, voiceChannel, connection });
  session.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  session.player.on('error', (err) => console.error('[voice] playback error:', err.message));
  connection.subscribe(session.player);
  session.sink = createTranscriberSink(session);
  session.stopCapture = startCapture(session, session.sink);
  sessions.set(guild.id, session);
  session.publish();

  // If Discord drops us, try to reconnect for 5s, otherwise end cleanly.
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      await endSession(guild.id);
    }
  });

  return session;
}

export function pauseSession(guildId) {
  const s = sessions.get(guildId);
  if (s) {
    s.state = 'paused';
    s.publish();
  }
  return s;
}

export function resumeSession(guildId) {
  const s = sessions.get(guildId);
  if (s) {
    s.state = 'listening';
    s.publish();
  }
  return s;
}

/** Stops capture, leaves the call, waits for the last transcripts, and returns the session. */
export async function endSession(guildId) {
  const s = sessions.get(guildId);
  if (!s) return null;
  sessions.delete(guildId);
  s.endedAt = new Date();
  s.stopCapture();
  s.player.stop(true);
  if (s.connection.state.status !== VoiceConnectionStatus.Destroyed) s.connection.destroy();
  await s.sink.drain();
  s.liveNotes.stop();
  s.transcript.save();
  s.state = 'ended';
  s.publish();
  lastEnded.set(guildId, s);
  return s;
}

/** Consent: warn anyone who joins a call Orbit is listening to; leave when the humans are gone. */
export async function onVoiceStateUpdate(oldState, newState) {
  const s = sessions.get(newState.guild.id);
  if (!s || newState.member?.user.bot) return;
  const channelId = s.voiceChannel.id;

  if (newState.channelId === channelId && oldState.channelId !== channelId) {
    s.participantIds.add(newState.id);
    await s.voiceChannel
      .send({
        content: `<@${newState.id}>`,
        embeds: [stateNotice('👋', 'Heads up: Orbit is listening in this call. Anyone can type `/pause` or `/stop`.')],
      })
      .catch((err) => console.warn('[voice] could not post join notice:', err.message));
  }

  if (oldState.channelId === channelId && newState.channelId !== channelId) {
    const humansLeft = s.voiceChannel.members.filter((m) => !m.user.bot).size;
    if (humansLeft === 0) {
      await endSession(newState.guild.id);
      let note = 'Everyone left, so I stopped listening and left the call.';
      if (s.transcript.entries.length > s.recappedLines) {
        await postRecap(s)
          .then((r) => r && (note += ` Recap posted in <#${r.channel.id}>.`))
          .catch((err) => {
            console.error('[recap] failed after call ended:', err.message);
            note += ' ⚠️ I couldn\'t post the recap. Try `/recap`.';
          });
      }
      if (s.summary) {
        await startRound(s.guild.client, s.guild.id, s.callInfo())
          .then((r) => (note += ` Sent ${r.invited.length} private check-in${r.invited.length === 1 ? '' : 's'}.`))
          .catch((err) => console.error('[round] could not start:', err.message));
      }
      await s.voiceChannel.send({ embeds: [stateNotice('👋', note)] }).catch(() => {});
    }
  }
}
