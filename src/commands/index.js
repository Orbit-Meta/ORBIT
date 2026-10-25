import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import * as voice from './voice.js';
import * as crew from './crew.js';
import { handleRoundInteraction } from '../plan/round.js';

const commands = [
  { name: 'join', description: 'Orbit joins your voice channel and starts taking notes', run: voice.join },
  { name: 'pause', description: 'Pause Orbit: nothing said while paused is captured', run: voice.pause },
  { name: 'resume', description: 'Resume Orbit after a pause', run: voice.resume },
  { name: 'stop', description: 'Orbit stops listening and leaves the call', run: voice.stop },
  { name: 'recap', description: 'Summarize the call so far', run: voice.recap },
  { name: 'questions', description: 'Orbit asks what the plan is still missing (same as saying "Any questions, Meta?")', run: voice.questions },
  { name: 'resolve', description: 'Make the plan now with the private replies received so far', run: voice.resolve },
  {
    name: 'ask',
    description: 'Send someone a private check-in for the current plan',
    options: (b) => b.addUserOption((o) => o.setName('person').setDescription('Who to DM').setRequired(true)),
    run: voice.ask,
  },
  { name: 'orbit-setup', description: 'Post a "Join Orbit" button so people can link their email', run: crew.orbitSetup },
  { name: 'link-email', description: 'Link (or change) the email Orbit sends your calendar invites to', run: crew.showLinkModal },
  { name: 'unlink', description: 'Leave the Orbit crew and delete your email', run: crew.unlink },
];

export const commandDefinitions = commands.map(({ name, description, options }) => {
  const builder = new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild);
  return (options ? options(builder) : builder).toJSON();
});

const byName = new Map(commands.map((c) => [c.name, c.run]));

export async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) return byName.get(interaction.commandName)?.(interaction);
  if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith('orbit:round:')) return handleRoundInteraction(interaction);
  if (interaction.isButton() && interaction.customId === crew.LINK_BUTTON_ID) return crew.showLinkModal(interaction);
  if (interaction.isModalSubmit() && interaction.customId === crew.LINK_MODAL_ID) return crew.submitLinkModal(interaction);
}
