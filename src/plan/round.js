// ─────────────────────────────────────────────────────────────────────────────
// A planning round: private DM check-ins → Muse Spark resolves → neutral plan.
//
// This is the ONLY module that touches private answers (src/store/privateStore.js).
// What it sends to group channels and the live screen is limited to names, a
// replied/waiting status, and the guarded plan from resolvePlan().
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config.js';
import { bus } from '../dashboard/bus.js';
import { collectConstraints } from '../core/collectConstraints.js';
import { resolvePlan } from '../core/resolvePlan.js';
import { createEvent } from '../core/createEvent.js';
import { isCalendarConnected } from '../google/auth.js';
import { calendarEmbed, checkInEmbed, checkInStatusEmbed, planEmbed } from '../discord/format.js';
import { readJson, writeJson } from '../store/jsonFile.js';
import { getPerson } from '../store/people.js';
import { readPrivate, savePrivateAnswer, savePrivateRationale } from '../store/privateStore.js';

const ROUNDS_DIR = path.join(config.dataDir, 'rounds');
const rounds = new Map(); // roundId -> round (public metadata only)
const activeByGuild = new Map(); // guildId -> roundId
const NO_PREFERENCE = '__none__';

// ─── Round state (public metadata: who was invited and whether they replied) ──

function saveRound(round) {
  writeJson(path.join(ROUNDS_DIR, `${round.id}.json`), round);
}

export function getRound(id) {
  if (!rounds.has(id)) {
    const saved = readJson(path.join(ROUNDS_DIR, `${id}.json`), null); // survive bot restarts
    if (saved) rounds.set(id, saved);
  }
  return rounds.get(id) ?? null;
}

/** Newest round for this server (from disk too, so it survives restarts). */
function latestRound(guildId) {
  if (!activeByGuild.has(guildId)) {
    const files = fs.existsSync(ROUNDS_DIR) ? fs.readdirSync(ROUNDS_DIR).filter((f) => f.endsWith('.json')).sort().reverse() : [];
    const latest = files.map((f) => getRound(f.slice(0, -5))).find((r) => r?.guildId === guildId);
    if (latest) activeByGuild.set(guildId, latest.id);
  }
  return getRound(activeByGuild.get(guildId) ?? '') ?? null;
}

export function getActiveRound(guildId) {
  const round = latestRound(guildId);
  return round && !round.resolved ? round : null;
}

/** The newest plan that was resolved but didn't make it onto the calendar (e.g. sign-in expired). */
export function getPlanMissingCalendar(guildId) {
  const round = latestRound(guildId);
  return round?.resolved && round.plan?.feasible && !round.calendar ? round : null;
}

/** What the group and the live screen may see. */
function publicState(round) {
  const status = { pending: 'waiting', answered: 'replied', declined: 'replied', unreachable: 'unreachable' };
  return {
    id: round.id,
    invited: Object.values(round.invited).map((p) => ({ name: p.name, status: status[p.status] })),
    unregistered: round.unregistered,
  };
}

async function groupChannel(client) {
  const channel = await client.channels.fetch(config.discord.recapChannelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('DISCORD_RECAP_CHANNEL_ID is not a text channel I can see.');
  return channel;
}

async function refreshStatus(client, round) {
  const state = publicState(round);
  bus.emit('round', state);
  const channel = await groupChannel(client);
  const payload = { embeds: [checkInStatusEmbed(state)] };
  if (round.statusMessageId) {
    const msg = await channel.messages.fetch(round.statusMessageId).catch(() => null);
    if (msg) return msg.edit(payload);
  }
  const msg = await channel.send(payload);
  round.statusMessageId = msg.id;
  saveRound(round);
}

// ─── Starting a round and sending DMs ──────────────────────────────────────

/**
 * After a call's recap: DM crew members who missed the call (and, with DM_EVERYONE,
 * everyone who was in it) for their private constraints.
 * @param {{ id, summary, transcriptText, inCall: {id, name}[], absent: {id, name}[] }} call
 */
export async function startRound(client, guildId, call) {
  const round = {
    id: call.id,
    guildId,
    createdAt: new Date().toISOString(),
    summary: call.summary,
    transcriptText: call.transcriptText,
    invited: {},
    members: [...call.inCall, ...call.absent].map(({ id, name }) => ({ id, name })), // for calendar invites
    unregistered: [],
    statusMessageId: null,
    resolved: false,
    plan: null,
  };
  rounds.set(round.id, round);
  activeByGuild.set(guildId, round.id);

  const recipients = [...call.absent.map((p) => ({ ...p, wasInCall: false })), ...(config.dmEveryone ? call.inCall.map((p) => ({ ...p, wasInCall: true })) : [])];
  // People Muse Spark says we still need, who aren't registered: we can't DM them, so say so publicly.
  const known = new Set(recipients.map((p) => p.name.toLowerCase()));
  round.unregistered = call.summary.needs_input_from.filter((n) => !known.has(n.toLowerCase()));

  for (const person of recipients) await invite(client, round, person);
  await refreshStatus(client, round);
  return publicState(round);
}

/** DM one more person into the round (late registration or /ask). */
export async function inviteToRound(client, round, person) {
  if (round.invited[person.id]) return false;
  round.unregistered = round.unregistered.filter((n) => n.toLowerCase() !== person.name.toLowerCase());
  round.members ??= [];
  if (!round.members.some((m) => m.id === person.id)) round.members.push({ id: person.id, name: person.name });
  await invite(client, round, { ...person, wasInCall: false });
  await refreshStatus(client, round);
  return true;
}

async function invite(client, round, { id, name, wasInCall }) {
  round.invited[id] = { name, wasInCall, status: 'pending' };
  try {
    const user = await client.users.fetch(id);
    await user.send({
      embeds: [checkInEmbed(round.summary, { name, wasInCall })],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`orbit:round:answer:${round.id}`).setLabel('Answer privately').setEmoji('✍️').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`orbit:round:decline:${round.id}`).setLabel("I can't make it").setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    console.log(`[round] DM'd ${name}`);
  } catch (err) {
    round.invited[id].status = 'unreachable';
    console.warn(`[round] couldn't DM ${name}: ${err.message}`);
  }
  saveRound(round);
}

// ─── DM interactions ───────────────────────────────────────────────────────

function answerModal(round) {
  const modal = new ModalBuilder().setCustomId(`orbit:round:modal:${round.id}`).setTitle('Private check-in (only Orbit sees this)');
  const choices = round.summary.options.filter((o) => o.kind !== 'time').slice(0, 24);
  if (choices.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('pref')
      .addOptions(
        ...choices.map((o, i) => ({ label: o.label.slice(0, 100), value: String(i), description: o.location ? o.location.slice(0, 100) : undefined })),
        { label: 'No preference', value: NO_PREFERENCE },
      );
    modal.addLabelComponents(new LabelBuilder().setLabel('Which option do you prefer?').setStringSelectMenuComponent(select));
  }
  const text = (id, label, placeholder, style = TextInputStyle.Short) =>
    new LabelBuilder()
      .setLabel(label)
      .setTextInputComponent(new TextInputBuilder().setCustomId(id).setStyle(style).setPlaceholder(placeholder).setRequired(false).setMaxLength(300));
  modal.addLabelComponents(
    text('avail', 'When are you free?', 'e.g. Friday after 6'),
    text('budget', 'Budget per person? (optional)', 'e.g. $15'),
    text('diet', 'Dietary needs or allergies? (optional)', 'e.g. vegetarian, nut allergy'),
    text('other', 'Anything else? (optional)', "Anything you'd rather not say in the group", TextInputStyle.Paragraph),
  );
  return modal;
}

export async function handleRoundInteraction(interaction) {
  const [, , action, roundId] = interaction.customId.split(':');
  const round = getRound(roundId);
  const me = round?.invited[interaction.user.id];
  if (!round || !me) return interaction.reply({ content: 'This check-in is no longer active.' });
  if (round.resolved) return interaction.reply({ content: 'The plan is already set. Check the group channel!' });

  if (action === 'answer') return interaction.showModal(answerModal(round));

  if (action === 'decline') {
    me.status = 'declined';
    savePrivateAnswer(round.id, interaction.user.id, { name: me.name, raw: { declined: 'yes' }, constraints: { can_attend: false } });
    saveRound(round);
    await interaction.reply({ content: "No worries, thanks for letting me know. I'll keep that between us. 💙" });
    return afterAnswer(interaction.client, round);
  }

  if (action === 'modal') {
    await interaction.deferReply();
    const field = (id) => {
      try {
        return interaction.fields.getTextInputValue(id).trim();
      } catch {
        return '';
      }
    };
    const choices = round.summary.options.filter((o) => o.kind !== 'time');
    let preference = '';
    try {
      const v = interaction.fields.getStringSelectValues('pref')[0];
      preference = v && v !== NO_PREFERENCE ? choices[Number(v)]?.label ?? '' : 'no preference';
    } catch {}
    const raw = { preference, availability: field('avail'), budget: field('budget'), dietary: field('diet'), other: field('other') };

    try {
      const constraints = await collectConstraints({ person: me.name, answers: raw, summary: round.summary, timezone: config.timezone });
      savePrivateAnswer(round.id, interaction.user.id, { name: me.name, raw, constraints });
      me.status = constraints.can_attend ? 'answered' : 'declined';
      saveRound(round);
      await interaction.editReply({ content: privateAck(constraints) });
    } catch (err) {
      console.error('[round] could not read private answers:', err.message);
      // Keep the raw answers so they still count when the plan is resolved.
      savePrivateAnswer(round.id, interaction.user.id, { name: me.name, raw, constraints: { can_attend: true, raw_answers: raw } });
      me.status = 'answered';
      saveRound(round);
      await interaction.editReply({ content: "Got it, thanks! I saved your answers privately. (Muse Spark hiccuped reading them, but I'll still use them.)" });
    }
    return afterAnswer(interaction.client, round);
  }
}

/** Shown only to the person, in their DM, so they can check what Orbit understood. */
function privateAck(c) {
  const lines = ["Got it, thanks! Here's what I'll keep in mind. **Only you can see this.**"];
  if (!c.can_attend) lines.push("• You can't make it this time");
  if (c.availability) lines.push(`• Free: ${c.availability}`);
  if (c.has_budget_limit) lines.push(`• Budget: up to $${c.max_per_person_usd} per person`);
  if (c.dietary_needs.length) lines.push(`• Food: ${c.dietary_needs.join(', ')}`);
  if (c.preferred_options.length) lines.push(`• Prefers: ${c.preferred_options.join(', ')}`);
  if (c.avoid.length) lines.push(`• Avoid: ${c.avoid.join(', ')}`);
  if (c.other_notes) lines.push(`• Also: ${c.other_notes}`);
  lines.push('', 'Changed your mind? Tap **Answer privately** again.');
  return lines.join('\n');
}

async function afterAnswer(client, round) {
  await refreshStatus(client, round).catch((err) => console.warn('[round] status update failed:', err.message));
  const waiting = Object.values(round.invited).filter((p) => p.status === 'pending');
  if (waiting.length === 0) await resolveRound(client, round).catch((err) => console.error('[round] resolve failed:', err.message));
}

// ─── Resolving ─────────────────────────────────────────────────────────────

/** Muse Spark picks the plan; only the guarded, neutral result is posted to the group. */
export async function resolveRound(client, round) {
  if (round.resolved || round.resolving) return round.plan;
  round.resolving = true;
  try {
    const answers = readPrivate(round.id);
    const people = Object.entries(answers)
      .filter(([id]) => id !== '_rationale')
      .map(([, a]) => ({ name: a.name, constraints: a.constraints, raw: a.raw }));
    const noReply = Object.values(round.invited).filter((p) => p.status === 'pending' || p.status === 'unreachable').map((p) => p.name);

    // Reasoning is hidden on the live screen: it involves private answers.
    bus.emit('thinking', { task: 'resolving the plan', text: '', active: true, private: true });
    const result = await resolvePlan({
      summary: round.summary,
      people,
      noReply,
      publicText: round.transcriptText,
      timezone: config.timezone,
      defaultArea: config.defaultArea,
    }).finally(() => bus.emit('thinking', { active: false }));

    savePrivateRationale(round.id, result.privateRationale);
    if (result.blockedLeaks.length) console.warn(`[round] privacy guard replaced text that mentioned: ${result.blockedLeaks.length} private term(s)`);

    round.plan = result.plan;
    round.publicMessage = result.publicMessage;
    round.resolved = true;
    saveRound(round);
    writeJson(path.join(config.dataDir, 'plans', `${round.id}.json`), { roundId: round.id, plan: result.plan, publicMessage: result.publicMessage });

    const channel = await groupChannel(client);
    const message = await channel.send({ embeds: [planEmbed(result.plan, result.publicMessage)] });
    bus.emit('plan', { plan: result.plan, publicMessage: result.publicMessage });
    console.log(`[round] plan posted: ${result.plan.title}`);
    await addToCalendar(client, round);
    return { plan: result.plan, publicMessage: result.publicMessage, message }; // never the private rationale
  } finally {
    round.resolving = false;
  }
}

// ─── Google Calendar ───────────────────────────────────────────────────────

/** Create the event, email invites to everyone coming who linked an email, and confirm in the group. */
export async function addToCalendar(client, round) {
  if (!round.plan?.feasible || round.calendar) return round.calendar ?? null;
  round.members ??= []; // rounds saved before calendar support
  const channel = await groupChannel(client);
  if (!isCalendarConnected()) {
    await channel.send({ embeds: [calendarEmbed({ error: "Google Calendar isn't connected yet. Run `npm run google:auth`, then `/resolve`." })] });
    return null;
  }

  // Who's coming: the names Muse Spark chose, matched to crew members (everyone not declined as a fallback).
  const wanted = new Set(round.plan.attendees.map((n) => n.toLowerCase()));
  const declined = new Set(Object.entries(round.invited).filter(([, p]) => p.status === 'declined').map(([id]) => id));
  let going = round.members.filter((m) => wanted.has(m.name.toLowerCase()));
  if (!going.length) going = round.members.filter((m) => !declined.has(m.id));
  const attendees = going.map((m) => ({ name: m.name, email: getPerson(m.id)?.email })).filter((a) => a.email);
  const memberNames = new Set(round.members.map((m) => m.name.toLowerCase()));
  const noEmail = [
    ...going.filter((m) => !getPerson(m.id)?.email).map((m) => m.name),
    ...round.plan.attendees.filter((n) => !memberNames.has(n.toLowerCase())),
  ];

  try {
    const event = await createEvent({
      plan: round.plan,
      attendees,
      description: `${round.publicMessage}\n\nPlanned with Orbit from your group call · powered by Meta Muse (Voice Transcribe + Spark).`,
      timezone: config.timezone,
    });
    round.calendar = { eventId: event.eventId, htmlLink: event.htmlLink, invited: event.invited, noEmail };
    saveRound(round);
    await channel.send({ embeds: [calendarEmbed(round.calendar)] });
    bus.emit('plan', { plan: round.plan, publicMessage: round.publicMessage, calendar: round.calendar });
    console.log(`[calendar] event created, invites sent to ${event.invited.length} people`);
    return round.calendar;
  } catch (err) {
    console.error('[calendar] failed:', err.message);
    await channel.send({ embeds: [calendarEmbed({ error: `${err.message} Fix it, then use \`/resolve\` to try again.` })] });
    return null;
  }
}
