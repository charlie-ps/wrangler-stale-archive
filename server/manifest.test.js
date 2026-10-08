import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import manifest, { refresh, answer } from './manifest.js';
import { StaleStore } from './store.js';
import { DAY_MS } from './staleness.js';

const NOW = Date.UTC(2026, 9, 8);

function fakeHost(settings = {}) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stale-archive-')), 'state.json');
  const calls = { broadcast: [], archivedSessions: [], archivedTasks: [] };
  return {
    calls,
    stores: { state: new StaleStore({ file }) },
    settings: { get: (k) => settings[k] },
    sessions: { get: () => null, archive: async (id) => { calls.archivedSessions.push(id); } },
    tasks: { archive: async (id) => { calls.archivedTasks.push(id); } },
    broadcast: (p) => calls.broadcast.push(p),
    log: () => {},
  };
}

const graph = {
  sessions: [{ sessionId: 's1', label: 'Old', lastActivity: NOW - 5 * DAY_MS, status: 'idle' }],
  tasks: { tasks: [], assignments: {} },
};

test('refresh broadcasts the open questions from the last graph', () => {
  manifest.graph({ graph });
  const host = fakeHost();
  refresh(host, NOW);
  assert.deepEqual(host.calls.broadcast.at(-1).items.map((i) => i.id), ['s1']);
  const tight = fakeHost({ sessionDays: 10 });
  refresh(tight, NOW);
  assert.deepEqual(tight.calls.broadcast.at(-1).items, []);
});

test('Archive archives an open question; a stale answer for anything else does nothing', async () => {
  manifest.graph({ graph });
  const host = fakeHost();
  refresh(host, NOW);
  await answer({ kind: 'session', id: 'nope', archive: true }, host, NOW);
  await answer({ kind: 'task', id: 's1', archive: true }, host, NOW);
  assert.deepEqual(host.calls.archivedSessions, []);
  await answer({ kind: 'session', id: 's1', archive: true }, host, NOW);
  assert.deepEqual(host.calls.archivedSessions, ['s1']);
});

test('Keep records a dismissal, so the next refresh does not ask again', async () => {
  manifest.graph({ graph });
  const host = fakeHost();
  refresh(host, NOW);
  await answer({ kind: 'session', id: 's1', archive: false }, host, NOW);
  assert.equal(host.stores.state.dismissed['session:s1'], NOW);
  assert.deepEqual(host.calls.broadcast.at(-1).items, []);
  assert.deepEqual(host.calls.archivedSessions, []);
});

test('package.json declares exactly what the manifest requires', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.wranglerExtension.id, manifest.id);
  assert.deepEqual(pkg.wranglerExtension.requires, manifest.requires);
});
