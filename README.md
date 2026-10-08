# Stale archive prompts

An [Agent Wrangler](https://github.com/PortSwigger/agent-wrangler) extension that asks whether to archive work that has gone quiet, and says why.

- **Tasks**: once no session has been started in a task for **14 days**, you're asked whether to archive it. A task that has never had a session counts from when the extension first saw it.
- **Sessions**: once nothing has happened in a session for **4 days**, you're asked whether to archive it. "Nothing has happened" means no new entries in its transcript. Nested sessions count towards their top-level card and are archived with it. Working sessions, sessions with a background shell and snoozed sessions are skipped.

Each one appears as a notification in the board's bottom-right corner, naming the task or session and giving the reason, such as "No new session has been started in this task for 16 days (the last one on 22 Sept)". Notifications stack (up to three at a time, with the rest following as you answer), never take focus and don't block the board. **Archive** archives the task or session the same way the board's own Archive does. **Keep** leaves it alone and doesn't ask again until another full threshold has passed. **×** just hides the notification until you reload the board.

Change both thresholds under **Settings → Extensions → Stale archive prompts**.

Requires host API `^1.23.0`: the `tasks:archive` capability and the client `api.ui.notify`. An older wrangler quarantines the extension at load. Its state is kept in `<AW_DATA_DIR>/stale-archive.json`.

## Install

In the wrangler's Extensions tab, install from `https://github.com/charlie-ps/wrangler-stale-archive.git` and consent to its capabilities: `sessions:read`, `sessions:archive`, `tasks:read`, `tasks:archive` and `board:broadcast`.

## Develop

```
npm test
```

To try it on a dev wrangler, **copy** (don't symlink) this directory to `<AW_DATA_DIR>/extensions/stale-archive` and start the wrangler.

## Licence

Apache-2.0, see `LICENSE`.
