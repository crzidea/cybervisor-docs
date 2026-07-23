---
title: Adding a Coding-Agent Adapter
---

# Adding a Coding-Agent Adapter

> **Audience: Developers** — Contributors adding new coding-agent adapters.

This guide defines the maintainer contract for adding a new coding-agent adapter under `src/cybervisor/adapters/`.

## Shared vs Adapter-Owned Responsibilities

Shared `cybervisor` orchestration owns:

- loading and validating `cybervisor.yaml`
- prompt rendering, retries, routing, and final artifact validation
- shared non-secret hook runtime metadata under `.cybervisor/hooks/`
- verifier configuration from `~/.cybervisor/config.yaml`
- signal handling, run logging, and status transitions

Each adapter owns:

- canonical adapter identity and discovery metadata
- stage launch and process or worker startup behavior
- preflight requirements for binaries, SDK packages, and global config prerequisites
- conversion from raw tool output into cybervisor's canonical event model
- hook settings install/remove behavior for tool-specific settings files
- wiring the tool's native hook system to the packaged `cybervisor-agent-hook` entry point without changing the socket event schema

Protocol adapters should reuse the matching shared transport helpers for process
startup, termination, event conversion, and post-reply verification. In-process
SDK adapters should isolate proprietary imports behind a testable seam, run
blocking APIs outside the pipeline thread, and expose events through a
thread-safe queue.

All ACP adapter transports must call `terminate_process` (from `cybervisor.adapters._process`) in two places:

- **`transport.close()`** — replaces any inline `stdin.close()` + `process.wait()` with `terminate_process(self._process)`, which handles stdin closure, bounded-timeout waits, and signal escalation (graceful → SIGTERM → SIGKILL) in a single call. The return value is the process exit code.
- **`handle.wait()` error path** — in the `except` block wrapping `_run()`, call `terminate_process(self._process)` before re-raising. This ensures orphaned processes are terminated even when the turn loop fails. The `finally` block for event loop cleanup (`shutdown_asyncgens()` + `loop.close()`) must be preserved — `terminate_process` goes in `except`, not `finally`.

## Required Contract Members

Every adapter must provide:

- a non-empty `descriptor` with `name`, `display_name`, and `directory`
- `start(request)` returning a normalized running-process handle
- `parse_output_line(line)` returning canonical event(s) for shared rendering
- `preflight_requirements()` describing required binaries and env vars
- `settings_path()`, `install_hook_settings()`, and `remove_hook_settings()` if `supports_hooks=True` and `requires_native_hook_settings()=True`; in-process SDK adapters such as Cursor and Antigravity return `False` and use no settings path

### Retry Continuation Support

Adapters that can resume a previous agent session on retry should set `supports_retry_continuation: True` in `AdapterCapabilities` and return a `session_id` from the running-process handle after each attempt. When a retry occurs and the adapter supports continuation, the pipeline runner passes the captured session ID through `LaunchRequest.retry_session_id` and a generated continuation prompt through `LaunchRequest.continuation_prompt`.

The adapter is responsible for:
- capturing a session ID (or equivalent handle) from the running process and exposing it so the runner can persist it
- using `retry_session_id` to resume the prior session via the adapter's native mechanism (e.g., ACP `session/load`)
- using `continuation_prompt` instead of the original prompt when resuming successfully, so the agent knows to continue rather than restart
- falling back to a fresh session (ignoring `retry_session_id`) if the resume mechanism fails before the turn starts

Adapters that do not support session resumption leave `supports_retry_continuation` at its default (`False`). The runner then uses the existing fresh-retry path with no session ID or continuation prompt.

### Adapter-Owned Hook Decision Formatting

Adapters must provide their own formatting for hook decisions and tool-use permissions instead of relying on global agent-name conditionals. Each adapter implements the following methods:

| Method | Description |
|--------|-------------|
| `format_tool_use_allow()` | Return an allow decision in the adapter-specific output format |
| `format_tool_use_block(reason)` | Return a block/deny decision with the given reason |
| `format_hook_output(decision)` | Convert a `HookDecision` to adapter-specific output |
| `make_contract_blocking_decision(message)` | Create a `HookDecision` for contract validation failures |
| `make_blocking_decision(reason)` | Create a `HookDecision` for verifier-unavailable fallback |
| `extract_verifier_response(output, *, stage_prompt, payload)` | Extract the final response text from raw agent output for verifier evaluation |

The base adapter provides generic defaults suitable for most agents (returning `{"decision": "allow"}` and `{"decision": "deny", ...}`). Adapters with native hook formats (e.g., Claude's `hookSpecificOutput`) override these methods with their own format-specific payloads.

The hook runtime reaches the selected adapter through the shared adapter registry (`get_adapter(agent_tool)`) and calls these methods rather than branching on concrete agent names. This keeps global pipeline code agent-neutral and makes new adapters easier to add.

## Canonical Event Model Contract

Structured-stream adapters do not render final stderr strings directly. They must convert tool-specific raw output into cybervisor's internal canonical event model, and the shared renderer is the only code that turns those events into human-readable stderr lines.

The canonical model, not Claude Code raw JSON, is the adapter boundary. Current built-in event categories cover:

- session or system start metadata
- assistant thinking text
- assistant reply text
- tool call with normalized tool name and summarized arguments
- tool result marker
- hook feedback
- completion summary
- plain-text fallback for unsupported or malformed lines

This means:

- the Claude adapter converts `claude-agent-sdk` message objects (text blocks, tool-use blocks, thinking blocks, result messages) into canonical events via the SDK handle
- protocol adapters convert transport notifications into canonical events; OpenCode converts serve HTTP events; in-process SDK adapters such as Cursor and Antigravity bridge SDK messages through a thread-safe queue
- shared rendering keeps the user-facing stderr vocabulary stable across adapters

Maintain each parser against captured output from its real transport or SDK. Tool
calls must resolve to shared formatter names and normalized argument keys. Put
agent-specific names and field aliases in the adapter's `tool_mapping.py`; do
not hand-format stream output or fork the shared renderer.

## Hook Wiring Contract

Hook-capable adapters that use native settings patching (`requires_native_hook_settings()=True`) must patch the tool's settings so the tool invokes:

- `uv run cybervisor-agent-hook --config <absolute path to .cybervisor/hooks/hook_config.json>`

No current built-in adapter uses native settings patching. Cursor, Claude, and
Antigravity use in-process SDKs with no settings path. Cursor handles contract
and verifier decisions in its same-session turn loop. OpenCode also avoids the
hook listener and delegates evaluation to the shared evaluator.

Adapter-owned hook behavior for settings-patching adapters is limited to:

- locating the tool settings file
- inserting the correct native hook entry shape for that tool
- removing that hook entry during cleanup

Adapters must not:

- write verifier secrets into `.cybervisor/hooks/`
- bypass the packaged `cybervisor-agent-hook` entry point with a custom socket emitter
- change event names or field meanings on the Unix socket

## Unix Socket Event Spec

The active event transport is the Unix socket path stored in `.cybervisor/hooks/hook_config.json` as `socket_path`. The shared hook runtime sends UTF-8, newline-delimited JSON objects over `AF_UNIX` `SOCK_STREAM`.

Transport rules:

- one JSON object per line
- each event is also appended to `.cybervisor/logs/hook-events.jsonl`
- socket send failures are best-effort and must not crash the hook path
- payloads must remain JSON objects; malformed lines are ignored by the listener

Required top-level fields for emitted events:

- `timestamp`: UTC ISO-8601 string
- `event`: stable event name
- `message`: short human-readable summary
- `agent_tool`: canonical adapter name such as `claude` or `cursor`
- `pid`: hook process pid
- `config_path`: absolute path to the hook runtime config used for the event

Optional top-level fields:

- `hook_input`: raw tool hook input string
- `verifier_output`: raw model output before structured parsing
- `decision`: normalized shared decision enum, `approve` or `block`
- `reason`: normalized shared reason string
- `error`: error string for failures or validation issues

Stable event names currently consumed by `cybervisor`:

- `hook_invocation_started`
- `hook_input_captured`
- `verifier_request_started`
- `verifier_response_received`
- `verifier_regeneration_requested`
- `contract_validation_failed`
- `contract_validation_passed`
- `final_attempt_bypass`
- `decision_emitted`
- `fallback_error_emitted`

## Decision Payload Contract

Shared hook logic consumes only the normalized `decision` and `reason` fields.

Normalized shared decision fields:

- `decision`: `approve` or `block`
- `reason`: non-empty string

Tool-facing adapter payloads may still vary by tool internally:

- Claude-style continue path: `{}`
- Claude-style block path: `{"decision":"block","reason":"..."}`

Blocking semantics are derived centrally by `HookEventListener` from normalized shared decisions only:

- `decision == "block"`

If `hook_input` contains a JSON object with `session_id`, adapters and hook shims must preserve it so stale blocking decisions can be cleared correctly.

## Validation Checklist

Before an adapter is considered complete:

- register it in the shared registry so `load_global_config().agent_tool` resolves through one source of truth
- confirm unsupported adapter names fail fast during config validation or preflight
- verify launch output renders correctly in stderr and stage logs
- verify adapter-owned raw-log conversion produces canonical events rather than final strings
- confirm hook install/remove matches the tool settings structure without moving shared autonomy rules
- confirm hook-capable adapters preserve the shared Unix-socket event schema and decision semantics
- choose and document each adapter's read-only enforcement model
- use the shared snapshot utility before and after Cursor SDK turns
- reuse `ACPReadOnlySnapshot` rather than creating an adapter-local snapshot class
- use native deny rules for OpenCode and supported SDK capabilities plus post-hoc snapshots for Antigravity
- run `uv run pytest`
- run `uv run mypy --strict src/`
- run `uv run ruff check src/`

## Maintenance Notes

- Keep verifier configuration in `~/.cybervisor/config.yaml`; adapters must not own verifier secrets or persist them under `.cybervisor/hooks/`.
- Keep shared supervision rules centralized. Do not move retry, routing, or artifact-validation logic into adapters.
- Add or update nearby adapter README files when behavior changes so maintainers do not need to reverse-engineer built-in adapters.
