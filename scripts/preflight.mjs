// Pre-demo checklist:  npm run check
// Verifies every credential and connection Orbit needs, without making any AI calls.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const results = [];
const ok = (name, detail) => results.push(['✅', name, detail]);
const warn = (name, detail) => results.push(['⚠️ ', name, detail]);
const fail = (name, detail) => results.push(['❌', name, detail]);

let config;
try {
  ({ config } = await import('../src/config.js'));
  ok('.env', `loaded · time zone ${config.timezone}`);
} catch (err) {
  fail('.env', err.message);
  print();
  process.exit(1);
}

// ── Meta Model API (no AI call: just lists the models this key can use) ──
if (!config.muse.apiKey) fail('Meta Muse API key', 'MODEL_API_KEY is empty');
else {
  try {
    const res = await fetch(`${config.muse.baseUrl}/models`, { headers: { Authorization: `Bearer ${config.muse.apiKey}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    const json = await res.json();
    const ids = (json.data ?? json.models ?? []).map((m) => m.id ?? m.name);
    for (const model of [config.muse.sparkModel, config.muse.transcribeModel]) {
      if (ids.length && !ids.includes(model)) warn(`Muse model ${model}`, `not in this key's model list (${ids.slice(0, 6).join(', ')}…)`);
      else ok(`Muse model ${model}`, 'available');
    }
  } catch (err) {
    fail('Meta Muse API', err.message);
  }
}

// ── Discord ──
const discord = async (route) => {
  const res = await fetch(`https://discord.com/api/v10${route}`, { headers: { Authorization: `Bot ${config.discord.token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.json().catch(() => ({}))).message ?? ''}`);
  return res.json();
};
try {
  const me = await discord('/users/@me');
  ok('Discord bot', `${me.username} (token valid)`);
  try {
    const guild = await discord(`/guilds/${config.discord.guildId}`);
    ok('Discord server', `"${guild.name}"`);
  } catch (err) {
    fail('Discord server', `bot isn't in DISCORD_GUILD_ID (${err.message}). Invite it: https://discord.com/oauth2/authorize?client_id=${config.discord.clientId}&scope=bot+applications.commands&permissions=3165184`);
  }
  try {
    const channel = await discord(`/channels/${config.discord.recapChannelId}`);
    ok('Recap channel', `#${channel.name}`);
  } catch (err) {
    fail('Recap channel', `DISCORD_RECAP_CHANNEL_ID can't be read (${err.message})`);
  }
} catch (err) {
  fail('Discord bot', `DISCORD_TOKEN rejected (${err.message})`);
}

// ── Google Calendar ──
try {
  const { isCalendarConnected, storedToken } = await import('../src/google/auth.js');
  const { getCalendar } = await import('../src/google/calendar.js');
  if (!config.google.clientId || !config.google.clientSecret) warn('Google Calendar', 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set: plans won\'t go on the calendar');
  else if (!isCalendarConnected()) warn('Google Calendar', 'not signed in: run `npm run google:auth`');
  else {
    const cal = await getCalendar();
    const token = storedToken();
    const days = token.obtainedAt ? (Date.now() - new Date(token.obtainedAt)) / 86_400_000 : 0;
    const detail = `"${cal.summary}" as ${token.email}`;
    if (days > 5) warn('Google Calendar', `${detail}, but signed in ${days.toFixed(1)} days ago: testing-mode sign-ins expire after 7 days, so re-run \`npm run google:auth\``);
    else ok('Google Calendar', detail);
  }
} catch (err) {
  fail('Google Calendar', err.message);
}

// ── Local pieces ──
const modelDir = path.join(config.dataDir, 'models');
const cached = fs.existsSync(modelDir) && fs.readdirSync(modelDir, { recursive: true }).some((f) => String(f).endsWith('.onnx'));
cached ? ok('Meta MMS-TTS model', 'cached locally') : warn('Meta MMS-TTS model', 'not downloaded yet: the first `npm start` downloads it (~10 s)');

const { listPeople } = await import('../src/store/people.js');
const crew = listPeople();
if (crew.length >= 2) ok('Orbit crew', `${crew.length} people registered: ${crew.map((p) => p.name).join(', ')}`);
else warn('Orbit crew', `${crew.length} registered. Everyone should click Join Orbit (\`/orbit-setup\`) or run \`/link-email\` so they get DMs and invites`);

try {
  const script = JSON.parse(fs.readFileSync(new URL('../demo/script.json', import.meta.url), 'utf8'));
  ok('Demo script', `${script.lines.length} lines (\`/demo\`)`);
} catch (err) {
  fail('Demo script', `demo/script.json: ${err.message}`);
}
const wavPath = new URL('../demo/call.wav', import.meta.url);
if (fs.existsSync(wavPath)) {
  const b = fs.readFileSync(wavPath);
  const good = b.toString('ascii', 0, 4) === 'RIFF' && b.readUInt16LE(22) === 1 && [16000, 24000].includes(b.readUInt32LE(24));
  good ? ok('Demo recording', `demo/call.wav (${(b.length / 48_000).toFixed(0)} s)`) : warn('Demo recording', 'demo/call.wav must be mono 16/24 kHz WAV (see README)');
} else ok('Demo recording', 'none (optional: `/demo mode:file` needs demo/call.wav)');

await new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', () => (warn('Live screen port', `${config.dashboardPort} is in use (is the bot already running?)`), resolve()));
  srv.listen(config.dashboardPort, '127.0.0.1', () => srv.close(() => (ok('Live screen port', `${config.dashboardPort} free → http://localhost:${config.dashboardPort}`), resolve())));
});

print();
process.exit(results.some(([s]) => s === '❌') ? 1 : 0);

function print() {
  console.log('\nOrbit preflight\n');
  for (const [s, name, detail] of results) console.log(`${s} ${name.padEnd(36)} ${detail}`);
  const fails = results.filter(([s]) => s === '❌').length;
  const warns = results.filter(([s]) => s.startsWith('⚠')).length;
  console.log(`\n${fails ? `❌ ${fails} problem(s) to fix before the demo.` : warns ? `Ready, with ${warns} warning(s).` : '✅ All set for the demo.'}`);
}
