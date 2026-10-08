// The client half: the server broadcasts the open questions (tasks and sessions
// gone quiet) about once a minute, and this raises each as a card in the
// board's notification stack (api.ui.notify), a few at a time, so nothing
// blocks the board. Archive and Keep go back to the server; × only hides the
// card until the page is reloaded.

// Cards on screen at once; the rest wait their turn.
export const MAX_VISIBLE = 3;

const keyOf = (item) => `${item.kind}:${item.id}`;

export function cardFor(item) {
  const what = item.kind === 'task' ? 'task' : 'session';
  return {
    id: keyOf(item),
    title: `Archive “${item.label}”?`,
    body: item.task ? `In “${item.task}”\n${item.reason}` : item.reason,
    actions: [
      { id: 'keep', label: 'Keep' },
      { id: 'archive', label: `Archive ${what}`, primary: true },
    ],
  };
}

export function createNotifier({ api }) {
  let items = [];
  // key -> token of the card on screen; a resolve whose token is stale was a
  // withdraw of ours and is ignored.
  const shown = new Map();
  const closed = new Set();

  function raise(item) {
    const key = keyOf(item);
    const token = {};
    shown.set(key, token);
    api.ui.notify(cardFor(item)).then((answer) => {
      if (shown.get(key) !== token) return;
      shown.delete(key);
      if (answer === 'archive' || answer === 'keep') {
        api.send({ type: 'stale-archive-answer', kind: item.kind, id: item.id, archive: answer === 'archive' });
      }
      // Answered or closed, it stays down: an answer drops it from the next
      // list, and a close hides it until reload.
      closed.add(key);
      sync();
    });
  }

  function sync() {
    const open = new Set(items.map(keyOf));
    for (const key of [...shown.keys()]) {
      if (open.has(key)) continue;
      shown.delete(key);
      api.ui.withdraw(key);
    }
    for (const item of items) {
      if (shown.size >= MAX_VISIBLE) break;
      const key = keyOf(item);
      if (!shown.has(key) && !closed.has(key)) raise(item);
    }
  }

  return {
    onItems(next) {
      items = Array.isArray(next) ? next : [];
      // An answered item the server has dropped can be raised again if it ever
      // comes back (a Keep after another full threshold). A closed one that is
      // still open stays hidden until reload.
      const open = new Set(items.map(keyOf));
      for (const key of closed) if (!open.has(key)) closed.delete(key);
      sync();
    },
  };
}

export default {
  register(slots) {
    // No slot: the registrar's own api and onMessage are all this needs.
    const api = slots.api;
    const notifier = createNotifier({ api });
    slots.onMessage((frame) => notifier.onItems(frame.items));
    // Ask for the list now rather than waiting up to a minute for the sweep.
    api.send({ type: 'stale-archive-hello' });
  },
};
