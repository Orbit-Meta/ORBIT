import { ChannelType, Collection } from 'discord.js';
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
import { listPeople, renamePerson } from '../store/people.js';
import { serverName } from '../discord/names.js';
import { bus } from '../dashboard/bus.js';

// One listening session per server. State: 'listening' | 'paused' | 'ended'.
const sessions = new Map();
const lastEnded = new Map(); // guildId -> most recent ended session, so /recap works after /stop
const NO_AUDIO_WARNING_MS = 45_000;
const NOTICE_COOLDOWN_MS = 60_000;

class Session {
  constructor({ guild, voiceChannel, connection }) {
    this.guild = guild;
    this.voiceChannel = voiceChannel; // a real voice channel, or a text-channel stand-in for voiceless demos
    this.connection = connection; // null when there's no voice connection
    this.state = 'listening';
    this.startedAt = new Date();
    this.transcript = new Transcript(this.startedAt);
    this.failedUtterances = 0;
    this.stats = new Map(); // userId -> { packets, decodeErrors, streamErrors }
    this.names = new Map(); // display names for demo cast members who aren't real Discord users
    this.participantIds = new Set(voiceChannel.members.filter((m) => !m.user.bot).map((m) => m.id));
    this.recappedLines = 0;
    this.summary = null; // latest recap from Muse Spark
    this.lastNoticeAt = {};
    this.liveNotes = createLiveNotes(this);
  }

  /** Add a final transcript line (from live audio, demo replay, or Orbit itself) and react to it. */
  addLine({ userId, speaker, text, startedAt = new Date().toISOString(), endedAt = startedAt }) {
    const entry = this.transcript.add({ userId, speaker, startedAt, endedAt, text });
    bus.emit('final', entry);
    if (userId === 'orbit') return entry; // Orbit's own turn: context only
    console.log(`[transcript] ${speaker}: ${text}`);
    this.participantIds.add(userId);
    this.liveNotes.onLine();
    if (isWakePhrase(text)) {
      console.log(`[questions] wake phrase from ${speaker}: "${text}"`);
      answerQuestions(this, { by: speaker, fromVoice: true }).catch((err) => {
        console.error('[questions] failed:', err.message);
        this.notice('questions', '⚠️', "I couldn't come up with questions just now (Muse Spark didn't answer). Try `/questions`.");
      });
    }
    return entry;
  }

  /** Post a problem notice in the call's chat, at most once a minute per kind. */
  notice(kind, emoji, text) {
    if (Date.now() - (this.lastNoticeAt[kind] ?? 0) < NOTICE_COOLDOWN_MS) return;
    this.lastNoticeAt[kind] = Date.now();
    this.voiceChannel.send({ embeds: [stateNotice(emoji, text)] }).catch((err) => console.warn('[notice] could not post:', err.message));
  }

  participantNames() {
    return [...this.participantIds].map((id) => this.nameOf(id));
  }

  /** Registered crew members who were never in this call: they get the recap ping and a private DM. */
  absentCrew() {
    return listPeople()
      .filter((p) => !this.participantIds.has(p.id))
      .map((p) => ({ ...p, name: this.names.get(p.id) ?? p.name }));
  }

  /** Look up people's current server nicknames (and keep people.json in sync). */
  async refreshNames(ids) {
    await Promise.all(
      [...new Set(ids)].filter((id) => /^\d+$/.test(id)).map(async (id) => {
        const name = await serverName(this.guild, id);
        this.names.set(id, name);
        renamePerson(id, name);
      }),
    );
  }

  /** Fetch a newly seen person's server nickname once per call. */
  ensureName(userId) {
    if (this.names.has(userId) || !/^\d+$/.test(userId)) return;
    this.names.set(userId, this.nameOf(userId)); // placeholder until Discord answers
    this.refreshNames([userId]).catch(() => {});
  }

  /** Everything a planning round needs (all public: names, summary, transcript). */
  callInfo() {
    return {
      id: this.transcript.id,
      summary: this.summary,
      transcriptText: this.transcript.toText(),
      // Only real Discord users can get DMs (demo cast members have ids like "demo-…").
      inCall: [...this.participantIds].filter((id) => /^\d+$/.test(id)).map((id) => ({ id, name: this.nameOf(id) })),
      absent: this.absentCrew().map((p) => ({ id: p.id, name: p.name })),
    };
  }

  /** Words Muse Voice Transcribe should listen for: everyone's names, plus our wake words. */
  keywords() {
    const names = [
      ...this.voiceChannel.members.filter((m) => !m.user.bot).map((m) => m.displayName),
      ...this.names.values(),
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

  /** Server nickname as fetched by refreshNames(); the member cache is only a fallback. */
  nameOf(userId) {
    return (
      this.names.get(userId) ??
      this.guild.members.cache.get(userId)?.displayName ??
      this.guild.client.users.cache.get(userId)?.displayName ??
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

/** Stand-in "voice channel" for demos without voice: notices go to a text channel, nobody is "in" it. */
function voicelessChannel(textChannel) {
  return { id: `voiceless-${textChannel.id}`, name: 'Demo call (no voice)', members: new Collection(), send: (p) => textChannel.send(p) };
}

/**
 * @param {object} args
 * @param {import('discord.js').Guild} args.guild
 * @param {import('discord.js').VoiceBasedChannel|null} args.voiceChannel  null = no voice connection (demo fallback)
 * @param {import('discord.js').TextBasedChannel} [args.textChannel]       where notices go when there's no voice channel
 * @param {boolean} [args.capture]  false = don't capture audio (demo mode feeds the transcript instead)
 */
export async function startSession({ guild, voiceChannel, textChannel, capture = true }) {
  if (sessions.has(guild.id)) {
    throw new Error(`I'm already in **${sessions.get(guild.id).voiceChannel.name}**. Use \`/stop\` first.`);
  }

  let connection = null;
  if (voiceChannel) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false, // must hear the call to take notes
      selfMute: false, // speaks for "Any questions, Meta?"
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
      throw new Error("I couldn't connect to voice within 20 seconds. Check that I have **Connect** permission, then try again (or use `/demo` without voice).");
    }

    // Stage channel fallback: bots join as audience; try to become a speaker so we can talk later.
    if (voiceChannel.type === ChannelType.GuildStageVoice) {
      await guild.members.me.voice.setSuppressed(false).catch(() => {
        console.warn('[voice] could not become a Stage speaker (needs Mute Members). Listening only.');
      });
    }
  }

  const session = new Session({ guild, voiceChannel: voiceChannel ?? voicelessChannel(textChannel), connection });
  // Everyone in the call and every crew member, by their current server nickname.
  await session.refreshNames([...session.participantIds, ...listPeople().map((p) => p.id)]);
  session.player = null;
  if (connection) {
    session.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    session.player.on('error', (err) => console.error('[voice] playback error:', err.message));
    connection.subscribe(session.player);
  }
  session.sink = createTranscriberSink(session);
  session.stopCapture = connection && capture ? startCapture(session, session.sink) : () => {};
  sessions.set(guild.id, session);
  session.publish();

  if (connection) {
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
  }

  if (connection && capture) {
    // No-audio watchdog: people are here, but Discord hasn't sent a single packet.
    setTimeout(() => {
      if (sessions.get(guild.id) !== session || session.state !== 'listening' || session.stats.size > 0) return;
      if (!voiceChannel.members.some((m) => !m.user.bot)) return;
      session.notice(
        'no-audio',
        '🎧',
        "I haven't heard anything yet. Check that you're unmuted and that I'm not server-muted. If voice keeps failing, `/stop` and run `/demo` instead.",
      );
    }, NO_AUDIO_WARNING_MS).unref();
  }

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
  s.player?.stop(true);
  if (s.connection && s.connection.state.status !== VoiceConnectionStatus.Destroyed) s.connection.destroy();
  await s.sink.drain();
  s.liveNotes.stop();
  s.transcript.save();
  s.state = 'ended';
  s.publish();
  lastEnded.set(guildId, s);
  return s;
}

/**
 * After a call ends: post the recap (unless /recap already covered every line), then send private
 * check-ins. Returns human-readable status lines for whoever ended the call.
 */
export async function wrapUpCall(s) {
  const lines = [];
  if (!s.transcript.entries.length) {
    lines.push('📝 Nothing was transcribed, so there is nothing to recap. If voice isn\'t working, try `/demo`.');
    return lines;
  }
  if (s.transcript.entries.length > s.recappedLines) {
    try {
      const r = await postRecap(s);
      lines.push(`🧠 Recap posted in <#${r.channel.id}>.`);
    } catch (err) {
      console.error('[recap] failed:', err.message);
      lines.push(`⚠️ Muse Spark couldn't write the recap (${err.message}). Try \`/recap\`.`);
    }
  }
  if (s.summary) {
    try {
      await s.refreshNames([...s.participantIds, ...listPeople().map((p) => p.id)]); // nicknames may have changed during the call
      const r = await startRound(s.guild.client, s.guild.id, s.callInfo());
      lines.push(r.invited.length ? `📬 Sent ${r.invited.length} private check-in${r.invited.length === 1 ? '' : 's'} by DM.` : '📬 No one to DM: nobody is in the Orbit crew yet (`/link-email`).');
    } catch (err) {
      console.error('[round] could not start:', err.message);
      lines.push(`⚠️ Couldn't send private check-ins: ${err.message}`);
    }
  }
  return lines;
}

/** Consent: warn anyone who joins a call Orbit is listening to; leave when the humans are gone. */
export async function onVoiceStateUpdate(oldState, newState) {
  const s = sessions.get(newState.guild.id);
  if (!s?.connection || newState.member?.user.bot) return;
  const channelId = s.voiceChannel.id;

  if (newState.channelId === channelId && oldState.channelId !== channelId) {
    s.participantIds.add(newState.id);
    s.ensureName(newState.id);
    await s.voiceChannel
      .send({
        content: `<@${newState.id}>`,
        embeds: [stateNotice('👋', 'Heads up: Orbit is listening in this call. Anyone can type `/pause` or `/stop`.')],
      })
      .catch((err) => console.warn('[voice] could not post join notice:', err.message));
  }

  if (oldState.channelId === channelId && newState.channelId !== channelId) {
    const humansLeft = s.voiceChannel.members.filter((m) => !m.user.bot).size;
    if (humansLeft === 0 && !s.demo) {
      await endSession(newState.guild.id);
      const lines = ['Everyone left, so I stopped listening and left the call.', ...(await wrapUpCall(s))];
      await s.voiceChannel.send({ embeds: [stateNotice('👋', lines.join('\n'))] }).catch(() => {});
    }
  }
}
