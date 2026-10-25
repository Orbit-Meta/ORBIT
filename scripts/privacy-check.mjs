// ─────────────────────────────────────────────────────────────────────────────
// Privacy check: proves private DM answers never reach a group channel or the live screen.
//
//   npm run test:privacy
//
// Runs the REAL planning-round code (src/plan/round.js) and REAL Muse Spark calls, with a
// fake Discord client that records every message. People give distinctive private answers
// ("canaries"); then every group message, edit, live-screen event, and the public plan file
// are searched for them. Uses a throwaway data folder, so your real data is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.ORBIT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-privacy-'));
process.env.DM_EVERYONE = 'true';
const { config, requireEnv } = await import('../src/config.js');
requireEnv('MODEL_API_KEY');
const { bus } = await import('../src/dashboard/bus.js');
const { startRound, handleRoundInteraction, getRound } = await import('../src/plan/round.js');
const { privateTerms, findLeaks } = await import('../src/core/privacyGuard.js');

// ── A call where Sam and Riley planned Friday dinner; Angel and Jordan weren't there ──
const transcriptText = [
  "[18:01:02] Sam: Let's do dinner this Friday. Chipotle downtown or the sushi place on Main?",
  '[18:01:09] Riley: Either works for me. Friday evening is good.',
  "[18:01:15] Sam: Cool, I'm free after six. Angel and Jordan weren't on the call though.",
].join('\n');
const summary = {
  headline: 'Friday dinner: Chipotle or sushi',
  event_type: 'dinner',
  proposed_day: { label: 'this Friday', date: '2026-10-30' },
  people: [
    { name: 'Sam', in_call: true, availability: 'Friday after 6', notes: '' },
    { name: 'Riley', in_call: true, availability: 'Friday evening', notes: '' },
    { name: 'Angel', in_call: false, availability: '', notes: '' },
    { name: 'Jordan', in_call: false, availability: '', notes: '' },
  ],
  options: [
    { label: 'Chipotle', kind: 'place', location: 'downtown', supporters: ['Sam'], notes: '' },
    { label: 'Sushi place', kind: 'place', location: 'Main St', supporters: ['Sam'], notes: '' },
  ],
  decisions: ['Dinner this Friday'],
  open_questions: ['Chipotle or sushi?', 'What time?'],
  needs_input_from: ['Angel', 'Jordan'],
};
const people = { sam: 'Sam', riley: 'Riley', angel: 'Angel', jordan: 'Jordan' };

// Private answers. Sushi (option 1) is ruled out by Angel's allergy and the budgets.
const answers = {
  sam: { pref: '__none__', avail: 'after 6 friday', budget: '', diet: '', other: '' },
  riley: { pref: '1', avail: 'friday 6 to 9', budget: '$11 tops', diet: 'vegetarian', other: "saving up for my brother's surgery so keep it cheap" },
  angel: { pref: '0', avail: 'Friday after 6:30', budget: '$13 max, rent is due', diet: 'severe sesame allergy', other: 'landlord inspection friday morning, please keep that quiet' },
};
const CANARIES = ['sesame', 'allerg', 'landlord', 'inspection', 'rent is due', 'vegetarian', 'brother', 'surgery', '$13', '$11', '13 max', '11 tops', 'declin', "can't make it"];

// ── Fake Discord client that records everything ──
const groupLog = []; // every group channel send/edit
const dmLog = []; // every DM, by recipient
const busLog = []; // every live-screen event
for (const evt of ['session', 'partial', 'partial-clear', 'final', 'muse', 'insights', 'thinking', 'round', 'plan']) {
  bus.on(evt, (data) => busLog.push({ evt, json: JSON.stringify(data) }));
}
const serialize = (p) => JSON.stringify({ content: p.content ?? null, embeds: (p.embeds ?? []).map((e) => (e.toJSON ? e.toJSON() : e)) });
const statusMsg = { id: 'status-1', edit: async (p) => groupLog.push({ kind: 'edit', json: serialize(p) }) };
const group = {
  id: 'group',
  name: 'general',
  isTextBased: () => true,
  send: async (p) => (groupLog.push({ kind: 'send', json: serialize(p) }), statusMsg),
  messages: { fetch: async () => statusMsg },
};
const client = {
  channels: { fetch: async () => group },
  users: { fetch: async (id) => ({ id, send: async (p) => dmLog.push({ to: id, json: serialize(p) }) }) },
};

function interaction(userId, customId, a) {
  const reply = async (p) => dmLog.push({ to: userId, json: serialize(typeof p === 'string' ? { content: p } : p) });
  return {
    customId,
    user: { id: userId },
    client,
    fields: { getTextInputValue: (k) => a?.[k] ?? '', getStringSelectValues: () => [a?.pref ?? '__none__'] },
    deferReply: async () => {},
    editReply: reply,
    reply,
    showModal: async () => {},
  };
}

// ── Run the real flow ──
console.log('Starting a planning round (real code, fake Discord)…');
const call = {
  id: 'privacy-check',
  summary,
  transcriptText,
  inCall: [{ id: 'sam', name: 'Sam' }, { id: 'riley', name: 'Riley' }],
  absent: [{ id: 'angel', name: 'Angel' }, { id: 'jordan', name: 'Jordan' }],
};
await startRound(client, 'guild-1', call);
for (const id of ['sam', 'riley', 'angel']) {
  console.log(`  ${people[id]} answers privately (Muse Spark reads it)…`);
  await handleRoundInteraction(interaction(id, 'orbit:round:modal:privacy-check', answers[id]));
}
console.log("  Jordan taps \"I can't make it\" → last reply → Muse Spark resolves the plan…");
await handleRoundInteraction(interaction('jordan', 'orbit:round:decline:privacy-check'));

// ── Check every public surface ──
const planFile = fs.readFileSync(path.join(config.dataDir, 'plans', 'privacy-check.json'), 'utf8');
const surfaces = {
  'group channel messages + edits': groupLog.map((g) => g.json).join('\n'),
  'live screen (all bus events)': busLog.map((b) => b.json).join('\n'),
  'public plan file (data/plans)': planFile,
};
let failed = false;
console.log('\nSearching public surfaces for private canaries:');
for (const [name, text] of Object.entries(surfaces)) {
  const hits = CANARIES.filter((c) => text.toLowerCase().includes(c.toLowerCase()));
  console.log(`  ${hits.length ? '❌ LEAK' : '✅ clean'}  ${name} (${text.length} chars)${hits.length ? ` → ${hits.join(', ')}` : ''}`);
  if (hits.length) failed = true;
}

// Sanity: the canaries really were collected privately (otherwise "clean" proves nothing).
const privateFile = fs.readFileSync(path.join(config.dataDir, 'private', 'privacy-check.json'), 'utf8').toLowerCase();
const stored = ['sesame', 'landlord', 'vegetarian', 'surgery', '13', '11'].filter((c) => privateFile.includes(c));
console.log(`\n  ${stored.length === 6 ? '✅' : '❌'} private store holds the answers (${stored.length}/6 canaries found in data/private)`);
if (stored.length !== 6) failed = true;
const angelDMs = dmLog.filter((d) => d.to === 'angel').map((d) => d.json).join('\n').toLowerCase();
const othersSeeAngel = dmLog.filter((d) => d.to !== 'angel').some((d) => /sesame|landlord/i.test(d.json));
console.log(`  ${angelDMs.includes('sesame') ? '✅' : '❌'} Angel's own DM confirms their answers back to them only`);
console.log(`  ${othersSeeAngel ? '❌' : '✅'} no one else's DM contains Angel's answers`);
if (!angelDMs.includes('sesame') || othersSeeAngel) failed = true;

// The guard itself: a message that leaks must be caught.
const terms = privateTerms(Object.values(answers).flatMap(Object.values), transcriptText);
const caught = findLeaks("Chipotle it is since it's under $13 and sesame-free!", terms);
console.log(`  ${caught.length ? '✅' : '❌'} leak guard catches a leaky message (${caught.join(', ')})`);
if (!caught.length) failed = true;

const round = getRound('privacy-check');
console.log('\nWhat the group saw:');
console.log(`  Status: ${round.invited ? Object.values(round.invited).map((p) => `${p.name}=${p.status === 'declined' ? 'replied' : p.status === 'answered' ? 'replied' : p.status}`).join(', ') : ''}`);
console.log(`  Plan:   ${round.plan.title} · ${round.plan.location} · ${round.plan.date} ${round.plan.start_time}–${round.plan.end_time}`);
console.log(`  Message: "${round.publicMessage}"`);
console.log(`\n${failed ? '❌ PRIVACY CHECK FAILED' : '✅ PRIVACY CHECK PASSED: private answers never reached a group channel or the live screen.'}`);
fs.rmSync(config.dataDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
