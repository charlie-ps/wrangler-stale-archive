import { fileURLToPath } from 'node:url';
import { StaleStore } from './store.js';
import { findStale, daysSetting, DEFAULT_TASK_DAYS, DEFAULT_SESSION_DAYS } from './staleness.js';

// The extension manifest (agent-wrangler docs/extensions.md). `dir` is the repo
// root so `client` resolves inside `<dir>/public/`; for an installed copy
// discovery overwrites it with the real location.
export const dir = fileURLToPath(new URL('..', import.meta.url));

let lastGraph = null;
let current = [];

// Recompute the open questions from the last board graph and tell every
// browser. Called by the sweep, on a browser asking, and after an answer.
export function refresh(host, now = Date.now()) {
  if (!lastGraph) return current;
  const store = host.stores.state;
  const tasks = (lastGraph.tasks?.tasks || []).filter((t) => !t.archivedAt);
  store.noteTasks(tasks.map((t) => t.id), now);
  current = findStale({
    graph: lastGraph,
    now,
    taskDays: daysSetting(host.settings.get('taskDays'), DEFAULT_TASK_DAYS),
    sessionDays: daysSetting(host.settings.get('sessionDays'), DEFAULT_SESSION_DAYS),
    createdAtOf: (sid) => host.sessions.get(sid)?.createdAt ?? null,
    firstSeen: store.firstSeen,
    dismissed: store.dismissed,
  });
  host.broadcast({ items: current });
  return current;
}

// Browser-supplied, so only a question that is open right now is acted on: a
// second tab answering one the first already settled does nothing.
export async function answer(msg, host, now = Date.now()) {
  const item = current.find((c) => c.kind === msg.kind && c.id === msg.id);
  if (!item) return;
  const key = `${item.kind}:${item.id}`;
  if (msg.archive === true) {
    host.stores.state.forget(key);
    if (item.kind === 'task') await host.tasks.archive(item.id);
    else await host.sessions.archive(item.id);
    host.log(`archived ${key} (stale)`);
  } else {
    host.stores.state.dismiss(key, now);
  }
  current = current.filter((c) => c !== item);
  refresh(host, now);
}

export default {
  id: 'stale-archive',
  label: 'Stale archive prompts',
  description: 'Asks whether to archive a task nobody has started a session in for a while, or a session that has gone quiet, and says why.',
  help: 'A task is stale when no session has been started in it for the task threshold; a session is stale when its transcript has had no activity for the session threshold (nested sessions count towards their top-level card, and working or snoozed ones are skipped). Each one gets its own popup: Archive archives it, Keep (or Escape) asks again only after another full threshold.',
  author: 'Charlie Goldstraw',
  homepage: 'https://github.com/charlie-ps/wrangler-stale-archive',
  defaultEnabled: true,
  dir,
  requires: ['sessions:read', 'sessions:archive', 'tasks:read', 'tasks:archive', 'board:broadcast'],
  engines: { wranglerApi: '^1.23.0' },

  settings: [
    {
      key: 'taskDays',
      type: 'number',
      label: 'Task threshold (days)',
      help: `Ask about a task once no session has been started in it for this many days. Empty uses ${DEFAULT_TASK_DAYS}.`,
      placeholder: String(DEFAULT_TASK_DAYS),
      min: 1,
      max: 365,
      step: 1,
    },
    {
      key: 'sessionDays',
      type: 'number',
      label: 'Session threshold (days)',
      help: `Ask about a session once nothing has happened in it for this many days. Empty uses ${DEFAULT_SESSION_DAYS}.`,
      placeholder: String(DEFAULT_SESSION_DAYS),
      min: 1,
      max: 365,
      step: 1,
    },
  ],

  stores: { state: () => new StaleStore() },

  handlers: [
    { type: 'stale-archive-answer', handler: (msg, host) => answer(msg, host) },
    // A board that just loaded asks rather than waiting for the next sweep.
    { type: 'stale-archive-hello', handler: (msg, host) => { refresh(host); } },
  ],

  // The ~4s rebuild: keep the latest graph for the sweep. Nothing else here.
  graph: ({ graph }) => {
    if (Array.isArray(graph?.sessions)) lastGraph = graph;
    return {};
  },

  sweeps: [{ id: 'check', everyMs: 60_000, run: ({ host }) => { refresh(host); } }],

  client: 'public/index.js',
};
