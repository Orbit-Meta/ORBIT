import path from 'node:path';
import { config } from '../config.js';
import { summarizeCall } from '../core/summarizeCall.js';
import { bus } from '../dashboard/bus.js';
import { writeJson } from '../store/jsonFile.js';
import { recapEmbed } from './format.js';

/**
 * Summarize the call with Muse Spark and post the recap to the recap channel,
 * pinging crew members who weren't in the call. Saves the raw JSON to data/summaries/.
 */
export async function postRecap(session) {
  const lines = [...session.transcript.entries];
  if (!lines.length) return null;
  const absent = session.absentCrew();

  bus.emit('thinking', { task: 'call recap', text: '', active: true });
  let summary;
  try {
    summary = await summarizeCall({
      lines,
      inCall: session.participantNames(),
      absent: absent.map((p) => p.name),
      timezone: config.timezone,
      purpose: 'recap',
      onReasoning: (text) => bus.emit('thinking', { task: 'call recap', text, active: true }),
    });
  } finally {
    bus.emit('thinking', { active: false });
  }

  const file = path.join(config.dataDir, 'summaries', `${session.transcript.id}.json`);
  writeJson(file, { transcriptId: session.transcript.id, createdAt: new Date().toISOString(), lines: lines.length, summary });
  session.summary = summary;
  session.recappedLines = lines.length;
  bus.emit('insights', { summary, at: Date.now(), lines: lines.length, final: true });

  const channel = await session.guild.client.channels.fetch(config.discord.recapChannelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('DISCORD_RECAP_CHANNEL_ID is not a text channel I can see.');

  const minutes = Math.max(1, Math.round(((session.endedAt ?? new Date()) - session.startedAt) / 60_000));
  const message = await channel.send({
    content: absent.length ? `${absent.map((p) => `<@${p.id}>`).join(' ')} you missed a call. Here's the catch-up 👇` : undefined,
    embeds: [recapEmbed(summary, { channelName: session.voiceChannel.name, minutes })],
    allowedMentions: { users: absent.map((p) => p.id) },
  });
  console.log(`[recap] posted to #${channel.name} (${path.relative(process.cwd(), file)})`);
  return { summary, message, channel, file };
}
