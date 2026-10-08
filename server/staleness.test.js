import test from 'node:test';
import assert from 'node:assert/strict';
import { findStale, daysSetting, DAY_MS } from './staleness.js';

const NOW = Date.UTC(2026, 9, 8);
const ago = (d) => NOW - d * DAY_MS;
const run = (graph, extra = {}) => findStale({ graph, now: NOW, taskDays: 14, sessionDays: 4, ...extra });
const ids = (out) => out.map((o) => `${o.kind}:${o.id}`);

test('a session quiet past the threshold is asked about, with a reason', () => {
  const out = run({ sessions: [
    { sessionId: 'old', label: 'Old work', lastActivity: ago(5), status: 'idle' },
    { sessionId: 'new', lastActivity: ago(3), status: 'idle' },
  ] });
  assert.deepEqual(ids(out), ['session:old']);
  assert.equal(out[0].label, 'Old work');
  assert.match(out[0].reason, /for 5 days/);
});

test('a session in a task carries the task name; one outside a task does not', () => {
  const out = run({
    sessions: [
      { sessionId: 'in', lastActivity: ago(5), status: 'idle' },
      { sessionId: 'out', lastActivity: ago(5), status: 'idle' },
    ],
    tasks: { tasks: [{ id: 't1', name: 'Billing' }], assignments: { in: 't1' } },
  }, { createdAtOf: () => NOW });
  const byId = Object.fromEntries(out.filter((o) => o.kind === 'session').map((o) => [o.id, o.task]));
  assert.deepEqual(byId, { in: 'Billing', out: null });
});

test('working, background-shell and snoozed sessions are skipped', () => {
  const out = run({ sessions: [
    { sessionId: 'w', lastActivity: ago(9), status: 'working' },
    { sessionId: 'b', lastActivity: ago(9), status: 'idle', hasBackgroundShell: true },
    { sessionId: 'z', lastActivity: ago(9), status: 'idle', snooze: { until: NOW + 1000 } },
    { sessionId: 'fired', lastActivity: ago(9), status: 'idle', snooze: { until: NOW - 1000 } },
  ] });
  assert.deepEqual(ids(out), ['session:fired']);
});

test('a nested child keeps its top-level card fresh and is never asked about itself', () => {
  const out = run({ sessions: [
    { sessionId: 'p', lastActivity: ago(9), status: 'idle' },
    { sessionId: 'c', parentSession: 'p', lastActivity: ago(1), status: 'idle' },
    { sessionId: 'p2', lastActivity: ago(9), status: 'idle' },
    { sessionId: 'c2', parentSession: 'p2', lastActivity: ago(8), status: 'idle' },
  ] });
  assert.deepEqual(ids(out), ['session:p2']);
});

test('createdAt counts when there is no activity yet; no timestamps at all is skipped', () => {
  const out = run({ sessions: [
    { sessionId: 'a', createdAt: ago(6), lastActivity: null, status: 'idle' },
    { sessionId: 'b', createdAt: ago(1), lastActivity: null, status: 'idle' },
    { sessionId: 'c', status: 'idle' },
  ] });
  assert.deepEqual(ids(out), ['session:a']);
});

test('Keep restarts the clock', () => {
  const graph = { sessions: [{ sessionId: 'a', lastActivity: ago(20), status: 'idle' }] };
  assert.deepEqual(ids(run(graph, { dismissed: { 'session:a': ago(3) } })), []);
  assert.deepEqual(ids(run(graph, { dismissed: { 'session:a': ago(4) } })), ['session:a']);
});

test('a task is stale when its newest session, archived ones included, started past the threshold', () => {
  const created = { s1: ago(30), s2: ago(15), s3: ago(2) };
  const graph = {
    sessions: [],
    tasks: {
      tasks: [{ id: 't1', name: 'Old' }, { id: 't2', name: 'Busy' }, { id: 't3', name: 'Gone', archivedAt: ago(1) }],
      assignments: { s1: 't1', s2: 't1', s3: 't2' },
    },
  };
  const out = run(graph, { createdAtOf: (sid) => created[sid] ?? null });
  assert.deepEqual(ids(out), ['task:t1']);
  assert.match(out[0].reason, /for 15 days/);
});

test('an empty task falls back to when it was first seen, but first-seen never shields a task with sessions', () => {
  const graph = { sessions: [], tasks: { tasks: [{ id: 'e', name: 'Empty' }, { id: 'f', name: 'Full' }], assignments: { s: 'f' } } };
  const firstSeen = { e: ago(14), f: ago(0) };
  const out = run(graph, { firstSeen, createdAtOf: () => ago(20) });
  assert.deepEqual(ids(out), ['task:e', 'task:f']);
  assert.match(out[0].reason, /since it appeared on the board/);
  assert.deepEqual(ids(run(graph, { firstSeen: {}, createdAtOf: () => null })), []);
});

test('the thresholds come from settings, with defaults for anything unusable', () => {
  assert.equal(daysSetting(7, 4), 7);
  for (const bad of [undefined, null, 0, -1, NaN, '7']) assert.equal(daysSetting(bad, 4), 4);
  const graph = { sessions: [{ sessionId: 'a', lastActivity: ago(2), status: 'idle' }] };
  assert.deepEqual(ids(run(graph, { sessionDays: 1 })), ['session:a']);
});
