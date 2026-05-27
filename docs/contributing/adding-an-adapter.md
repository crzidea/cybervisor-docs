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
- stage launch command construction and process startup behavior
- preflight requirements for binaries and global config prerequisites
- conversion from raw tool output into cybervisor's canonical event model
- hook settings install/remove behavior for tool-specific settings files
- wiring the tool's native hook system to the packaged `cybervisor-agent-hook` entry point without changing the socket event schema

ACP adapters should reuse `cybervisor.adapters.acp` for common stdio startup, PATH preflight messages, no-op native hook settings, `session/request_permission` decisions, `ACPReadOnlySnapshot` (for post-hoc read-only path enforcement), JSON-RPC helpers, `extra_env` (for injecting environment variables into the subprocess), and post-reply verifier evaluation. `ACPAdapterBase.extra_env` is a `ClassVar[dict[str, str]]` that subclasses can override to merge custom variables into the subprocess environment — the base `start()` method builds `env = {**os.environ, **self.extra_env}` and passes `env=` to `subprocess.Popen`. The default is `{}`; adapters that need custom environment variables (e.g., feature flags, API endpoint overrides) should set this class variable rather than patching `os.environ`. Adapter-owned ACP code should be limited to protocol method names, authentication/session lifecycle differences, notification parsing, and any agent-specific turn-loop behavior.

All ACP adapter transports must call `terminate_process` (from `cybervisor.adapters._process`) in two places:

- **`transport.close()`** — replaces any inline `stdin.close()` + `process.wait()` with `terminate_process(self._process)`, which handles stdin closure, bounded-timeout waits, and signal escalation (graceful → SIGTERM → SIGKILL) in a single call. The return value is the process exit code.
- **`handle.wait()` error path** — in the `except` block wrapping `_run()`, call `terminate_process(self._process)` before re-raising. This ensures orphaned processes are terminated even when the turn loop fails. The `finally` block for event loop cleanup (`shutdown_asyncgens()` + `loop.close()`) must be preserved — `terminate_process` goes in `except`, not `finally`.

## Required Contract Members

Every adapter must provide:

- a non-empty `descriptor` with `name`, `display_name`, and `directory`
- `start(request)` returning a normalized running-process handle
- `parse_output_line(line)` returning canonical event(s) for shared rendering
- `preflight_requirements()` describing required binaries and env vars
- `settings_path()`, `install_hook_settings()`, and `remove_hook_settings()` if `supports_hooks=True` and `requires_native_hook_settings()=True` (ACP adapters like Gemini and Cursor return `requires_native_hook_settings()=False`; OpenCode returns `requires_native_hook_settings()=False` and `uses_hook_listener()=False`; in-process SDK adapters like Antigravity return `requires_native_hook_settings()=False`, `uses_hook_listener()=False`, and `settings_path()` returns `None` — the SDK is a standard Cybervisor dependency, not an optional install)

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

- the Claude adapter converts Claude Code `stream-json` lines into canonical events
- ACP adapters (Gemini, Codex, Cursor) convert ACP `session/update` notifications into the same canonical events; OpenCode converts serve HTTP events into canonical events; in-process SDK adapters (Antigravity) bridge SDK streaming callbacks to canonical events via a thread-safe queue
- shared rendering keeps the user-facing stderr vocabulary stable across adapters

For ACP adapters specifically, maintain the notification parser against captured real ACP session output. Do not assume notification shapes are identical across agents.
Gemini and Cursor share ACP permission and verifier evaluation helpers, but each keeps its own notification parser because real `session/update` payloads differ by agent. OpenCode uses serve-mode HTTP and has its own event parser.
Tool-call notifications must resolve to the same canonical tool names and normalized argument keys as other ACP agents. Put agent-specific kind, title, content-type, and field-alias mappings in that adapter's own `tool_mapping.py`, and reuse the generic `cybervisor.adapters.acp.stream` helpers to apply them so stderr summaries stay uniform; do not hand-format `tool call:` lines in adapter code or fork the shared renderers for one agent.

## Hook Wiring Contract

Hook-capable adapters that use native settings patching (`requires_native_hook_settings()=True`) must patch the tool's settings so the tool invokes:

- `uv run cybervisor-agent-hook --config <absolute path to .cybervisor/hooks/hook_config.json>`

Currently only the Claude adapter uses native settings patching. ACP adapters (Gemini, Codex, Cursor) have `requires_native_hook_settings()=False` and handle contract enforcement and verifier decisions via `evaluate_reply()` inline in the adapter turn loop, not through the hook listener subprocess. OpenCode also has `requires_native_hook_settings()=False` and `uses_hook_listener()=False`, delegating evaluation to the shared `evaluate_acp_reply` function.

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
- `agent_tool`: canonical adapter name such as `gemini` or `claude`
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
- for ACP adapters, integrate `ACPReadOnlySnapshot` into the transport's turn loop (snapshot before first turn, validate/restore after each turn) so `read_only_paths` is enforced even though the agent never emits `session/request_permission` for file writes; OpenCode uses native permission deny rules in `OPENCODE_CONFIG_CONTENT` instead of `ACPReadOnlySnapshot`; in-process SDK adapters (Antigravity) pass capabilities to the SDK config when supported and use `ACPReadOnlySnapshot` for post-hoc validation/restore after the agent run completes
- run `uv run pytest`
- run `uv run mypy --strict src/`
- run `uv run ruff check src/`

## Maintenance Notes

- Keep verifier configuration in `~/.cybervisor/config.yaml`; adapters must not own verifier secrets or persist them under `.cybervisor/hooks/`.
- Keep shared supervision rules centralized. Do not move retry, routing, or artifact-validation logic into adapters.
- Add or update nearby adapter README files when behavior changes so maintainers do not need to reverse-engineer built-in adapters.
