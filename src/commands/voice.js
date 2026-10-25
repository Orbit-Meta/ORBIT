import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { endSession, getSession, pauseSession, resumeSession, startSession } from '../voice/session.js';
import { listeningNotice, stateNotice } from '../discord/format.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

export async function join(interaction) {
  const voiceChannel = interaction.member.voice?.channel;
  if (!voiceChannel) return interaction.reply(ephemeral('Join a voice channel first, then run `/join`.'));

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
  const ended = endSession(interaction.guildId);
  if (!ended) return interaction.reply(ephemeral("I'm not in a call right now."));

  const lines = [`Stopped by ${interaction.member.displayName}. I've stopped listening and left the call.`];
  // Phase 1 receive spike report (replaced by the transcript in Phase 2).
  if (ended.results.length) {
    lines.push('', '**Voice receive test**');
    for (const r of ended.results) {
      lines.push(`• ${r.name}: ${r.seconds}s captured · ${r.packets} packets · ${r.decodeErrors} decode errors · ${r.streamErrors} stream errors`);
    }
  } else {
    lines.push('', '**Voice receive test:** no audio was received.');
  }
  return interaction.reply({ embeds: [stateNotice('⏹️', lines.join('\n'))] });
}

export async function recap(interaction) {
  // Stub: Muse Spark summaries are built in Phase 3.
  return interaction.reply(ephemeral('📝 Recaps arrive in Phase 3 (Muse Spark is not wired up yet).'));
}
