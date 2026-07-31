---
title: Claude Code Agent Guide
---

# Claude Code Agent Guide

> **Audience: Users** — Operators configuring or troubleshooting the Claude Code agent adapter.

The Claude Code adapter enables `cybervisor` to use Claude as a pipeline agent via the `claude-agent-sdk` Python package. It runs in-process (no CLI subprocess) and uses SDK-native options for autonomous, non-interactive operation.

---

## Configuration and Setup

### Prerequisites
- The `claude-agent-sdk` Python package (`>=0.2.87`) is included as a standard Cybervisor dependency — no separate install is required. The minimum version provides the `ThinkingConfigAdaptive` and `ThinkingDisplay` options needed for summarized thinking.
- Authentication is handled by Claude Code through the SDK. Cybervisor passes SDK `setting_sources` for user, project, and local settings, so Claude Code loads `~/.claude/settings.json`, project `.claude/settings.json`, `.claude/settings.local.json`, normal environment variables, and existing Claude Code login credentials.
- `cybervisor doctor` verifies the SDK is importable; Claude authentication failures are surfaced by the SDK when a Claude stage starts.

### Headless and Autonomous Operation
- The Claude adapter uses the SDK's `bypassPermissions` permission mode for fully autonomous operation.
- Disallowed tools (including `EnterPlanMode`, `ExitPlanMode`, and `AskUserQuestion`) are passed through SDK options to prevent interactive prompts that would block automation.
- Claude stages request adaptive thinking with summarized display by default so supported models can emit SDK-provided thinking summaries. Visible assistant text still renders as `reply:` events; only true thinking blocks render as `thinking:`.
- Inside the Cybervisor container, Claude runs as root with `IS_SANDBOX=1` declared in the image, which permits `bypassPermissions`. Host installations do not set this variable — Claude may refuse autonomous permissions when run as host root without the sandbox declaration.

### Settings and evaluation

The Claude adapter does not patch `.claude/settings.json` or install Claude
Code callbacks:
- Contract enforcement and verifier decisions remain Cybervisor-owned after the agent exits.
- Read-only path enforcement uses the shared Git-backed guard to detect protected Git-visible changes without restoring them.
- Reply and contract evaluation runs directly in Cybervisor after the SDK exits.

### Permission Enforcement
- **Disallowed Tools:** Tools that could block automation (e.g., `AskUserQuestion`, `EnterPlanMode`) are denied through SDK `disallowed_tools` options.
- **Read-Only Paths:** Protected file writes are detected and reported without
  restoring them. The stage captures one Git-backed status baseline before its
  attempts begin, then fails if a protected path changes during any attempt.
- **Logging:** Evaluation events are logged to
  `.cybervisor/logs/evaluation-events.jsonl`.

---

## Troubleshooting

### Claude stage reports missing authentication
Cybervisor does not duplicate Claude Code's authentication resolution during preflight. Set credentials in the normal Claude Code locations, then rerun the stage. Supported locations include shell environment variables, `env` entries in Claude settings files, and existing `claude login` credentials.

### Stage fails with read-only path violation
If a stage modifies a file matching its `read_only_paths` configuration, the protected modification remains in place and the stage fails. Adjust the stage's `read_only_paths` or prompt to avoid writing to protected paths.

---

## Stream Output and Cancellation

### Log event classification
- Visible assistant text (Claude `TextBlock`) renders as `reply:` events. Multiline replies appear with a blank line before the indented body; each content line keeps its original leading whitespace from the agent output, so code blocks, nested lists, and other indented structures keep their shape. Single-line replies use the inline format `reply: text`.
- True model thinking (Claude `ThinkingBlock`) renders as `thinking:` events with the same blank-line-and-indent format and per-line leading-whitespace preservation. Visible text is never labeled `thinking:`. Cybervisor requests summarized thinking from the SDK by default; simple prompts may still omit thinking entirely.
- See [Runtime and Daemon (User Guide)](../runtime-user.md#live-stderr-output) for the full log format reference.

### Daemon cancellation
The Claude adapter runs in-process via a background thread. When you run `cybervisor cancel`, the daemon cancels the running SDK worker task on its event loop thread and then joins the thread. Cancellation interrupts the in-flight SDK call so the async iteration unwinds cleanly, the SDK generators close without error, and the stage stops promptly with exit code 130 — the SDK thread does not continue after cancellation.
