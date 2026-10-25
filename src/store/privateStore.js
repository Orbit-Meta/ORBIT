// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE answers from DMs (availability, budget, dietary needs, notes).
//
// Only src/plan/round.js may import this module. Nothing that posts to a group
// channel or the live screen reads it. scripts/privacy-check.mjs proves it.
// ─────────────────────────────────────────────────────────────────────────────
import path from 'node:path';
import { config } from '../config.js';
import { readJson, writeJson } from './jsonFile.js';

const DIR = path.join(config.dataDir, 'private');
const fileFor = (roundId) => path.join(DIR, `${roundId}.json`);

/** @returns {{ [userId]: { name, raw, constraints, answeredAt } }} */
export function readPrivate(roundId) {
  return readJson(fileFor(roundId), {});
}

export function savePrivateAnswer(roundId, userId, record) {
  const all = readPrivate(roundId);
  all[userId] = { ...record, answeredAt: new Date().toISOString() };
  writeJson(fileFor(roundId), all);
}

/** Muse Spark's reasoning for the plan mentions constraints, so it is kept here too. */
export function savePrivateRationale(roundId, rationale) {
  const all = readPrivate(roundId);
  all._rationale = rationale;
  writeJson(fileFor(roundId), all);
}
