import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrompter, dialogFor } from './index.js';

const tick = () => new Promise((r) => setImmediate(r));

function setup(answers) {
  const sent = [];
  const shown = [];
  const api = {
    send: (f) => sent.push(f),
    ui: { confirm: async (o) => { shown.push(o.title); return answers.shift(); } },
  };
  const doc = { visibilityState: 'visible' };
  return { sent, shown, doc, p: createPrompter({ api, doc }) };
}

const items = [
  { kind: 'task', id: 't1', label: 'T', reason: 'r' },
  { kind: 'session', id: 's1', label: 'S', reason: 'r' },
];

test('asks one question at a time and sends each answer', async () => {
  const { sent, shown, p } = setup([true, false]);
  p.onItems(items);
  p.onItems(items);
  await tick(); await tick();
  assert.deepEqual(shown, ['Archive this task?', 'Archive this session?']);
  assert.deepEqual(sent, [
    { type: 'stale-archive-answer', kind: 'task', id: 't1', archive: true },
    { type: 'stale-archive-answer', kind: 'session', id: 's1', archive: false },
  ]);
});

test('waits while the tab is hidden', async () => {
  const { shown, doc, p } = setup([false]);
  doc.visibilityState = 'hidden';
  p.onItems(items.slice(0, 1));
  await tick();
  assert.deepEqual(shown, []);
  doc.visibilityState = 'visible';
  p.maybeAsk();
  await tick();
  assert.equal(shown.length, 1);
});

test('the dialog names the item and gives the reason', () => {
  const d = dialogFor({ kind: 'session', label: 'Fix bug', reason: 'Quiet for 5 days.' });
  assert.equal(d.okLabel, 'Archive session');
  assert.equal(d.cancelLabel, 'Keep');
  assert.match(d.body, /Fix bug[\s\S]*Quiet for 5 days\./);
});
