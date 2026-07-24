---
title: Pipeline Execution Troubleshooting
---

# Pipeline Execution Troubleshooting

> **Audience: Users** — Pipeline operators encountering errors during pipeline runs.

---

## Workspace and Locks

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

---

## Agent and Adapter Execution

### Agent exits immediately with no output

- Confirm subprocess agents are installed with `codex --version` or `opencode --version`.
- Claude, Cursor, and Antigravity use in-process Python SDKs bundled with Cybervisor. Cursor reads its API key only from `agents.cursor.api_key` in the active config. Run `cybervisor doctor` to verify the selected adapter and its authentication.
- Check preflight output at the top of the run for missing prerequisites.
- For agent-specific prerequisites, auth, or session timeouts, see the [Supported Agents Reference](../troubleshooting/index.md#agent-specific-guides-and-troubleshooting).

### `tool call:` lines show only a title
Live stderr builds `tool call:` lines from each agent's structured events. 
- A label-only line is normal when the event has no arguments. 
- For protocol-based agents, summaries appear only when the tool payload includes usable argument fields.
- For serve-based agents like OpenCode, summaries appear from SSE event payloads. (OpenCode deduplicates bare tool-call start events and suppresses lifecycle/metadata events from stderr, though they still appear in the JSONL stage log).
- For Antigravity, summaries appear from SDK streaming callbacks.
- If summaries disappeared or look wrong after upgrading the agent CLI or SDK, compare the live line with the corresponding `tool_call` entry in `.cybervisor/logs/stages/`. Cursor and Antigravity record SDK events; OpenCode records HTTP/SSE events. Maintainers extending support for new payload shapes should update that agent adapter's translation or tool-mapping layer, not shared stream rendering — see [Adding a Coding-Agent Adapter](/contributing/adding-an-adapter.html).

---

## Write Protection (`read_only_paths`)

### Agent is blocked from writing to a file

If the agent reports "Path X is protected by the pipeline (read_only_paths)", the file matches a pattern in the current stage's `read_only_paths` in `cybervisor.yaml`.

- Check your stage's `read_only_paths` patterns — they use path-segment glob matching resolved relative to the workspace root. `*` matches within one path segment, and `**` matches zero or more path segments. For example, `src/**` matches all files under `src/`, and `**/*.py` matches Python files at any depth.
- If the block is unexpected, verify the pattern isn't too broad. For example, `**/*.py` blocks all Python files project-wide. Use a narrower pattern such as `src/**/*.py` when only one tree should be protected.
- Bash commands that write to protected paths (`>`, `>>`, `sed -i`, `tee`) are detected and restored by post-hoc snapshot enforcement or blocked by native adapter permission rules. Restructure the command to avoid writing to protected paths.

### `read_only_paths` is not blocking writes

- Confirm `read_only_paths` is set on the relevant stage in `cybervisor.yaml` (it is a per-stage field, not a top-level field or a `~/.cybervisor/config.yaml` field).
- Empty or absent `read_only_paths` for a stage means no write protection is installed for that stage. Adapter-level read-only enforcement is only active when the list is non-empty.
- The `Stop` / `AfterAgent` verifier hook is independent of `read_only_paths` and does not gate tool calls.
- **Enforcement scope:** 
  - Claude uses post-hoc filesystem snapshots that detect and restore protected-file modifications after each stage — the stage fails if a protected path was modified.
  - Cursor uses snapshot-only post-hoc enforcement after each SDK turn. A protected file can be changed briefly before restoration, so use a read-only mount when pre-write prevention is required.
  - OpenCode generates native permission deny rules in `OPENCODE_CONFIG_CONTENT`.
  - Codex app-server enforces it after each turn by restoring protected filesystem changes and failing the attempt.
  - Antigravity uses SDK capabilities where supported and post-hoc snapshots.
  - External processes or direct filesystem writes outside the agent session are not blocked.
- Check `.cybervisor/hooks/hook-events.jsonl` for snapshot enforcement events. Cursor has no proactive enforcement mode.

---

## Retry Continuation

### "Retry continuation unavailable" in logs

This warning means the pipeline tried to continue a prior agent session on retry but could not, so it fell back to a fresh session. Common reasons:

- **`adapter_does_not_support_continuation`** — The adapter for this stage does not have a native session-resume mechanism. All adapters other than OpenCode currently fall back to fresh retries. This is expected and does not indicate a problem.
- **`no_prior_session_id`** — The previous attempt did not capture a session ID (e.g., the adapter crashed before the session was established). The retry starts a new session instead.
- **`serve_process_exited_with_code_<n>`** — OpenCode-specific. The prior `opencode serve` subprocess is no longer running. The exit code is appended to the reason.
- **`serve_health_check_failed`** — OpenCode-specific. The serve process is alive but the `/global/health` endpoint did not respond. Cybervisor starts a new serve instance and session.

In all cases, the retry still proceeds normally — the stage gets a fresh agent session with the original prompt. Retry counts and `max_retries` are unaffected.

### Retry appears to restart from the beginning

If the adapter does not support retry continuation (adapters other than OpenCode), each retry starts a new agent session with the original prompt. To reduce duplicated work on retry, consider reducing `max_retries` or restructuring the stage into smaller units.

---

## OpenCode Idle Timeout

### Stage fails with `idle_timeout_failed` event

This means the OpenCode adapter detected no SSE activity for the configured idle window (default 600 seconds).

**Common causes:**
- The OpenCode server became unresponsive or crashed silently.
- Network issues prevented SSE events from reaching the adapter.
- The agent entered a state where it stopped emitting events.

**Diagnostic steps:**
1. Check `.cybervisor/logs/stages/<stage_name>.jsonl` for the last SSE events before the timeout.
2. Look for `idle_timeout_failed` in the stage log to confirm the timeout event.
3. Check for `sse_transport_error` or `sse_transport_reconnect_failed` entries that may indicate transport issues.

**Resolution:**
- The pipeline's normal retry-continuation policy handles the failure automatically.
- If timeouts occur frequently, consider increasing the timeout via `CYBUPERVISOR_OPENCODE_IDLE_TIMEOUT` in the test environment.
- Ensure the OpenCode server is healthy before starting the pipeline with `cybervisor doctor`.

### `No SSE activity for <N>s; the stage attempt is failing`

This error message appears when the idle timeout triggers. The adapter aborts the session and fails the current attempt. The pipeline may retry if `max_retries` budget remains.

**Key behaviors:**
- Every SSE event (including heartbeats and metadata) resets the idle timer.
- A clean stream EOF is treated identically to a silent timeout.
- No recovery prompt is sent and no force-stop loop runs.
- The pipeline's normal retry-continuation policy decides what happens next.

---

## Resumed Stage Continuation

### "Last session available but adapter does not support continuation"

This message means cybervisor found a persisted session id from the previous run but the current adapter cannot resume sessions. The stage starts as a fresh attempt. The full log line is `[<stage>] Last session available but adapter '<name>' does not support continuation; starting fresh`. This is expected for adapters other than OpenCode.

### "Last session not reusable" in logs

This message means cybervisor found persisted session metadata but it did not match the current invocation. Common reasons:

- **No persisted metadata** (`no_session_metadata`) — There is no `.cybervisor/latest-session.json` in the workspace (e.g., the previous run never captured a session id, or the file was deleted). The stage starts as a fresh attempt.
- **Stage name mismatch** (`stage_mismatch`) — You resumed at a different stage than the one that captured the session id.
- **Adapter name mismatch** (`adapter_mismatch`) — The current adapter differs from the one that captured the session id (e.g., you changed `agent_tool` or the stage uses a `stage_agents` override).
- **Workspace root mismatch** (`workspace_mismatch`) — You are running from a different working directory than the original run.
- **Empty session id** (`empty_session_id`) — The persisted metadata is structurally valid but contains a blank `session_id`. Treat it as no metadata available and start fresh.
- **Persisted session not reusable** (`persisted_continuation_unavailable`) — The metadata matched, but the live serve session (for example, `opencode serve`) is not reachable, so a fresh session is started. This is the typical fallback when you run `--resume` after a previous OpenCode session has fully exited.

In all cases, the stage starts as a fresh attempt. To reuse the session, resume at the same stage with the same adapter from the same working directory and use `--resume`.

### `--resume` fallback preserves `.cybervisor/latest-session.json`

When `--resume` is set and the resume falls back to a fresh attempt, the new session id is **not** written to `.cybervisor/latest-session.json`. The original persisted metadata stays in place so a follow-up `--resume` still points at the persisted session id (the one captured by the last successful run). The fresh-fallback log line (`SessionResumeFallback` with `fallback_reason: persisted_continuation_unavailable` or one of the mismatch reasons) is the audit signal.

If the metadata file is missing entirely when `--resume` is requested, the fresh-fallback path also does not create a new file. The file is written only when a normal (non-resume) run starts a new session.

### `--resume` requires a start stage

If you run `cybervisor run "task" --resume` without `--start-from`, the command exits with a clear error:

```
--resume requires --start-from to specify which stage to resume at.
```

No pipeline state or adapter session is created.

---

## Pipeline and Contract Errors

### Agent receives "CORRECTION REQUIRED" after writing a contract artifact

This is expected behavior — the contract artifact had unexpected fields, a wrong status, or a missing required field. The pipeline returned a repair message instead of failing the stage. The agent should remove the unexpected fields or fix the status and retry.

Common causes:
- An extra field was included that is not in the route's `injections` list. Check the route's `injections` in `cybervisor.yaml`.
- The `Status` value does not match any route key (case-insensitive matching is applied, but `Status: APPROVED` vs `Status: approved` may still resolve differently depending on the route key casing).
- A required injected field is missing or empty.
- `Completed Tasks` is missing or incomplete when `contract.required_tasks` is configured. The repair message names the exact missing task strings — continue the work and list each one.

If the agent exhausts `max_retries` without producing a valid artifact, the pipeline aborts. Check `.cybervisor/logs/stages/` for the repair messages sent to the agent.

### Stage fails with "Prompt template is missing required context keys"

The `prompt_template` for a stage references a placeholder like `{key}` that is not available in the rendering context. Common causes:

- **Typo in the placeholder name** — check that the key exactly matches the context variable (e.g., `{objective}`, `{stage_name}`).
- **Using a key from a different stage** — some context variables (like injections) are only available on stages that receive them from a previous stage's contract route.
- **Removed a field from `contract.fields`** — if an injection referenced in `prompt_template` was removed from `contract.fields`, the key is no longer available.

The error message lists both the missing keys and the available keys. Fix the `prompt_template` in `cybervisor.yaml` to use only available context keys.

### Hook verifier returns `block` on every invocation

The verifier LLM is rejecting the hook decisions. Common causes:

- The verifier model is too restrictive. Try a different model in `~/.cybervisor/config.yaml`.
- The stage contract artifact is malformed. Inspect the artifact under `.cybervisor/contracts/artifacts/` and compare it to the expected schema. Contract-enabled stages validate locally — every `block` from a contract stage is a local decision, not a verifier response.
- The hook verifier endpoint is unreachable. Check `cybervisor doctor`.
- `llm.api_key` is missing or empty. This key is required only for non-contract stages that need model-assisted stop verification. Contract-only stage slices can run without it.

For testing with deterministic approvals, use the mock LLM API:

```bash
python3 scripts/.e2e_mock_llm_api.py --hook-mode allow &
# Then point llm.base_url at the printed URL
```

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

## Encoding and Locale

### Encoding issues in agent output

If agent subprocess output contains garbled characters or encoding error messages:

- Set `PYTHONIOENCODING=utf-8` before running cybervisor:
  ```bash
  export PYTHONIOENCODING=utf-8
  cybervisor "your prompt"
  ```
- Verify your locale supports UTF-8: `locale charmap` should report `UTF-8`.
