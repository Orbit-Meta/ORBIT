import path from 'node:path';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { requireEnv } from '../config.js';
import { endSession, getRecentSession, getSession, pauseSession, resumeSession, startSession, wrapUpCall } from '../voice/session.js';
import { postRecap } from '../discord/recap.js';
import { answerQuestions } from '../voice/askMeta.js';
import { runDemo } from '../demo/runDemo.js';
import { addToCalendar, getActiveRound, getPlanMissingCalendar, inviteToRound, resolveRound } from '../plan/round.js';
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

  if (n > s.recappedLines) await interaction.editReply({ embeds: [stateNotice('⏹️', [...lines, '🧠 Muse Spark is writing the recap…'].join('\n'))] });
  lines.push(...(await wrapUpCall(s))); // recap, then private check-ins
  return interaction.editReply({ embeds: [stateNotice('⏹️', lines.join('\n'))] });
}

/** Plan now with the private replies received so far (or retry the calendar step). */
export async function resolve(interaction) {
  const round = getActiveRound(interaction.guildId);
  if (!round) {
    const missing = getPlanMissingCalendar(interaction.guildId);
    if (!missing) return interaction.reply(ephemeral('No private check-ins are in progress. They start when a call ends.'));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cal = await addToCalendar(interaction.client, missing);
    return interaction.editReply(cal ? '📅 Added the plan to Google Calendar.' : "📅 Still couldn't add it. See the message in the channel.");
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await resolveRound(interaction.client, round);
    return interaction.editReply('🎉 Plan posted.');
  } catch (err) {
    console.error('[round] resolve failed:', err);
    return interaction.editReply(`⚠️ Muse Spark couldn't resolve the plan: ${err.message}`);
  }
}

/** DM one more person into the current check-ins. */
export async function ask(interaction) {
  const user = interaction.options.getUser('person', true);
  if (user.bot) return interaction.reply(ephemeral("I can't DM bots."));
  const round = getActiveRound(interaction.guildId);
  if (!round) return interaction.reply(ephemeral('No private check-ins are in progress. They start when a call ends.'));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const added = await inviteToRound(interaction.client, round, { id: user.id, name: member?.displayName ?? user.username });
  return interaction.editReply(added ? `📬 Sent ${user} a private check-in.` : `${user} already has a check-in.`);
}

/** Backup for the stage: replay a call through the same Meta pipeline (see src/demo/runDemo.js). */
export async function demo(interaction) {
  const mode = interaction.options.getString('mode') ?? 'script';
  if (getSession(interaction.guildId)) return interaction.reply(ephemeral("I'm already in a call. Use `/stop` first, then `/demo`."));
  try {
    requireEnv('MODEL_API_KEY');
  } catch (err) {
    return interaction.reply(ephemeral(`⚠️ ${err.message}`));
  }
  await interaction.reply(ephemeral(`🎬 Starting the demo (${mode})${interaction.member.voice?.channel ? ` in 🔊 **${interaction.member.voice.channel.name}**` : ' without voice (join a voice channel first if you want Orbit to speak)'}.`));
  runDemo({ guild: interaction.guild, member: interaction.member, textChannel: interaction.channel, mode }).catch(async (err) => {
    console.error('[demo] failed:', err);
    await interaction.followUp(ephemeral(`⚠️ Demo stopped: ${err.message}`)).catch(() => {});
    if (getSession(interaction.guildId)?.demo) await endSession(interaction.guildId);
  });
}

/** Same as saying "Any questions, Meta?" in the call. */
export async function questions(interaction) {
  const s = getSession(interaction.guildId);
  if (!s) return interaction.reply(ephemeral("I'm not in a call right now. Use `/join`."));
  if (!s.transcript.entries.length) return interaction.reply(ephemeral('Talk a little first, then ask me.'));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const r = await answerQuestions(s, { by: interaction.member.displayName });
    return interaction.editReply(r ? `🎙️ Asked in 🔊 **${s.voiceChannel.name}**.` : "I'm already answering. Give me a second.");
  } catch (err) {
    console.error('[questions] failed:', err);
    return interaction.editReply(`⚠️ Muse Spark couldn't come up with questions: ${err.message}`);
  }
}

export async function recap(interaction) {
  const s = getRecentSession(interaction.guildId);
  if (!s?.transcript.entries.length) return interaction.reply(ephemeral('Nothing to recap yet: no one has said anything since `/join`.'));
  await interaction.deferReply();
  try {
    const r = await postRecap(s);
    const where = r.channel.id === interaction.channelId ? 'above' : `in <#${r.channel.id}>`;
    return interaction.editReply(`🧠 Muse Spark summarized ${s.state === 'ended' ? 'the call' : 'the call so far'}. Recap posted ${where}.`);
  } catch (err) {
    console.error('[recap] failed:', err);
    return interaction.editReply(`⚠️ Muse Spark couldn't write the recap: ${err.message}`);
  }
}
