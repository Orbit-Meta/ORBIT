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
