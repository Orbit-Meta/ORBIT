import { EmbedBuilder } from 'discord.js';

const ORBIT_BLUE = 0x0866ff;

export function listeningNotice(voiceChannelName) {
  return new EmbedBuilder()
    .setColor(ORBIT_BLUE)
    .setTitle('🎙️ Orbit is listening')
    .setDescription(
      [
        `I'm taking notes in **${voiceChannelName}** to help you plan, using Meta's Muse AI.`,
        '',
        '• `/pause` — stop capturing for a bit (nothing said while paused is recorded)',
        '• `/resume` — start capturing again',
        '• `/stop` — I stop listening and leave the call',
        '',
        'Anyone in the call can use these.',
      ].join('\n'),
    );
}

export function stateNotice(emoji, text) {
  return new EmbedBuilder().setColor(ORBIT_BLUE).setDescription(`${emoji} ${text}`);
}

const KIND_EMOJI = { place: '📍', food: '🍽️', activity: '🎳', time: '🕔', other: '✨' };
const clip = (s, n = 1024) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const bullets = (items) => clip(items.map((i) => `• ${i}`).join('\n'));

/** The recap posted for people who missed the call. Built only from what was said out loud in the call. */
export function recapEmbed(summary, { channelName, minutes }) {
  const lines = [`Recap of a ${minutes}-minute call in 🔊 **${channelName}**.`];
  if (summary.proposed_day.date) {
    const day = new Date(`${summary.proposed_day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    lines.push(`🗓️ Planning for **${day}**`);
  }

  const embed = new EmbedBuilder()
    .setColor(ORBIT_BLUE)
    .setTitle(`📞 ${summary.headline}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Summarized by Meta Muse Spark · Orbit' })
    .setTimestamp(new Date());

  const fields = [
    [
      "🙋 Who's free",
      summary.people.map((p) => {
        const avail = p.availability || 'not sure yet';
        return `**${p.name}**: ${avail}${p.notes ? ` (${p.notes})` : ''}${p.in_call ? '' : ' · *missed the call*'}`;
      }),
    ],
    [
      '💡 Options',
      summary.options.map((o) => `${KIND_EMOJI[o.kind] ?? '✨'} ${o.label}${o.location ? ` (${o.location})` : ''}${o.notes ? `: ${o.notes}` : ''}`),
    ],
    ['✅ Decided', summary.decisions],
    ['❓ Still open', summary.open_questions],
  ];
  for (const [name, items] of fields) if (items.length) embed.addFields({ name, value: bullets(items) });
  return embed;
}

export function joinOrbitCard() {
  return new EmbedBuilder()
    .setColor(ORBIT_BLUE)
    .setTitle('🪐 Join the Orbit crew')
    .setDescription(
      [
        'Orbit turns your calls into plans and sends everyone a calendar invite.',
        '',
        'Click **Join Orbit** and enter the email where you want invites.',
        'Your email stays private: only Orbit sees it, and it is never posted here.',
      ].join('\n'),
    );
}
