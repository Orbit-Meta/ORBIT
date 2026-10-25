import { EmbedBuilder } from 'discord.js';
import { formatWhen } from '../core/when.js';

// Everything in this file is safe for group channels: it is built from public data only.

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

function planDay(summary) {
  if (!summary.proposed_day.date) return summary.proposed_day.label;
  return formatWhen(summary.proposed_day.date);
}

/** The DM each person gets. Contains only public info about the plan. */
export function checkInEmbed(summary, { name, wasInCall }) {
  const day = planDay(summary);
  const intro = wasInCall
    ? `Thanks for the call, **${name}**! Anything you'd rather not say in front of everyone? Tell me here.`
    : `Hey **${name}**! Your friends just planned **${summary.headline}**. You weren't on the call, so I'm checking with you privately.`;
  const embed = new EmbedBuilder()
    .setColor(ORBIT_BLUE)
    .setTitle('🔒 Quick private check-in')
    .setDescription(`${intro}\n\n**Only Orbit sees your answers.** The group only sees the final plan.`)
    .setFooter({ text: 'Orbit · powered by Meta Muse' });
  if (day) embed.addFields({ name: '🗓️ Day', value: day, inline: true });
  const choices = summary.options.filter((o) => o.kind !== 'time');
  if (choices.length) embed.addFields({ name: '💡 Options', value: clip(choices.map((o) => `${o.label}${o.location ? ` (${o.location})` : ''}`).join(' · ')), inline: true });
  return embed;
}

/** Public progress of the private check-ins: only "replied" / "waiting", never what anyone said. */
export function checkInStatusEmbed({ invited, unregistered }) {
  const icon = { replied: '✅ replied', waiting: '⏳ waiting', unreachable: "⚠️ couldn't DM (DMs may be off)" };
  const lines = [
    `I DM'd ${invited.map((p) => `**${p.name}**`).join(', ')} to ask privately about availability, budget, and food preferences.`,
    'Answers stay private. The group only sees the final plan.',
    '',
    ...invited.map((p) => `${icon[p.status]} · ${p.name}`),
  ];
  for (const name of unregistered) lines.push(`👋 **${name}** isn't in the Orbit crew yet. ${name}, use \`/link-email\` and I'll DM you.`);
  lines.push('', "I'll post the plan once everyone replies, or use `/resolve` to plan with the replies so far.");
  return new EmbedBuilder().setColor(ORBIT_BLUE).setTitle('📬 Private check-ins').setDescription(clip(lines.join('\n'), 4000));
}

/** The final plan for the group. `publicMessage` has already passed the privacy guard. */
export function planEmbed(plan, publicMessage) {
  if (!plan.feasible) {
    return new EmbedBuilder().setColor(0xf5a524).setTitle("🤔 Couldn't lock in a plan yet").setDescription(publicMessage);
  }
  const embed = new EmbedBuilder()
    .setColor(0x31c48d)
    .setTitle(`🎉 It's a plan: ${plan.title}`)
    .setDescription(publicMessage)
    .addFields(
      { name: '🗓️ When', value: formatWhen(plan.date, plan.start_time, plan.end_time), inline: true },
      { name: '📍 Where', value: plan.location || plan.place_name, inline: true },
    )
    .setFooter({ text: "Resolved by Meta Muse Spark · everyone's private answers stayed private" });
  if (plan.attendees.length) embed.addFields({ name: "🙋 Who's coming", value: clip(plan.attendees.join(', ')) });
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
