import fs from 'node:fs';
import http from 'node:http';
import { bus } from './bus.js';

// The live "Orbit is thinking" screen: one HTML page + a Server-Sent Events stream.
// Bound to localhost only. It shows what happens in the call, never private DM content.
const PAGE = fs.readFileSync(new URL('./public/index.html', import.meta.url));
const MAX_MUSE_LOG = 60;

const clients = new Set();
const snapshot = { session: null, partials: {}, finals: [], muse: [], insights: null, thinking: null, round: null, plan: null };

function broadcast(type, data) {
  const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(frame);
}

bus.on('session', (s) => {
  if (s.state === 'listening' && snapshot.session?.startedAt !== s.startedAt) {
    snapshot.finals = [];
    snapshot.partials = {};
    snapshot.insights = null;
    snapshot.round = null;
    snapshot.plan = null;
  }
  snapshot.session = s;
  broadcast('session', s);
});
bus.on('partial', (p) => {
  snapshot.partials[p.userId] = p;
  broadcast('partial', p);
});
bus.on('partial-clear', (p) => {
  delete snapshot.partials[p.userId];
  broadcast('partial-clear', p);
});
bus.on('final', (entry) => {
  snapshot.finals.push(entry);
  broadcast('final', entry);
});
bus.on('insights', (i) => {
  snapshot.insights = i;
  broadcast('insights', i);
});
// Round = names + replied/waiting only. Plan = the guarded public plan. No private answers exist on this bus.
bus.on('round', (r) => {
  snapshot.round = r;
  broadcast('round', r);
});
bus.on('plan', (p) => {
  snapshot.plan = p;
  broadcast('plan', p);
});
bus.on('thinking', (t) => {
  snapshot.thinking = t.active ? t : null;
  broadcast('thinking', t);
});
bus.on('muse', (call) => {
  snapshot.muse.push(call);
  if (snapshot.muse.length > MAX_MUSE_LOG) snapshot.muse.shift();
  broadcast('muse', call);
});

export function startDashboard(port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }
    res.writeHead(404).end();
  });

  // Keep idle connections alive through proxies and sleepy laptops.
  setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 15_000).unref();

  server.on('error', (err) => console.error(`[dashboard] could not start on port ${port}: ${err.message}`));
  server.listen(port, '127.0.0.1', () => console.log(`[dashboard] live screen at http://localhost:${port}`));
}
