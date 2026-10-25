// One-time Google sign-in for the organizer account:  npm run google:auth
// Opens your browser, catches Google's redirect on a temporary local port, and saves
// the refresh token to data/google-token.json (gitignored).
import http from 'node:http';
import { exec } from 'node:child_process';
const { config, requireEnv } = await import('../src/config.js');
const { buildAuthRequest, exchangeCode } = await import('../src/google/auth.js');
const { getCalendar } = await import('../src/google/calendar.js');

requireEnv('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET');

const server = http.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const redirectUri = `http://127.0.0.1:${server.address().port}`;
const { url, verifier, state } = buildAuthRequest(redirectUri);

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><title>Orbit</title><body style="font:16px system-ui;background:#0b0d12;color:#e8ebf2;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>${title}</h1><p>${body}</p></div>`;

const result = new Promise((resolve, reject) => {
  server.on('request', async (req, res) => {
    const params = new URL(req.url, redirectUri).searchParams;
    if (!params.has('code') && !params.has('error')) return res.writeHead(404).end();
    try {
      if (params.get('error')) throw new Error(`Google said: ${params.get('error')}`);
      if (params.get('state') !== state) throw new Error('State mismatch, please try again.');
      const saved = await exchangeCode({ code: params.get('code'), verifier, redirectUri });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page('🪐 Orbit is connected', `Calendar access granted for <b>${saved.email}</b>. You can close this tab.`));
      resolve(saved);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(page('Sign-in failed', err.message));
      reject(err);
    }
  });
});

console.log('\nOpening Google sign-in in your browser. Sign in with the ORGANIZER Gmail account.');
console.log(`If it doesn't open, paste this link into your browser:\n\n${url}\n`);
if (process.platform === 'win32') exec(`start "" "${url}"`);
else exec(`${process.platform === 'darwin' ? 'open' : 'xdg-open'} "${url}"`);

try {
  const saved = await result;
  const cal = await getCalendar();
  console.log(`✅ Connected as ${saved.email}. Orbit will add events to the calendar "${cal.summary}" (${config.google.calendarId}).`);
  console.log(`   Token saved to ${saved.file}`);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
} finally {
  server.close();
}
