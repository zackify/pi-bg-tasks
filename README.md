# pi-bg-tasks

A friendly [pi](https://github.com/badlogic/pi) package that adds a `/bg` command for running shell commands in the background with `tmux`.

Use it for dev servers, watchers, long-running scripts, or anything you want to keep out of the main chat while pi keeps working.

## Features

- `/bg <command>` starts a command in a detached `tmux` session from the current project directory
- `/bg` opens an interactive menu for recent and running background commands
- The LLM can launch, inspect, and kill background tasks itself via the `start_bg_task`, `bg_task_status`, and `stop_bg_task` tools (e.g. "start `npm run dev` in the background, wait until it's ready, then run the e2e tests")
- A small widget appears above the editor while commands are running in the current directory
- Press `↑` from the main chat to peek at the latest logs for a running background command
- Press `↑` again while viewing logs to close the log viewer and return to chat
- Recent commands are remembered per working directory so you can quickly rerun them later
- Logs auto-refresh while open
- Running commands can be killed or attached from the UI

## Requirements

- pi with extension/package support
- `tmux` installed and available on your `PATH`
- A shell environment that can run your command with `bash -lc`

## Install

### From npm

After this package is published:

```bash
pi install npm:@zackify/pi-bg-tasks
```

Then reload pi:

```text
/reload
```

### Manual install

Copy the extension into your global pi extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
cp extensions/bg.ts ~/.pi/agent/extensions/bg.ts
```

Or install it only for one project:

```bash
mkdir -p .pi/extensions
cp extensions/bg.ts .pi/extensions/bg.ts
```

Then reload pi:

```text
/reload
```

## Usage

Start a command directly:

```text
/bg npm run dev
```

Or open the menu:

```text
/bg
```

From the menu:

- `Enter` on `New command…` or a recent command fills the editor with `/bg ...`
- `Enter` on a running command opens its logs
- `k` kills the selected running command
- `a` attaches to the selected `tmux` session
- `Esc` closes the menu

When a background command is running in the current directory, pi shows a small status widget above the editor. From the main chat, press `↑` to view its logs. While the log viewer is open, press `↑` again to close it.

### LLM tools

The extension exposes three tools the model can call directly, so you can just ask in natural language and let the agent keep working while the task runs:

- `start_bg_task` — takes a `command` string and launches it the same way `/bg <command>` does. Returns the tmux session id and log file path so the model can find it later.
- `bg_task_status` — checks whether a background task is still actively running, how long it has been up, and the tail of its log output. Pass a `command` to check a specific task, or omit it to list every background task in the current working directory. Optional `logLines` (default 40, max 500, set to 0 to skip logs).
- `stop_bg_task` — takes the same `command` string and kills the matching background task in the current working directory. If nothing matches it returns the list of currently running tasks so the model can retry with the right name.

Matching is scoped to the current working directory, so the model cannot accidentally touch a task running in another project.

#### Why this matters for the agent

Without background tasks, an AI agent that needs a dev server, watcher, or long build has two bad options: block the entire turn on a process that never exits, or fire-and-forget and lose all visibility. These tools fix both problems:

- **Non-blocking startup.** `start_bg_task` returns immediately with a session id and log file. The agent can move on to running tests, editing code, or hitting an endpoint instead of hanging on `npm run dev`.
- **Active polling.** `bg_task_status` lets the agent loop "start → poll logs → continue when ready" without a human in the middle. It can confirm a server printed `Listening on :3000`, detect a compile error in a watcher, or notice that a long migration finally finished, all by re-reading the log tail.
- **Self-healing cleanup.** `stop_bg_task` makes the agent responsible for tearing down what it started. Combined with the cwd-scoped matching, the model can safely manage multiple tasks across a session without leaking processes.
- **Stable references.** Tasks are addressed by the exact command string the agent used to start them, so the model does not have to track opaque session ids across tool calls — it just remembers what it asked for.

Example prompts:

- "Start `npm run dev` as a background task, wait until it's listening, then run the e2e tests and stop it when you're done."
- "Is the `pnpm build --watch` task still running? Show me the last 100 lines of its logs."
- "List every background task running in this project."
- "Kill the `npm run dev` background task."

## History and logs

The extension stores its local state under `~/.pi/agent/`:

- `bg-cache.json` remembers recent `/bg` commands by working directory
- `bg-meta/` stores metadata for active `tmux` sessions
- `bg-logs/` stores command log files

This state stays on your machine. It is not included in this package and should not be committed.

## Privacy notes

This repository does not include personal command history, logs, hostnames, tokens, or machine-specific configuration. The extension itself stores command history locally so it can offer recents; avoid running commands that include secrets if you do not want them saved in your local history file.

## Troubleshooting

### tmux is not installed

Install `tmux` with your system package manager, then reload pi.

### I do not see logs with the up arrow

Make sure a `/bg` command is currently running in the same working directory as your pi session. You can also run `/bg` to open the menu and select a running command.

### A command exits immediately

Open the logs with `↑` or `/bg` to see the command output. The command runs from the current project directory using `bash -lc`.

## Publishing

When you are ready to publish manually:

```bash
npm publish --access public
```

This repository also includes the same release workflow style as `pi-port-forward`: create a GitHub release named like `v1.2.3`, add an `NPM_TOKEN` repository secret, and GitHub Actions will publish that version to npm with provenance.

## Files

- `extensions/bg.ts` — extension source
- `package.json` — pi package metadata for `@zackify/pi-bg-tasks`, including the `pi-package` keyword
- `.github/workflows/publish.yml` — optional npm publish workflow for GitHub releases
