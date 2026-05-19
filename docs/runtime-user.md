---
title: Runtime and Daemon (User Guide)
---

# Runtime and Daemon (User Guide)

> **Audience: Users** — Pipeline operators running the daemon and client commands.

## Daemon Mode

`cybervisor serve` starts a long-running WebSocket daemon that accepts pipeline runs over a WebSocket connection. The daemon is primarily controlled via the [WebSocket Protocol](/websocket-protocol.html).

### Instance Lock

The daemon acquires an exclusive lock via `.cybervisor/daemon.lock` at startup. The lock file stores the PID, working directory, start time, and version. If the lock is held by a live process in the same directory, a new `cybervisor serve` invocation exits with an error. Stale locks (crashed processes) are detected and automatically replaced.

### Reconnect and Resume

A disconnected client can reconnect and send a `resume` message with the original `task_id`. The daemon replies with an `event_replay` of all buffered history and, if the task is still running, re-registers the socket as the live event target. Reconnect is gated by the `reconnect_ttl_seconds` setting — after that window closes, the task is cleaned up as abandoned.

### Background Daemonization

`cybervisor serve --background` fully detaches from the terminal and redirects stdin/stdout/stderr. The daemon runs until it receives `SIGINT` or `SIGTERM`, or until the process is otherwise terminated.

### WebSocket Keepalive

The daemon sends WebSocket pings every 30 seconds and expects a pong within 10 seconds. The client can also send `ping` messages at any time and receive `pong` responses.

### Abandoned Task Cleanup

A background task runs a cleanup loop every `reconnect_ttl_seconds / 2` seconds. Tasks with no activity for longer than the TTL are removed from the registry and logged as abandoned. Running tasks whose subprocess is still alive are never removed — the cleanup only targets tasks that are already completed or cancelled. Running tasks whose subprocess has exited are detected and marked as cancelled, then cleaned up on the next cycle.

### Per-Task Config Reload

The daemon reloads `~/.cybervisor/config.yaml` (or the workspace-local `.cybervisor/config.yaml`) at the start of each task execution. Workspace-local config is resolved relative to the submitting client's working directory (the `cwd` sent with the `submit` command), not the daemon process directory. This means changes to `agent_tool`, `stage_agents`, `stage_models`, `usage_reporting`, and verifier settings take effect on the next submitted task without restarting the daemon. Server bind settings (`host`, `port`) are fixed for the lifetime of the daemon process and are not hot-reloaded.

## Client Interaction

The daemon is controlled by client subcommands over the WebSocket connection:

- **`cybervisor status`** — checks whether the daemon is reachable; when reachable, prints running task IDs and stages. This command is strictly read-only — it never creates or modifies any task.
- **`cybervisor submit`** — sends a `run` message; streams all pipeline events and returns the pipeline exit code on `run_complete`. Accepts a positional prompt argument or reads the task description from stdin. When no prompt is provided and all selected stages have self-contained `prompt_template` values, the task runs without an objective prompt (config-driven promptless execution). Also supports `--path <dir>` for batch submission of `.md` files (see Batch Submit below).
- **`cybervisor attach`** — sends a `resume` message; replays buffered events, then subscribes to live events until the task reaches a terminal state.
- **`cybervisor cancel`** — sends a `cancel` message; the daemon aborts the running pipeline.
- **`cybervisor logs`** — sends a `resume` message; drains all buffered events and outputs each as a JSON line to stdout.
- **`cybervisor end`** — sends a `set_stop_stage` message; accepts `--after <stage>` (stop after this stage executes) or `--before <stage>` (stop before this stage starts). Both `--after` and `--before` are updatable mid-run via the daemon's `set_stop_stage` message.

All client commands accept `--host` and `--port` to override the daemon address. Defaults come from `~/.cybervisor/config.yaml` (`server.host`, `server.port`). The connection timeout is 5 seconds; commands exit `1` with a "daemon not reachable" message on timeout or connection failure.

The full protocol is documented in [WebSocket Protocol](/websocket-protocol.html).

## Live stderr output

While a stage runs, cybervisor prints the agent’s activity to your terminal and records per-stage logs under `.cybervisor/logs/`. `tool call:` lines show the same style of path, command, and search summaries for Claude and for ACP-based agents (Gemini, Codex, OpenCode, Cursor) when the agent reports usable arguments. The tool title on the first line may still read like that agent’s UI label (for example Cursor’s “Read File” or “Find”) while the argument lines follow the same layout as other agents. If the agent sends a tool event without arguments, the line may show only the tool label.

- **TodoWrite** entries list every item with its full subject text — no truncation on item count or subject length.
- **Edit** entries always show every parameter on its own indented line. `replacing:` and `with:` labels appear on their own line, with values on the following line(s) indented two spaces. Multiline content continues with two-space indentation per content line. There is no length truncation on `replacing` and `with` values.

## Batch Submit

`cybervisor submit --path <dir>` processes all `.md` files in the given directory sequentially through the daemon. Each file's content is submitted as a separate task prompt.

```bash
# Process all .md files in prompts/ one at a time
cybervisor submit --path prompts/

# With explicit task ID prefix (generates batch_1, batch_2, ...)
cybervisor submit --path prompts/ --task-id batch

# All standard submit flags work with --path
cybervisor submit --path prompts/ --config custom.yaml --start-stage Implement
```

**Behavior:**

- Only `.md` files are processed; other file types in the directory are ignored. Files are discovered non-recursively (subdirectories are not searched) and sorted lexicographically by filename. Use zero-padded names (e.g., `01-task.md`, `02-task.md`) for predictable ordering.
- An empty directory (no `.md` files) or a nonexistent `--path` directory produces a validation error.
- On success (exit code 0), the processed file is moved to `<path>/completed/`. The directory is created automatically.
- On failure (non-zero exit), processing stops immediately. The failing file remains in its original location and no further files are processed.
- Files already in `completed/` are never re-processed.
- `--path` and the positional `prompt` argument are mutually exclusive. When `--path` is provided, stdin is not read.
- When `--task-id` is provided with `--path`, each file gets a unique ID with a `_N` suffix (1-indexed, e.g., `batch_1`, `batch_2`). When `--task-id` is omitted, each file gets an auto-generated ID.
- `--end-after` and `--end-before` are mutually exclusive (this applies to all `submit` commands, not just `--path`).

**Partial failure recovery:** If a batch run stops mid-way due to a failure, re-running the same `--path` command will skip files already moved to `completed/` and resume from the next unprocessed file.

## Skill Disable/Restore

When `disabled_skills` is configured in `cybervisor.yaml`, the pipeline temporarily moves the named project-local skills to a backup directory before the agent starts and restores them after the pipeline finishes.

**Lifecycle:**
1. At pipeline start, the skill restore step runs first to recover from any previous unclean shutdown (e.g., SIGKILL). It moves any orphaned skill directories back to their original project-local directories.
2. The skill disable step then moves each listed skill from the project-local directory to `.cybervisor/backups/skills/<adapter>/`.
3. After the pipeline finishes (success, failure, or interrupt), all disabled skills are restored to their original locations.
4. Empty backup directories are cleaned up automatically.

If skills are not restored after a crash (e.g., SIGKILL), automatic recovery runs at the start of the next pipeline. For manual recovery, use `cybervisor restore-skills`. See [Troubleshooting](troubleshooting.md#skills-and-settings) for details.

**Adapter directory mapping:**

| Adapter | Project-local skills directory | Backup directory |
|---------|-------------------------------|-----------------|
| `claude` | `.claude/skills/` | `.cybervisor/backups/skills/claude/` |
| `gemini` | `.gemini/skills/` | `.cybervisor/backups/skills/gemini/` |
| `codex` | `.agents/skills/` | `.cybervisor/backups/skills/codex/` |
| `opencode` | None | None |
| `cursor` | None | None |

Global skills directories (`~/.claude/skills/`, etc.) are never modified.

**Validation:** Entries in `disabled_skills` must not contain `/` or `\` and must not be `.` or `..`. Invalid entries cause cybervisor to exit with an error at startup. Entries must match exact skill directory names, not skill set names.

See [Configuration Reference](/configuration.html) for the `disabled_skills` field syntax and the default scaffold contents.

## Signals And Cleanup

- `cybervisor` exits with status code `130` on `SIGINT` or `SIGTERM`; cleanup (settings restoration, hook removal) runs before exit and is capped at 5 seconds — if cleanup exceeds the timeout, a hard exit occurs
- Non-mock runs restore the pre-run `.claude/settings.json` content during cleanup (Gemini, Codex, OpenCode, and Cursor do not use settings-file patching — they use Strategy B with ACP runtime permission enforcement)
- Hook runtime metadata under `.cybervisor/hooks/` is non-secret; verifier credentials remain in `~/.cybervisor/config.yaml`
- **Enforcement-mode marker**: For ACP agents (Gemini, OpenCode, Cursor), an `enforcement_mode` event is written to `.cybervisor/hooks/hook-events.jsonl` at session start. Value `"proactive"` means the agent is emitting `session/request_permission` events and ACP-level tool calls can be denied before execution. Value `"post_hoc_only"` means ACP permission requests are unavailable and Cybervisor relies on other layers for protection. OpenCode still applies native permission rules via `OPENCODE_CONFIG_CONTENT`; Cursor still applies native deny rules via `.cursor/cli.json`; both use post-hoc filesystem snapshot restoration as a backstop for `read_only_paths`. The marker does not reflect those native harness permissions.

### Descendant Process Cleanup

When the agent subprocess spawns long-running child processes (such as `npm run dev` or `vite preview`), cybervisor terminates them automatically on both normal completion and interruption:

- **Stage-level cleanup**: After each stage's agent exits, cybervisor sends SIGTERM to the agent's entire process group, waits up to 2 seconds, then sends SIGKILL to any survivors. It then falls back to individually tracked child PIDs. This covers deeply nested descendants that share the agent's process group.
- **Pipeline-level safety net** (`cybervisor run` only): After the full pipeline completes, cybervisor walks the process tree to discover and terminate any remaining descendant processes that escaped stage-level cleanup (for example, a child that called `setpgid` to leave the agent's group). Daemon-submitted tasks (`cybervisor submit`) rely on per-stage cleanup; the pipeline-level sweep is not run because the daemon process may host multiple concurrent tasks.

Cleanup is best-effort: if a process exits between discovery and termination, no error is raised. All cleanup actions are logged to both stderr and the JSON log file under `.cybervisor/logs/`.

**Known limitation**: A descendant process that both leaves the agent's process group (via `setpgid` or `setsid`) and is reparented to init (because its parent exited) may not be discovered by the pipeline-level sweep. This is rare and is an acceptable edge case under best-effort cleanup.