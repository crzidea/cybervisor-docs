---
title: Troubleshooting cybervisor
---

# Troubleshooting cybervisor

> **Audience: Users** — Pipeline operators encountering issues.

## Installation and Setup

### `cybervisor: command not found`

`uv` did not install the tool onto your PATH, or your shell has not reloaded.

```bash
# Confirm uv's tool bin directory is on PATH
echo $PATH | grep -q "\.local/bin" || echo 'Add export PATH="$HOME/.local/bin:$PATH" to your shell profile'

# Reinstall and verify
uv tool install cybervisor
cybervisor --version
```

---

## Verifier and Credentials

### `Doctor: verifier blocked`

`~/.cybervisor/config.yaml` is missing or the `llm.api_key` field is absent.

```bash
mkdir -p ~/.cybervisor
cat > ~/.cybervisor/config.yaml <<'EOF'
agent_tool: claude
llm:
  api_key: sk-your-key-here
EOF
chmod 600 ~/.cybervisor/config.yaml
```

### `Doctor: verifier needs attention`

The API key is present but the remote endpoint rejected it (401 Unauthorized).

- Check that `llm.api_key` is valid and has not expired.
- If using a custom `base_url`, confirm the endpoint is reachable: `curl -I "$BASE_URL/models" -H "Authorization: Bearer $API_KEY"`.

---

## Usage Reporting

### WARNING: "Usage reporting request failed"

When `usage_reporting.enabled` is true, cybervisor sends one best-effort document per completed stage to Elasticsearch. Network errors, invalid credentials, or a missing `endpoint` produce warnings but never fail the pipeline stage.

- Confirm `usage_reporting.endpoint` and `index` match your cluster.
- Verify `api_key` can index into the configured index.
- Check stderr or `.cybervisor/logs/` for the warning; credentials are not logged.
- Reporting requires `httpx`; if it is not installed, a warning is logged and reporting is skipped.

See [Configuration Reference — Usage Reporting](configuration.md#usage-reporting) for setup.

---

## Pipeline Execution

### `A task is already running in this directory`

Another pipeline is active in the same working directory.

**Option A — Attach to the running task:**

```bash
cybervisor attach
```

**Option B — Cancel it:**

```bash
cybervisor cancel
```

**Option C — If you are sure nothing is running, remove stale locks:**

```bash
rm .cybervisor/instance.lock
```

If the daemon is running, also check:

```bash
cybervisor status
```

### Agent exits immediately with no output

- Confirm the selected agent is installed: `claude --version`, `gemini --version`, `codex --version`, `opencode --version`, or `cursor-agent --version` (Cursor uses the `cursor-agent` binary on `PATH`).
- Check preflight output at the top of the run for missing prerequisites.
- For Gemini specifically, verify `gemini --acp` is supported in your CLI version; the adapter communicates exclusively via ACP JSON-RPC.

### Gemini ACP mode not available

If cybervisor reports that `gemini --acp` is not supported:

- Verify Gemini CLI version: `gemini --acp --help` should exit with code 0. ACP mode requires a recent version of Gemini CLI.
- If `gemini --acp --help` fails, upgrade Gemini CLI to the latest version.
- Check that `gemini` is on your `PATH` and is the correct binary (not an alias or wrapper script).

### Gemini ACP authentication fails

If the adapter raises a `RuntimeError` during authentication:

- Authenticate with Gemini CLI before starting the pipeline. The adapter sends an ACP `authenticate` request using the method derived from the `initialize` response (`oauth-personal` for current Google login flows; legacy values are mapped transparently to current enum values).
- Run `gemini auth login` or follow the Gemini CLI authentication flow to establish credentials.
- Test ACP separately when diagnosing this error: a successful `gemini -p "hello"` confirms headless Gemini auth, but the adapter depends on `gemini --acp` advertising and accepting an ACP auth method.
- Check `.cybervisor/logs/stages/` for the full ACP transcript, which includes the authentication response and any error details.

### Gemini ACP session hangs or times out

- ACP notification waits time out after 30 seconds. If no notification arrives within 30 seconds, a warning is logged and the adapter continues waiting — this is normal for slow agents and does not indicate a failure. If the agent is idle for 300 seconds (5 minutes) without any notification, the turn is abandoned with an error that includes the last notification summary and whether the process exited or the grace period expired.
- Check `.cybervisor/logs/stages/` for ACP transcript details. The log file contains the full JSON-RPC transcript for each stage.
- If the agent appears stuck, try `cybervisor cancel` to send a cancel request and clean up.

### OpenCode ACP mode not available

If cybervisor reports that `opencode acp` is not supported:

- Verify OpenCode version: `opencode acp --help` should exit with code 0. ACP mode requires OpenCode v0.4.0 or later.
- If `opencode acp --help` fails, upgrade OpenCode to the latest version.
- Check that `opencode` is on your `PATH` and is the correct binary (not an alias or wrapper script).

### `opencode.json` appeared in the workspace after a Cybervisor run

Cybervisor does **not** create `./opencode.json` or `./cybervisor/opencode.json` during pipeline runs or tests. Runtime overrides (model, permissions, file-context disabling) are injected through `OPENCODE_CONFIG_CONTENT` or a temporary config file outside the workspace that is cleaned up after the session.

If you see a new `opencode.json` after a run:

- It may have been created by OpenCode CLI outside Cybervisor (for example `opencode` interactive setup).
- Check whether the file existed before the run; Cybervisor only reads existing project OpenCode config when resolving defaults.
- Remove the file if you do not want project-local OpenCode settings; Cybervisor will still apply its runtime overrides through `OPENCODE_CONFIG_CONTENT`.

### OpenCode ACP session hangs or times out

- ACP notification waits time out after 30 seconds. If no notification arrives within 30 seconds, a warning is logged and the adapter continues waiting — this is normal for slow agents and does not indicate a failure. If the agent is idle for 300 seconds (5 minutes) without any notification, the turn is abandoned with an error that includes the last notification summary and whether the process exited (with exit code) or the grace period expired.
- Subprocess crashes during initialization (before the ACP session is established) are detected immediately with a clear error message — the adapter does not wait for the full timeout. If you see an error like "OpenCode process exited during initialization with code N", the subprocess crashed before the ACP session could start. This is common on retry attempts where a previous attempt left stale state.
- Dead processes in the continuation loop (between turns within a session) fail fast — the adapter detects that the process has exited and raises immediately rather than sending a prompt to an exited subprocess. Previous "process pgid already exited" patterns that caused silent hangs are now caught and reported promptly.
- Check `.cybervisor/logs/stages/` for ACP transcript details. The log file contains the full JSON-RPC transcript for each stage.
- If the agent appears stuck, try `cybervisor cancel` to send a `session/cancel` notification and clean up.

### WARNING: "proactive enforcement may not be active" (OpenCode / Cursor)

When running OpenCode or Cursor, you may see a WARNING log like:

```
agent accepted set_mode to 'default' but emitted zero session/request_permission events; 'default' is an agent execution mode (not a permission-asking mode), so only post-hoc ACPReadOnlySnapshot enforcement is active
```

This means cybervisor called `session/set_mode` to switch the agent to a mode that appeared to be a non-yolo approval mode, but the agent never sent permission requests during the first turn — the mode is an agent execution mode that lacks genuine permission semantics. Common causes:

- **OpenCode excludes "build" and "plan" modes**: OpenCode's "build" and "plan" modes are agent execution modes, not permission-asking modes. When these are the only non-yolo modes available, cybervisor does not call `set_mode` at all and enforcement is `"post_hoc_only"` from the start. This is the common case for OpenCode — the WARNING above only appears if another mode is found and accepted but still fails to deliver permission requests.
- **OpenCode non-interactive auto-approve** (upstream PR #14607): `opencode run` auto-approves `"ask"` permissions in non-interactive mode, overriding any `set_mode` result. The agent never emits `session/request_permission` even though the mode switch was accepted.
- **Agent version mismatch**: Older OpenCode or Cursor builds may not fully support `set_mode` for permission enforcement.
- **Agent advertises modes but does not honor them**: The agent lists non-yolo modes in `session/new` but does not actually emit permission requests when switched.

**What this means for you:** ACP-level proactive denial via `session/request_permission` is not active. OpenCode still applies native permission rules from `OPENCODE_CONFIG_CONTENT`, and Cursor still applies native deny rules from `.cursor/cli.json`. Post-hoc filesystem snapshot restoration (`ACPReadOnlySnapshot`) still reverts protected-file modifications after each turn. Check `.cybervisor/hooks/hook-events.jsonl` for an `enforcement_mode` event — `"post_hoc_only"` confirms ACP permission requests are unavailable, `"proactive"` means they are active (this marker does not reflect native harness permissions).

**Resolution:** There is no CLI flag or configuration workaround to force OpenCode or Cursor into ACP approval mode. Native harness permissions and the post-hoc snapshot layer still protect `read_only_paths` regardless. If ACP-level proactive enforcement is critical for your use case, consider using Gemini (`--approval-mode default`), which reliably emits permission requests.

### WARNING: "model override may not have been applied" (OpenCode)

When `stage_models` specifies a model for an OpenCode stage, you may see a WARNING like:

```
OpenCode active model 'big-pickle' differs from requested model 'claude-sonnet-4-6'; model override may not have been applied
```

This means the adapter injected the requested model via `OPENCODE_CONFIG_CONTENT` (primary mechanism) and also attempted `session/set_model` after session creation (secondary best-effort), but the active model reported by OpenCode still differs from the requested model. This is a known upstream limitation — OpenCode ACP has confirmed bugs (#13644, #21556, #18620) where model selection is silently ignored.

No workspace files are created or modified during this process — all runtime overrides are injected via the `OPENCODE_CONFIG_CONTENT` environment variable.

### Cursor ACP mode not available

If cybervisor reports that `cursor-agent acp` is not supported:

- Verify Cursor CLI version: `cursor-agent acp --help` should exit with code 0. ACP mode requires a recent version of Cursor CLI.
- If `cursor-agent acp --help` fails, upgrade Cursor CLI to the latest version.
- Check that `cursor-agent` is on your `PATH` and is the correct binary (not an alias or wrapper script).

### Cursor ACP authentication fails

If the adapter raises a `RuntimeError` during authentication:

- Set `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN` in the environment before running cybervisor, or run `cursor login` to authenticate interactively.
- Verify the key is valid: an expired or invalid key will cause the `authenticate` step (method `cursor_login`) to fail.
- Check `.cybervisor/logs/stages/` for the full ACP transcript, which includes the authentication response.

### Cursor ACP session hangs or times out

- ACP notification waits time out after 30 seconds. If no notification arrives within 30 seconds, a warning is logged and the adapter continues waiting — this is normal for slow agents and does not indicate a failure. If the agent is idle for 300 seconds (5 minutes) without any notification, the turn is abandoned with an error that includes the last notification and whether the process exited or the grace period expired.
- Check `.cybervisor/logs/stages/` for ACP transcript details. The log file contains the full JSON-RPC transcript for each stage.
- If the agent appears stuck, try `cybervisor cancel` to send a `session/cancel` notification and clean up.

### `tool call:` lines show only a title (Gemini, Codex, OpenCode, Cursor)

Live stderr builds `tool call:` lines from each agent’s structured events. For ACP-based agents, summaries appear only when the `session/update` tool payload includes usable argument fields; a label-only line is normal when the wire notification has no arguments.

If summaries disappeared or look wrong after upgrading the agent CLI, compare the live line with the corresponding `tool_call` entry in `.cybervisor/logs/stages/` (full JSON-RPC transcript). Maintainers extending support for new payload shapes should update that agent adapter's `tool_mapping.py`, not `stream_logging.py` — see [Adding a Coding-Agent Adapter](/contributing/adding-an-adapter.html).

### Hook verifier returns `block` on every invocation

The verifier LLM is rejecting the hook decisions. Common causes:

- The verifier model is too restrictive. Try a different model in `~/.cybervisor/config.yaml`.
- The stage contract artifact is malformed. Inspect the artifact under `.cybervisor/contracts/artifacts/` and compare it to the expected schema.
- The hook verifier endpoint is unreachable. Check `cybervisor doctor`.

For testing with deterministic approvals, use the mock LLM API:

```bash
python3 scripts/.e2e_mock_llm_api.py --hook-mode allow &
# Then point llm.base_url at the printed URL
```

---

## Daemon Mode

### `Daemon not reachable at ws://127.0.0.1:8765`

The daemon is not running, or it is bound to a different host/port.

```bash
# Check if the daemon process exists
ps aux | grep "cybervisor serve"

# Start it explicitly
cybervisor serve

# Or with custom binding
cybervisor serve --host 0.0.0.0 --port 9000
```

When using custom ports, pass `--host` and `--port` to every client command:

```bash
cybervisor status --host 127.0.0.1 --port 9000
```

### `nested_task_rejected` when submitting

You submitted a new task from a directory that already has a running daemon task. Submit from a different directory, or cancel the existing task first.

### Sandbox CLI and daemon versions differ

When `cybervisor sandbox` starts, it logs two version lines:

```
INFO | cybervisor CLI 0.18.1
INFO | cybervisor daemon 0.18.0
```

If these versions differ, the container image is outdated. Pull the latest image:

```bash
cybervisor sandbox          # pulls automatically by default
# or
docker pull ghcr.io/crzidea/cybervisor:latest
```

If the CLI shows a newer version available (`cybervisor CLI 0.18.1 (latest: 0.18.2)`), upgrade the host CLI:

```bash
uv tool upgrade cybervisor
```

---

## Skills and Settings

### Skills were not restored after a crash

If cybervisor was killed with SIGKILL or the machine powered off, the restore step may not have run.

Automatic recovery happens at the start of the next run. If you need to force it manually:

```bash
cybervisor restore-skills
```

Check `.cybervisor/backups/skills/` for orphaned skill directories and move them back to `.claude/skills/`, `.gemini/skills/`, or `.agents/skills/` manually if needed.

### Settings snapshot was not restored

If `.claude/settings.json` still contains cybervisor hook entries after a crash (Gemini, Codex, OpenCode, and Cursor do not use settings-file patching):

1. Look in `.cybervisor/hooks/` for the snapshot file (e.g., `settings_snapshot.json`).
2. Manually restore it to the tool's settings path, or remove the cybervisor hook entry.

---

## Write Protection (`read_only_paths`)

### Agent is blocked from writing to a file

If the agent reports "Path X is protected by the pipeline (read_only_paths)", the file matches a pattern in the current stage's `read_only_paths` in `cybervisor.yaml`.

- Check your stage's `read_only_paths` patterns — they use path-segment glob matching resolved relative to the workspace root. `*` matches within one path segment, and `**` matches zero or more path segments. For example, `src/**` matches all files under `src/`, and `**/*.py` matches Python files at any depth.
- If the block is unexpected, verify the pattern isn't too broad. For example, `**/*.py` blocks all Python files project-wide. Use a narrower pattern such as `src/**/*.py` when only one tree should be protected.
- Bash commands with file-write patterns (`>`, `>>`, `sed -i`, `tee`) are blocked conservatively — if a write target cannot be resolved, the entire call is blocked. Restructure the command to make the target path explicit.

### `read_only_paths` is not blocking writes

- Confirm `read_only_paths` is set on the relevant stage in `cybervisor.yaml` (it is a per-stage field, not a top-level field or a `~/.cybervisor/config.yaml` field).
- Empty or absent `read_only_paths` for a stage means no write protection is installed for that stage. The `PreToolUse`/`BeforeToolCall` hook is only installed when the list is non-empty.
- The `Stop` / `AfterAgent` verifier hook is independent of `read_only_paths` and does not gate tool calls.
- **Enforcement scope:** Claude enforces `read_only_paths` at launch time via a `PreToolUse` hook (writes are blocked before they happen). Gemini enforces it proactively via `--approval-mode default` and restores writes post-hoc via filesystem snapshots (`ACPReadOnlySnapshot`) as belt-and-suspenders. OpenCode generates native permission deny rules in `OPENCODE_CONFIG_CONTENT` and restores writes post-hoc via `ACPReadOnlySnapshot` as belt-and-suspenders. Cursor writes native deny rules to `.cursor/cli.json` (restored after the session) and restores writes post-hoc via `ACPReadOnlySnapshot` as belt-and-suspenders. Codex app-server enforces it after each turn by restoring protected filesystem changes and failing the attempt. External processes or direct filesystem writes outside the agent session are not blocked.
- **OpenCode / Cursor ACP permission mode is opportunistic:** These agents may auto-approve tool calls internally in non-interactive mode even when a non-yolo mode is advertised. Cybervisor may attempt `session/set_mode` as a best-effort supplement, but native harness permissions (`OPENCODE_CONFIG_CONTENT` for OpenCode, `.cursor/cli.json` for Cursor) are the primary proactive layer. When `set_mode` succeeds but zero `session/request_permission` events arrive, a one-time WARNING is logged and a corrective `"post_hoc_only"` marker is appended to `hook-events.jsonl`. Post-hoc snapshot restoration still protects `read_only_paths` regardless.
- Check `.cybervisor/hooks/hook-events.jsonl` for permission decisions — Claude logs `permission_denied`/`permission_allowed` events from the PreToolUse hook; Gemini, OpenCode, and Cursor log `enforcement` events from post-hoc snapshot restorations; Codex logs both `permission_denied` events (from optimistic interception) and `enforcement` events (from snapshot restorations). An `enforcement_mode` event with value `"proactive"` or `"post_hoc_only"` is written at session start for ACP agents. A corrective `"post_hoc_only"` event with `"correction": true` is appended when the first-turn health check detects that proactive enforcement is not actually active.

---

## Pipeline Errors

### Agent receives "CORRECTION REQUIRED" after writing a contract artifact

This is expected behavior — the contract artifact had unexpected fields, a wrong status, or a missing required field. The pipeline returned a repair message instead of failing the stage. The agent should remove the unexpected fields or fix the status and retry.

Common causes:
- An extra field was included that is not in the route's `injections` list. Check the route's `injections` in `cybervisor.yaml` and the auto-injected guidance for which fields are expected.
- The `Status` value does not match any route key (case-insensitive matching is applied, but `Status: APPROVED` vs `Status: approved` may still resolve differently depending on the route key casing).
- A required injected field is missing or empty.

If the agent exhausts `max_retries` without producing a valid artifact, the pipeline aborts — check `.cybervisor/logs/stages/` for the repair messages sent to the agent.

### Stage fails with "Prompt template is missing required context keys"

The `prompt_template` for a stage references a placeholder like `{key}` that is not available in the rendering context. Common causes:

- **Typo in the placeholder name** — check that the key exactly matches the context variable (e.g., `{objective}`, `{stage_name}`).
- **Using a key from a different stage** — some context variables (like injections) are only available on stages that receive them from a previous stage's contract route.
- **Removed a field from `contract.fields`** — if an injection referenced in `prompt_template` was removed from `contract.fields`, the key is no longer available.

The error message lists both the missing keys and the available keys. Fix the `prompt_template` in `cybervisor.yaml` to use only available context keys.

---

## Configuration Validation

### `cybervisor validate` fails with route errors

Common issues:

- A contract stage defines a top-level `next_stage` — contract stages must use `contract.routes` only.
- An `injections` field is not declared in `contract.fields`.
- A route key does not match any `Status` value guidance in the prompt template.

Run with `--show-guidance` to preview the exact instructions generated for the agent:

```bash
cybervisor validate --show-guidance
```

### Contract route references unknown stage

If a `next_stage` value in `contract.routes` or a stage-level `next_stage` references a stage name that does not exist in the `stages` list, `cybervisor validate` catches this at config load time and raises a descriptive error. Fix the typo in `cybervisor.yaml` and re-run `cybervisor validate`.

The pipeline runner also has defense-in-depth handling: if an invalid `next_stage` reaches the runtime, the runner logs an error and aborts gracefully instead of crashing.

---

## Process Cleanup

### ACP adapter subprocess hangs

Each ACP adapter (Gemini, Codex, OpenCode, Cursor) terminates its subprocess with bounded timeouts: close stdin, wait up to 5 seconds for a graceful exit, then SIGTERM (2-second wait), then SIGKILL (5-second wait). If the turn loop encounters an error, the subprocess is terminated in the error path before the exception propagates. Under normal conditions the subprocess exits within the graceful window after `session/close`. If you see a subprocess persisting beyond 12 seconds after stage completion, the pipeline-level process sweep should still catch it.

### Agent-spawned processes remain after pipeline finishes

cybervisor terminates descendant processes at two points: after each stage (process group kill plus individual PID fallback) and after the full pipeline (process-tree sweep). If a process survives both:

- Check `.cybervisor/logs/cybervisor.log.jsonl` for entries with `"status": "Cleanup"` — these show which PIDs were targeted and whether SIGTERM/SIGKILL was sent.
- A process that called `setpgid` or `setsid` to leave the agent's process group and was then reparented to init (because its parent exited) may not be discoverable by the pipeline-level sweep. This is a known limitation.
- To check for remaining processes: `ps aux | grep -E 'vite|npm|node'` or use `psutil` to walk the process tree from the cybervisor process.

### Cleanup logs show "already exited" messages

This is normal and expected. When a process exits between discovery and termination, cybervisor logs a warning and continues. These messages confirm best-effort cleanup is working correctly.

---

## Batch Submit (`--path`)

### Batch stops after one file fails

This is expected behavior — `--path` stops on the first non-zero exit code so you can inspect and fix the problem before continuing. Files already moved to `completed/` are skipped on re-run.

```bash
# Fix the issue, then re-run the same command
cybervisor submit --path prompts/
```

### `--path` directory has no `.md` files

The `--path` directory must contain at least one `.md` file at the top level. Non-`.md` files are ignored, and subdirectories (including `completed/`) are not searched recursively.

```bash
ls prompts/*.md   # confirm .md files exist at the top level
```

### Files are processed in the wrong order

Files are sorted lexicographically by filename. Use zero-padded names for predictable ordering:

```
01-first-task.md    # processed first
02-second-task.md
10-tenth-task.md    # not between 01 and 02
```

### Concurrent batch runs against the same directory

No locking is applied to the prompt directory. Running two `--path` submissions against the same directory concurrently may cause race conditions (e.g., both trying to move the same file to `completed/`). Use separate directories or run batches sequentially.

---

## Encoding and Locale

### Encoding issues in agent output

If agent subprocess output contains garbled characters or encoding error messages:

- Set `PYTHONIOENCODING=utf-8` before running cybervisor:
  ```bash
  export PYTHONIOENCODING=utf-8
  cybervisor "your prompt"
  ```
- Verify your locale supports UTF-8: `locale charmap` should report `UTF-8`.

---

## Still stuck?

Open an issue at https://github.com/crzidea/cybervisor/issues with:

- `cybervisor --version`
- The output of `cybervisor doctor`
- The relevant stage log from `.cybervisor/logs/stages/`
- The contents of `cybervisor.yaml` (redact any sensitive prompts)
