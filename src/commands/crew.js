import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getPerson, removePerson, upsertPerson } from '../store/people.js';
import { joinOrbitCard } from '../discord/format.js';

export const LINK_BUTTON_ID = 'orbit:link';
export const LINK_MODAL_ID = 'orbit:link-modal';
const EMAIL_INPUT_ID = 'email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailModal(existingEmail) {
  const input = new TextInputBuilder()
    .setCustomId(EMAIL_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('you@gmail.com')
    .setRequired(true)
    .setMaxLength(254);
  if (existingEmail) input.setValue(existingEmail);

  return new ModalBuilder()
    .setCustomId(LINK_MODAL_ID)
    .setTitle('Join Orbit')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Email for calendar invites')
        .setDescription('Private: only Orbit sees this. It is never posted in a channel.')
        .setTextInputComponent(input),
    );
}

/** /orbit-setup — posts a public "Join Orbit" card with a button. */
export async function orbitSetup(interaction) {
  const button = new ButtonBuilder()
    .setCustomId(LINK_BUTTON_ID)
    .setLabel('Join Orbit')
    .setEmoji('🪐')
    .setStyle(ButtonStyle.Primary);
  return interaction.reply({ embeds: [joinOrbitCard()], components: [new ActionRowBuilder().addComponents(button)] });
}

/** /link-email and the "Join Orbit" button both open the private email form. */
export async function showLinkModal(interaction) {
  return interaction.showModal(emailModal(getPerson(interaction.user.id)?.email));
}

export async function submitLinkModal(interaction) {
  const email = interaction.fields.getTextInputValue(EMAIL_INPUT_ID).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return interaction.reply({ content: `"${email}" doesn't look like an email. Try again with \`/link-email\`.`, flags: MessageFlags.Ephemeral });
  }
  const name = interaction.member?.displayName ?? interaction.user.username;
  upsertPerson(interaction.user.id, { name, email });
  console.log(`[crew] ${name} (${interaction.user.id}) linked an email`);
  return interaction.reply({
    content: `✅ You're in the Orbit crew, **${name}**. Calendar invites will go to \`${email}\`.\n-# Only you can see this message.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function unlink(interaction) {
  const existed = removePerson(interaction.user.id);
  return interaction.reply({
    content: existed ? '👋 You left the Orbit crew and your email was deleted.' : "You weren't in the Orbit crew.",
    flags: MessageFlags.Ephemeral,
  });
}
