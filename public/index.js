// The client half: the server broadcasts the open questions (tasks and sessions
// gone quiet) about once a minute, and this asks them one at a time in the
// board's own confirm dialog (api.ui.confirm). Only while the tab is visible, so
// a background tab does not stack up a queue of popups for later.

export function nextQuestion(items, asked) {
  return (items || []).find((it) => !asked.has(`${it.kind}:${it.id}`)) || null;
}

export function dialogFor(item) {
  const what = item.kind === 'task' ? 'task' : 'session';
  return {
    title: `Archive this ${what}?`,
    body: `${item.label}\n\n${item.reason}`,
    okLabel: `Archive ${what}`,
    cancelLabel: 'Keep',
  };
}

export function createPrompter({ api, doc = document }) {
  let items = [];
  let showing = false;
  // Asked in this tab already: the server's next list may still carry it for a
  // moment after the answer is sent.
  const asked = new Set();

  async function maybeAsk() {
    if (showing || doc.visibilityState === 'hidden') return;
    const item = nextQuestion(items, asked);
    if (!item) return;
    showing = true;
    asked.add(`${item.kind}:${item.id}`);
    try {
      const archive = await api.ui.confirm(dialogFor(item));
      api.send({ type: 'stale-archive-answer', kind: item.kind, id: item.id, archive });
    } finally {
      showing = false;
    }
    maybeAsk();
  }

  return {
    onItems(next) {
      items = Array.isArray(next) ? next : [];
      // Forget what this tab asked once the server has too, so a Keep that
      // comes round again after another threshold is asked again.
      const open = new Set(items.map((it) => `${it.kind}:${it.id}`));
      for (const key of asked) if (!open.has(key)) asked.delete(key);
      maybeAsk();
    },
    maybeAsk,
  };
}

export default {
  register(slots) {
    // No slot: the registrar's own api and onMessage are all this needs.
    const api = slots.api;
    const prompter = createPrompter({ api });
    slots.onMessage((frame) => prompter.onItems(frame.items));
    document.addEventListener('visibilitychange', () => prompter.maybeAsk());
    // Ask for the list now rather than waiting up to a minute for the sweep.
    api.send({ type: 'stale-archive-hello' });
  },
};
