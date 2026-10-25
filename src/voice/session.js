import { ChannelType } from 'discord.js';
import { entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { config } from '../config.js';
import { startCapture } from './capture.js';
import { createSpikeSink } from './spike.js';
import { stateNotice } from '../discord/format.js';

// One listening session per server. State: 'listening' | 'paused'.
const sessions = new Map();

class Session {
  constructor({ guild, voiceChannel, connection }) {
    this.guild = guild;
    this.voiceChannel = voiceChannel;
    this.connection = connection;
    this.state = 'listening';
    this.startedAt = new Date();
    this.stats = new Map(); // userId -> { packets, decodeErrors, streamErrors }
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
  session.sink = createSpikeSink(session);
  session.stopCapture = startCapture(session, session.sink);
  sessions.set(guild.id, session);

  // If Discord drops us, try to reconnect for 5s, otherwise end cleanly.
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      endSession(guild.id);
    }
  });

  return session;
}

export function pauseSession(guildId) {
  const s = sessions.get(guildId);
  if (s) s.state = 'paused';
  return s;
}

export function resumeSession(guildId) {
  const s = sessions.get(guildId);
  if (s) s.state = 'listening';
  return s;
}

/** Stops capture, leaves the call, and returns the receive-test results. */
export function endSession(guildId) {
  const s = sessions.get(guildId);
  if (!s) return null;
  sessions.delete(guildId);
  s.stopCapture();
  const results = s.sink.flush();
  if (s.connection.state.status !== VoiceConnectionStatus.Destroyed) s.connection.destroy();
  return { session: s, results };
}

/** Consent: warn anyone who joins a call Orbit is listening to; leave when the humans are gone. */
export async function onVoiceStateUpdate(oldState, newState) {
  const s = sessions.get(newState.guild.id);
  if (!s || newState.member?.user.bot) return;
  const channelId = s.voiceChannel.id;

  if (newState.channelId === channelId && oldState.channelId !== channelId) {
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
      endSession(newState.guild.id);
      await s.voiceChannel
        .send({ embeds: [stateNotice('👋', 'Everyone left, so I stopped listening and left the call.')] })
        .catch(() => {});
    }
  }
}
