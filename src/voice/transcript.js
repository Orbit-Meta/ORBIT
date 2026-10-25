import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { writeJson } from '../store/jsonFile.js';

const DIR = path.join(config.dataDir, 'transcripts');

/** Speaker-labeled call transcript, saved after every line to data/transcripts/<id>.{json,txt}. */
export class Transcript {
  constructor(startedAt = new Date()) {
    this.id = startedAt.toISOString().replace(/[:.]/g, '-');
    this.startedAt = startedAt.toISOString();
    this.entries = [];
    this.jsonFile = path.join(DIR, `${this.id}.json`);
    this.txtFile = path.join(DIR, `${this.id}.txt`);
  }

  /** Entries are kept in order of when people started speaking (overlaps resolve correctly). */
  add(entry) {
    const i = this.entries.findIndex((e) => e.startedAt > entry.startedAt);
    this.entries.splice(i === -1 ? this.entries.length : i, 0, entry);
    this.save();
    return entry;
  }

  toText() {
    const time = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: config.timezone, hour12: false });
    return this.entries.map((e) => `[${time(e.startedAt)}] ${e.speaker}: ${e.text}`).join('\n');
  }

  save() {
    writeJson(this.jsonFile, { id: this.id, startedAt: this.startedAt, entries: this.entries });
    fs.writeFileSync(this.txtFile, this.toText() + '\n');
  }
}
