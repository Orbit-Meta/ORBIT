import path from 'node:path';
import { config } from '../config.js';
import { readJson, writeJson } from './jsonFile.js';

// The crew: everyone who registered via the "Join Orbit" button or /link-email.
// Shape: { [discordUserId]: { name, email, linkedAt } }
// Emails are private: they are only used for calendar invites and never posted to a channel.
const FILE = path.join(config.dataDir, 'people.json');

export function listPeople() {
  return Object.entries(readJson(FILE, {})).map(([id, p]) => ({ id, ...p }));
}

export function getPerson(id) {
  const p = readJson(FILE, {})[id];
  return p ? { id, ...p } : null;
}

export function upsertPerson(id, { name, email }) {
  const all = readJson(FILE, {});
  all[id] = { name, email, linkedAt: new Date().toISOString() };
  writeJson(FILE, all);
  return { id, ...all[id] };
}

/** Keep the stored name in sync with the person's current server nickname. */
export function renamePerson(id, name) {
  const all = readJson(FILE, {});
  if (!all[id] || all[id].name === name) return;
  all[id].name = name;
  writeJson(FILE, all);
}

export function removePerson(id) {
  const all = readJson(FILE, {});
  const existed = id in all;
  delete all[id];
  writeJson(FILE, all);
  return existed;
}
