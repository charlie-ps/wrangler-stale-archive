import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StaleStore } from './store.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stale-archive-')), 'stale-archive.json');

test('first sightings and dismissals survive a reload', () => {
  const file = tmpFile();
  const s = new StaleStore({ file });
  s.noteTasks(['t1'], 100);
  s.noteTasks(['t1', 't2'], 200);
  s.dismiss('session:a', 300);
  const r = new StaleStore({ file });
  assert.deepEqual(r.firstSeen, { t1: 100, t2: 200 });
  assert.deepEqual(r.dismissed, { 'session:a': 300 });
});

test('a task that is gone is forgotten; forget drops a dismissal', () => {
  const s = new StaleStore({ file: tmpFile() });
  s.noteTasks(['t1', 't2'], 1);
  s.noteTasks(['t2'], 2);
  assert.deepEqual(s.firstSeen, { t2: 1 });
  s.dismiss('task:t2', 3);
  s.forget('task:t2');
  assert.deepEqual(s.dismissed, {});
});

test('an unreadable file starts empty', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{not json');
  const s = new StaleStore({ file });
  assert.deepEqual([s.firstSeen, s.dismissed], [{}, {}]);
});
