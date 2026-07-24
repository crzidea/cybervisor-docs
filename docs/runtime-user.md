---
title: Runtime and Daemon (User Guide)
---

# Runtime and Daemon (User Guide)

> **Audience: Users** — Pipeline operators running the daemon and client commands.

## Daemon Mode

`cybervisor serve` starts a long-running WebSocket daemon that accepts pipeline runs over a WebSocket connection. The daemon is primarily controlled via the [WebSocket Protocol](/websocket-protocol.html).

### Log Cleanup

When the daemon starts, it clears all contents under `.cybervisor/logs/` (including per-stage JSONL transcripts) and recreates the required directories. The same cleanup runs before each standalone `cybervisor run` and before each daemon task execution. This ensures logs reflect only the current run or daemon lifetime — stale logs from previous runs are not preserved. Non-log state (locks, hooks, backups, contracts, artifacts) is not affected.

### Retry Continuation

When a stage attempt fails in a recoverable way and retry budget remains, Cybervisor can resume the previous agent session instead of starting a new one. This is called **retry continuation**. It preserves the agent's conversational context so the retry focuses on correcting the failure rather than restarting from the original prompt.

- Adapters that support retry continuation (currently OpenCode) resume the prior session using the adapter's native mechanism (e.g., serve session reuse for OpenCode). The agent receives a continuation prompt that explains the failure and instructs it to continue from the current workspace state without repeating completed work.
- Adapters that do not support retry continuation fall back to the existing fresh retry behavior (new session, original prompt). Logs indicate when fallback occurs.
- Retry counts and `max_retries` behavior are unchanged regardless of retry mode. Each retry attempt counts once toward the budget.
- The `retry_mode` field in structured logs and daemon events distinguishes `fresh` (first attempt or unsupported adapter), `continued` (resumed session), and `fallback` (continuation attempted but unavailable).
- This feature is distinct from `--start-from` (which starts a new pipeline at a chosen stage) and WebSocket client `resume` (which replays daemon events for a running task).

**OpenCode idle timeout:** When an OpenCode session times out due to inactivity (no SSE events for the configured window), the adapter aborts the session and fails the current attempt with an `idle_timeout_failed` event. This is a recoverable failure that triggers retry continuation if retry budget remains. The adapter sends no recovery prompt and performs no force-stop loop. The pipeline's normal retry-continuation policy decides what happens next. See [OpenCode Agent Guide](agents/opencode.md#heartbeat-and-metadata-event-handling) for details.

### Resumed Stage Continuation

When a stage breaks after an agent session id is captured, Cybervisor persists the
session metadata under `.cybervisor/latest-session.json`. A fresh invocation can
explicitly request to continue from that session using `--resume` when combined
with `--start-from`.

```bash
# Start fresh at Implement (no session reuse)
cybervisor run "task" --start-from "Implement"
cybervisor submit "task" --start-from "Implement"   # daemon

# Resume from last captured session at Implement
cybervisor run "task" --start-from "Implement" --resume
cybervisor submit "task" --start-from "Implement" --resume   # daemon
```

- Cybervisor records the latest session id together with the stage name, adapter
  name, and workspace root after any stage attempt that returns a session id.
- `--start-from` alone selects the starting stage and starts
  fresh — it does NOT automatically reuse session metadata.
- `--resume` requires `--start-from`. Using
  it without a start stage exits with a clear error before pipeline execution.
- When `--resume` is set, Cybervisor loads the persisted metadata
  and checks whether the stored stage name, adapter name, and workspace root
  all match the current invocation.
- When all checks pass and the adapter supports continuation, the start stage
  begins as a continued attempt using the stored session id. A stderr line like
  `[Implement] Confirmed continued from session <id-prefix>…` confirms the resume.
- When the adapter does not support continuation, or the metadata is absent,
  stale, or mismatched, Cybervisor logs the reason and starts a fresh attempt.
  Example fallback messages:
  - `[<stage>] Last session available but adapter '<name>' does not support continuation; starting fresh`
  - `[<stage>] Last session not reusable (<reason>); starting fresh` where
    `<reason>` is one of `no_session_metadata`, `workspace_mismatch`,
    `stage_mismatch`, `adapter_mismatch`, `empty_session_id`, or
    `persisted_continuation_unavailable`.
- When a fallback occurs, the persisted metadata is preserved. The new (fresh)
  session id is **not** written to `.cybervisor/latest-session.json`, so a later
  `--resume` attempt still points at the original persisted session. If the
  metadata file is missing entirely when `--resume` is requested, the
  fresh-fallback path does not create a new `latest-session.json`; the file is
  written only when a normal (non-resume) run starts a new session.
- This feature is distinct from in-run retry continuation (which resumes within
  the same pipeline run's retry loop) and from WebSocket client `resume` (which
  replays daemon events for a running task).

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

### Per-Stage Config Reload

Cybervisor reloads `~/.cybervisor/config.yaml` (or the workspace-local `.cybervisor/config.yaml`) before each stage starts, in both the standalone CLI (`cybervisor run`) and the daemon path (`cybervisor submit`). Workspace-local config is resolved relative to the current working directory — the `cwd` sent with the `submit` command for daemon tasks, or the process CWD for `cybervisor run`. Changes to `agent_tool`, `stage_agents`, `stage_models`, and `usage_reporting` take effect at the next stage boundary — operators can tune the config while a long autonomous task is running and the next stage will pick up the edit. The `cybervisor.yaml` stage graph is fixed for the active task. Server bind settings (`host`, `port`) are fixed for the lifetime of the daemon process and are not hot-reloaded.

- **Invalid config fails fast at the next stage boundary.** A reload that produces an invalid config (for example, an unknown agent name in `stage_agents`) is treated as a stage setup failure: the affected stage is marked failed before any agent turn launches, and the pipeline does not silently fall back to the startup-time values. The stderr line `[<stage>] Runtime config reload failed: <message>` names the invalid key or value.
- **Switching adapters resets retry continuation state.** When a reload causes a different adapter to be selected for a stage that is about to retry, the prior session state is cleared and the next attempt uses a fresh `RetryMode` against the new adapter.
- **Same config is a no-op.** Reloading an identical effective config does not change adapter selection, preflight, or retry continuation state.
- **Audit field in logs.** Each stage's `Running` log entry includes a `config_source` field set to `workspace-local` or `home` so operators can confirm which file was in effect for that stage attempt.

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

While a stage runs, cybervisor prints the agent’s activity to your terminal and records per-stage logs under `.cybervisor/logs/`. Each line is prefixed with the stage name and adapter name in brackets, for example `[Spec][claude] reply: ...` or `[Verify][codex] tool call: Bash`. Adapter names use the canonical lowercase form (`claude`, `codex`, `opencode`, `cursor`, `antigravity`, `mock`) — when filtering or grepping logs, always use the lowercase adapter name.

The output uses three canonical event kinds:

- **`reply:`** — Visible assistant text. Multiline replies render as `reply:` on its own line, a blank line, then the indented body, with a blank line before the next log entry. Each content line preserves its original leading whitespace from the agent output, so code blocks, nested lists, and other indented structures keep their shape. Single-line replies use the inline format `reply: text`.
- **`thinking:`** — Internal model reasoning (Claude `ThinkingBlock`, OpenCode reasoning, Cursor subagent thinking when reported). Multiline thinking uses the same blank-line-and-indent format as replies, with original leading whitespace preserved per content line. Single-line thinking uses the inline format `thinking: text`. For Claude, only true thinking blocks are labeled `thinking:` — visible assistant text is always `reply:`, never `thinking:`. Claude stages request summarized thinking from the SDK by default; absence of thinking on a simple prompt is normal.
- **`tool call:`** — Tool invocations with their parameters.

Tool calls render as `tool call: <ToolName>` followed by one indented parameter line per field using the `field:` label format (not `field=`). Each field appears on its own indented line. Multiline values are shown with the field name on its own line and content indented below. No rendered parameter is truncated or capped at a fixed number of fields. `tool call:` lines show the same style of path, command, and search summaries for protocol-based agents, serve-based agents, and in-process SDK agents when the agent reports usable arguments. Cursor SDK messages are translated defensively and known tools are mapped to the shared argument format while retaining Cursor's tool title. If an SDK event omits arguments, the line may show only the tool label. For OpenCode specifically, bare tool-call start events (without arguments) are deferred in favor of the next parameterized event for the same call, so you see one meaningful line per tool call rather than duplicate starts. OpenCode lifecycle and metadata events (`server.connected`, `session.next.agent.switched`, `session.next.model.switched`, `todo.updated`, `catalog.updated`, `integration.updated`, `reference.updated`, `step-start`, `step-finish`) are suppressed from stderr; they are still recorded in the per-stage JSONL log for debugging. OpenCode reasoning events (`part: reasoning`) are also suppressed from stderr — when reasoning text contains useful content, it is converted to a single `thinking:` event instead of appearing as duplicate `part: reasoning` lines.

- **TodoWrite** entries list every item with its full subject text — no truncation on item count or subject length.
- **Task** (subagent dispatch) prints the full `description` and `prompt` with `subject` as a rendered field. When an ACP adapter maps a subagent tool through the Task formatter, the first-line tool label may still show the agent’s name while the argument block includes the complete prompt. For Cursor, a completed task tool call can also expose the subagent's nested assistant text, thinking, and tool calls from the task result before the outer task result line. Empty, malformed, missing, or failed task results degrade safely — no content is fabricated and the stage continues normally.
- **Edit** entries always show every parameter on its own indented line. `replacing:` and `with:` labels appear on their own line, with values on the following line(s) indented two spaces. Multiline content continues with two-space indentation per content line. There is no length truncation on `replacing` and `with` values.

## Batch Submit

`cybervisor submit --path <dir>` processes all `.md` files in the given directory sequentially through the daemon. Each file's content is submitted as a separate task prompt.

```bash
# Process all .md files in prompts/ one at a time
cybervisor submit --path prompts/

# With explicit task ID prefix (generates batch_1, batch_2, ...)
cybervisor submit --path prompts/ --task-id batch

# All standard submit flags work with --path
cybervisor submit --path prompts/ --config custom.yaml --start-from Implement --resume
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

If skills are not restored after a crash (e.g., SIGKILL), automatic recovery runs at the start of the next pipeline. For manual recovery, use `cybervisor restore-skills`. See [Troubleshooting](troubleshooting/daemon.md#skills-were-not-restored-after-a-crash) for details.

**Adapter directory mapping:**

| Adapter | Project-local skills directory | Backup directory |
|---------|-------------------------------|-----------------|
| `claude` | `.claude/skills/` | `.cybervisor/backups/skills/claude/` |
| `codex` | `.agents/skills/` | `.cybervisor/backups/skills/codex/` |
| `opencode` | None | None |
| `cursor` | None | None |
| `antigravity` | None | None |

Global skills directories (`~/.claude/skills/`, etc.) are never modified.

**Validation:** Entries in `disabled_skills` must not contain `/` or `\` and must not be `.` or `..`. Invalid entries cause cybervisor to exit with an error at startup. Entries must match exact skill directory names, not skill set names.

See [Configuration Reference](/configuration.html) for the `disabled_skills` field syntax and the default scaffold contents.

## Signals And Cleanup

- `cybervisor` exits with status code `130` on `SIGINT` or `SIGTERM`; cleanup (settings restoration, hook removal) runs before exit and is capped at 5 seconds — if cleanup exceeds the timeout, a hard exit occurs
- **In-process adapters** (Claude, Cursor, Antigravity) use cooperative cancellation — `cybervisor cancel` signals the SDK thread to stop and joins it with a bounded timeout, rather than terminating a subprocess. Subprocess-based adapters (Codex and OpenCode) use process-group termination.
- No adapter currently uses settings-file patching. Cursor calls the SDK directly and uses no external Cursor settings file. OpenCode uses serve-mode HTTP with native permission config via `OPENCODE_CONFIG_CONTENT`.
- Hook runtime metadata under `.cybervisor/hooks/` is non-secret; verifier credentials remain in `~/.cybervisor/config.yaml`
- **Cursor write protection**: Cursor uses snapshot-only post-hoc enforcement for `read_only_paths`. Protected changes are detected after an SDK turn, restored when possible, and cause the stage attempt to fail. There is no proactive Cursor enforcement mode.

### Descendant Process Cleanup

When the agent subprocess spawns long-running child processes (such as `npm run dev` or `vite preview`), cybervisor terminates them automatically on both normal completion and interruption:

- **Stage-level cleanup**: After each stage's agent exits, cybervisor sends SIGTERM to the agent's entire process group, waits up to 2 seconds, then sends SIGKILL to any survivors. It then falls back to individually tracked child PIDs. This covers deeply nested descendants that share the agent's process group.
- **Pipeline-level safety net** (`cybervisor run` only): After the full pipeline completes, cybervisor walks the process tree to discover and terminate any remaining descendant processes that escaped stage-level cleanup (for example, a child that called `setpgid` to leave the agent's group). Daemon-submitted tasks (`cybervisor submit`) rely on per-stage cleanup; the pipeline-level sweep is not run because the daemon process may host multiple concurrent tasks.

Cleanup is best-effort: if a process exits between discovery and termination, no error is raised. All cleanup actions are logged to both stderr and the JSON log file under `.cybervisor/logs/`.

**Known limitation**: A descendant process that both leaves the agent's process group (via `setpgid` or `setsid`) and is reparented to init (because its parent exited) may not be discovered by the pipeline-level sweep. This is rare and is an acceptable edge case under best-effort cleanup.
