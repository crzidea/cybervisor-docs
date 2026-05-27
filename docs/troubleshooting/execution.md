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

- Confirm the selected agent is installed: `claude --version`, `gemini --version`, `codex --version`, `opencode --version`, or `cursor-agent --version` (Cursor uses the `cursor-agent` binary on `PATH`).
- Antigravity uses an in-process Python SDK, not a CLI binary — check that the SDK is importable: `python -c "import google.antigravity"`.
- Check preflight output at the top of the run for missing prerequisites.
- For agent-specific prerequisites, auth, or session timeouts, see the [Supported Agents Reference](../troubleshooting/index.md#agent-specific-guides-and-troubleshooting).

### `tool call:` lines show only a title
Live stderr builds `tool call:` lines from each agent's structured events. 
- A label-only line is normal when the event has no arguments. 
- For ACP-based agents, summaries appear only when the `session/update` tool payload includes usable argument fields.
- For serve-based agents like OpenCode, summaries appear from SSE event payloads. (OpenCode deduplicates bare tool-call start events and suppresses lifecycle/metadata events from stderr, though they still appear in the JSONL stage log).
- For Antigravity, summaries appear from SDK streaming callbacks.
- If summaries disappeared or look wrong after upgrading the agent CLI or SDK, compare the live line with the corresponding `tool_call` entry in `.cybervisor/logs/stages/` (ACP JSON-RPC transcript for Gemini/Cursor, HTTP/SSE stage log for OpenCode, SDK event log for Antigravity). Maintainers extending support for new payload shapes should update that agent adapter's `tool_mapping.py` or `_handle.py`, not `stream_logging.py` — see [Adding a Coding-Agent Adapter](/contributing/adding-an-adapter.html).

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
- **Enforcement scope:** 
  - Claude enforces `read_only_paths` at launch time via a `PreToolUse` hook (writes are blocked before they happen). 
  - Gemini and Cursor enforce it via post-hoc filesystem snapshots (`ACPReadOnlySnapshot`) as belt-and-suspenders. Cursor also writes native deny rules to `.cursor/cli.json`.
  - OpenCode generates native permission deny rules in `OPENCODE_CONFIG_CONTENT` (serve mode enforces `read_only_paths` through these native rules; there is no ACP `session/set_mode` or `session/request_permission` flow).
  - Codex app-server enforces it after each turn by restoring protected filesystem changes and failing the attempt.
  - Antigravity uses SDK capabilities where supported and post-hoc snapshots.
  - External processes or direct filesystem writes outside the agent session are not blocked.
- Check `.cybervisor/hooks/hook-events.jsonl` for permission decisions to verify enforcement mode (`"proactive"` vs `"post_hoc_only"`).

---

## Pipeline and Contract Errors

### Agent receives "CORRECTION REQUIRED" after writing a contract artifact

This is expected behavior — the contract artifact had unexpected fields, a wrong status, or a missing required field. The pipeline returned a repair message instead of failing the stage. The agent should remove the unexpected fields or fix the status and retry.

Common causes:
- An extra field was included that is not in the route's `injections` list. Check the route's `injections` in `cybervisor.yaml`.
- The `Status` value does not match any route key (case-insensitive matching is applied, but `Status: APPROVED` vs `Status: approved` may still resolve differently depending on the route key casing).
- A required injected field is missing or empty.

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
- The stage contract artifact is malformed. Inspect the artifact under `.cybervisor/contracts/artifacts/` and compare it to the expected schema.
- The hook verifier endpoint is unreachable. Check `cybervisor doctor`.

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
