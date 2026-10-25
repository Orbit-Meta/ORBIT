import path from 'node:path';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { requireEnv } from '../config.js';
import { endSession, getSession, pauseSession, resumeSession, startSession } from '../voice/session.js';
import { listeningNotice, stateNotice } from '../discord/format.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

export async function join(interaction) {
  const voiceChannel = interaction.member.voice?.channel;
  if (!voiceChannel) return interaction.reply(ephemeral('Join a voice channel first, then run `/join`.'));
  try {
    requireEnv('MODEL_API_KEY');
  } catch (err) {
    return interaction.reply(ephemeral(`⚠️ ${err.message}. Orbit can't transcribe without Meta's Muse API key.`));
  }

  const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    return interaction.reply(ephemeral(`I need **View Channel** and **Connect** permission in **${voiceChannel.name}**.`));
  }

  await interaction.deferReply();
  try {
    await startSession({ guild: interaction.guild, voiceChannel });
  } catch (err) {
    return interaction.editReply(`⚠️ ${err.message}`);
  }

  const notice = listeningNotice(voiceChannel.name);
  await interaction.editReply({ embeds: [notice] });
  // Also post in the voice channel's own chat so everyone in the call sees it.
  if (interaction.channelId !== voiceChannel.id) {
    await voiceChannel.send({ embeds: [notice] }).catch((err) => {
      console.warn('[join] could not post notice in voice chat:', err.message);
    });
  }
}

export async function pause(interaction) {
  const s = getSession(interaction.guildId);
  if (!s) return interaction.reply(ephemeral("I'm not in a call right now."));
  if (s.state === 'paused') return interaction.reply(ephemeral("I'm already paused. Use `/resume` to continue."));
  pauseSession(interaction.guildId);
  return interaction.reply({
    embeds: [stateNotice('⏸️', `Paused by ${interaction.member.displayName}. Nothing is being captured. \`/resume\` to continue.`)],
  });
}

export async function resume(interaction) {
  const s = getSession(interaction.guildId);
  if (!s) return interaction.reply(ephemeral("I'm not in a call right now. Use `/join`."));
  if (s.state === 'listening') return interaction.reply(ephemeral("I'm already listening."));
  resumeSession(interaction.guildId);
  return interaction.reply({ embeds: [stateNotice('▶️', `Resumed by ${interaction.member.displayName}. Orbit is listening again.`)] });
}

export async function stop(interaction) {
  if (!getSession(interaction.guildId)) return interaction.reply(ephemeral("I'm not in a call right now."));
  await interaction.deferReply();
  const s = await endSession(interaction.guildId);

  const lines = [`Stopped by ${interaction.member.displayName}. I've stopped listening and left the call.`];
  const n = s.transcript.entries.length;
  lines.push('', n ? `📝 Transcript: ${n} line${n === 1 ? '' : 's'} saved to \`${path.relative(process.cwd(), s.transcript.txtFile)}\`` : '📝 Nothing was transcribed.');
  if (s.failedUtterances) lines.push(`⚠️ ${s.failedUtterances} utterance(s) couldn't be transcribed (see the bot console).`);
  return interaction.editReply({ embeds: [stateNotice('⏹️', lines.join('\n'))] });
}

export async function recap(interaction) {
  // Stub: Muse Spark summaries are built in Phase 3.
  return interaction.reply(ephemeral('📝 Recaps arrive in Phase 3 (Muse Spark is not wired up yet).'));
}
