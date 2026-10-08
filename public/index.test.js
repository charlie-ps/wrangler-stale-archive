import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, cardFor, MAX_VISIBLE } from './index.js';

const tick = () => new Promise((r) => setImmediate(r));

// A stand-in for the board's stack: each raised card waits for answer(id, x).
function setup() {
  const sent = [];
  const cards = new Map();
  const withdrawn = [];
  const api = {
    send: (f) => sent.push(f),
    ui: {
      notify: (c) => new Promise((resolve) => cards.set(c.id, { card: c, resolve })),
      withdraw: (id) => { withdrawn.push(id); cards.get(id)?.resolve(null); cards.delete(id); },
    },
  };
  const answer = async (id, x) => { const c = cards.get(id); cards.delete(id); c.resolve(x); await tick(); };
  return { sent, cards, withdrawn, answer, n: createNotifier({ api }) };
}

const item = (kind, id) => ({ kind, id, label: id.toUpperCase(), reason: `${id} is old` });

test('raises up to MAX_VISIBLE cards at once and the next as one is answered', async () => {
  const { cards, answer, sent, n } = setup();
  const items = ['a', 'b', 'c', 'd'].map((id) => item('session', id));
  n.onItems(items);
  n.onItems(items);
  assert.deepEqual([...cards.keys()], ['session:a', 'session:b', 'session:c']);
  assert.equal(MAX_VISIBLE, 3);
  await answer('session:b', 'archive');
  assert.deepEqual(sent, [{ type: 'stale-archive-answer', kind: 'session', id: 'b', archive: true }]);
  assert.deepEqual([...cards.keys()], ['session:a', 'session:c', 'session:d']);
});

test('Keep sends a non-archive answer; × sends nothing and stays hidden while still open', async () => {
  const { cards, answer, sent, n } = setup();
  const items = [item('task', 't'), item('session', 's')];
  n.onItems(items);
  await answer('task:t', 'keep');
  await answer('session:s', null);
  assert.deepEqual(sent, [{ type: 'stale-archive-answer', kind: 'task', id: 't', archive: false }]);
  n.onItems(items);
  assert.equal(cards.size, 0);
});

test('a card whose item leaves the list is withdrawn without an answer', async () => {
  const { cards, withdrawn, sent, n } = setup();
  n.onItems([item('task', 't')]);
  n.onItems([]);
  await tick();
  assert.deepEqual(withdrawn, ['task:t']);
  assert.equal(cards.size, 0);
  assert.deepEqual(sent, []);
});

test('the card names the item and gives the reason', () => {
  const c = cardFor({ kind: 'task', id: 't1', label: 'Billing', reason: 'Quiet for 16 days.' });
  assert.equal(c.id, 'task:t1');
  assert.equal(c.title, 'Archive “Billing”?');
  assert.equal(c.body, 'Quiet for 16 days.');
  assert.deepEqual(c.actions.map((a) => a.label), ['Keep', 'Archive task']);
});

test('a session card names its task', () => {
  const c = cardFor({ kind: 'session', id: 's1', label: 'Fix login', task: 'Billing', reason: 'Quiet.' });
  assert.equal(c.title, 'Archive “Fix login”?');
  assert.equal(c.body, 'In “Billing”\nQuiet.');
  const loose = cardFor({ kind: 'session', id: 's2', label: 'Loose', task: null, reason: 'Idle.' });
  assert.equal(loose.title, 'Archive “Loose”?');
  assert.equal(loose.body, 'Idle.');
});
