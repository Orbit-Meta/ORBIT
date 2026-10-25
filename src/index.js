import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { generateDependencyReport } from '@discordjs/voice';
import { config, requireEnv } from './config.js';
import { commandDefinitions, handleInteraction } from './commands/index.js';
import { onVoiceStateUpdate } from './voice/session.js';

requireEnv('DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID');
if (config.voiceDebug) console.log(generateDependencyReport());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const BOT_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
]);
const inviteUrl = () =>
  `https://discord.com/oauth2/authorize?client_id=${config.discord.clientId}` +
  `&scope=bot+applications.commands&permissions=${BOT_PERMISSIONS.bitfield}`;

client.once(Events.ClientReady, async (c) => {
  const guild = await c.guilds.fetch(config.discord.guildId).catch(() => null);
  if (!guild) {
    const servers = c.guilds.cache.map((g) => `  • ${g.name} (${g.id})`).join('\n') || '  (none — the bot has not been invited anywhere yet)';
    console.error(
      `[orbit] DISCORD_GUILD_ID=${config.discord.guildId} is not a server this bot is in.\n` +
        `Servers the bot is in:\n${servers}\n` +
        `Invite the bot with: ${inviteUrl()}\n` +
        'Then set DISCORD_GUILD_ID to the server ID (right-click the server icon → Copy Server ID).',
    );
    process.exit(1);
  }
  // Guild commands update instantly (global ones can take an hour).
  await guild.commands.set(commandDefinitions);
  console.log(`[orbit] online as ${c.user.tag} in "${guild.name}" with ${commandDefinitions.length} commands`);
  console.log(`[orbit] invite link (if needed): ${inviteUrl()}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (err) {
    console.error('[orbit] interaction failed:', err);
    const reply = { content: `⚠️ Something went wrong: ${err.message}`, flags: MessageFlags.Ephemeral };
    if (!interaction.isRepliable()) return;
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  onVoiceStateUpdate(oldState, newState).catch((err) => console.error('[voice] state update failed:', err));
});

client.login(config.discord.token);
