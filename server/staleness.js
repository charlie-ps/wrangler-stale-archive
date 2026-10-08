// Which tasks and sessions have gone quiet long enough to ask about. Pure: the
// board graph, a few lookups and the clock in, the list of prompts out.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TASK_DAYS = 14;
export const DEFAULT_SESSION_DAYS = 4;

const newest = (...ts) => ts.filter((t) => typeof t === 'number' && Number.isFinite(t)).reduce((a, b) => Math.max(a, b), -Infinity);
const days = (ms) => Math.floor(ms / DAY_MS);

export function shortDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A setting read back as a positive number of days, else the default.
export function daysSetting(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

// Nested cards go with their top-level card (archive cascades), so only
// top-level ones are asked about, and a family is as recent as its most recent
// member.
function familyActivity(sessions) {
  const byId = new Map(sessions.map((s) => [s.sessionId, s]));
  const rootOf = (s) => {
    const seen = new Set();
    let cur = s;
    while (cur.parentSession && byId.has(cur.parentSession) && !seen.has(cur.sessionId)) {
      seen.add(cur.sessionId);
      cur = byId.get(cur.parentSession);
    }
    return cur.sessionId;
  };
  const latest = new Map();
  const busy = new Set();
  for (const s of sessions) {
    const root = rootOf(s);
    latest.set(root, newest(latest.get(root), s.lastActivity, s.createdAt));
    if (s.status === 'working' || s.hasBackgroundShell) busy.add(root);
  }
  return { latest, busy };
}

const isSnoozed = (s, now) => typeof s.snooze?.until === 'number' && s.snooze.until > now;

// graph: the board graph (sessions, tasks). createdAtOf(sid): a session's
// createdAt, archived ones included, for a task's newest-session check.
// firstSeen: taskId -> when this extension first saw it, the fallback for a
// task that has never had a session (tasks carry no createdAt). dismissed:
// `kind:id` -> when the human last chose Keep; a Keep restarts the clock.
export function findStale({ graph, now, taskDays, sessionDays, createdAtOf = () => null, firstSeen = {}, dismissed = {} }) {
  const out = [];
  const sessions = Array.isArray(graph?.sessions) ? graph.sessions : [];
  const snapshot = graph?.tasks || {};
  const assignments = snapshot.assignments || {};

  for (const task of snapshot.tasks || []) {
    if (task.archivedAt) continue;
    const started = Object.entries(assignments)
      .filter(([, tid]) => tid === task.id)
      .map(([sid]) => createdAtOf(sid));
    const lastStarted = newest(...started);
    const since = newest(lastStarted === -Infinity ? firstSeen[task.id] : lastStarted, dismissed[`task:${task.id}`]);
    if (since === -Infinity || now - since < taskDays * DAY_MS) continue;
    const reason = lastStarted === -Infinity
      ? `No session has been started in this task since it appeared on the board, ${plural(days(now - since), 'day')} ago.`
      : `No new session has been started in this task for ${plural(days(now - lastStarted), 'day')} (the last one on ${shortDate(lastStarted)}).`;
    out.push({ kind: 'task', id: task.id, label: task.name || 'Untitled task', reason });
  }

  const { latest, busy } = familyActivity(sessions);
  for (const s of sessions) {
    if (s.parentSession && sessions.some((p) => p.sessionId === s.parentSession)) continue;
    if (busy.has(s.sessionId) || isSnoozed(s, now)) continue;
    const active = latest.get(s.sessionId);
    const since = newest(active, dismissed[`session:${s.sessionId}`]);
    if (since === -Infinity || now - since < sessionDays * DAY_MS) continue;
    out.push({
      kind: 'session',
      id: s.sessionId,
      label: s.label || 'Untitled session',
      reason: `Nothing has happened in this session for ${plural(days(now - active), 'day')} (last activity on ${shortDate(active)}).`,
    });
  }
  return out;
}
