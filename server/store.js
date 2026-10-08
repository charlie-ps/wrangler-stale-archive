import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The wrangler hands a store factory no data dir, so this resolves the same one
// the wrangler uses (AW_DATA_DIR, else ~/.agent-wrangler).
export function defaultFile() {
  const dataDir = process.env.AW_DATA_DIR || path.join(os.homedir(), '.agent-wrangler');
  return path.join(dataDir, 'stale-archive.json');
}

// firstSeen: taskId -> ms, dismissed: `kind:id` -> ms. Whole-file atomic
// replace on every change; both maps stay small.
export class StaleStore {
  constructor({ file = defaultFile() } = {}) {
    this.file = file;
    this.firstSeen = {};
    this.dismissed = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed?.firstSeen && typeof parsed.firstSeen === 'object') this.firstSeen = parsed.firstSeen;
      if (parsed?.dismissed && typeof parsed.dismissed === 'object') this.dismissed = parsed.dismissed;
    } catch { /* missing or unreadable: start empty */ }
  }

  // Record a first sighting for every task id not seen before, and forget ids
  // that are gone. Writes only when something changed.
  noteTasks(taskIds, now = Date.now()) {
    let changed = false;
    const live = new Set(taskIds);
    for (const id of live) if (!(id in this.firstSeen)) { this.firstSeen[id] = now; changed = true; }
    for (const id of Object.keys(this.firstSeen)) if (!live.has(id)) { delete this.firstSeen[id]; changed = true; }
    if (changed) this.save();
  }

  dismiss(key, now = Date.now()) {
    this.dismissed[key] = now;
    this.save();
  }

  forget(key) {
    if (!(key in this.dismissed)) return;
    delete this.dismissed[key];
    this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ firstSeen: this.firstSeen, dismissed: this.dismissed }, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
