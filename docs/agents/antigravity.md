---
title: Antigravity Harness Guide
---

# Antigravity Harness Guide

> **Audience: Users** — Operators configuring or troubleshooting the Antigravity harness adapter.

Cybervisor forwards any normalized explicit effort through the native `agy --effort` flag; omitting effort leaves the CLI default untouched. The installed CLI and selected model decide validity. When startup stderr clearly reports an invalid CLI argument and no terminal stream result exists, the stage ends on its first attempt. Authentication failures and failures with a terminal result remain retryable.

Cybervisor runs the official Antigravity CLI in headless mode. It requires `agy` version 1.1.8 or newer with `stream-json` output.

## Install and authenticate

On macOS or Linux:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

The installer normally places `agy` in `~/.local/bin`. Ensure that directory is on `PATH`, then launch the interactive client once:

```bash
agy
```

Complete browser or device-flow sign-in and exit the client. Cybervisor does not install, upgrade, authenticate, or edit the persistent Antigravity settings file. Run `cybervisor doctor` after setup.

## Autonomous permission ownership

Cybervisor launches managed stages with `--dangerously-skip-permissions`. This prevents an unattended run from waiting for an approval or silently skipping required work.

Cybervisor remains responsible for the execution boundary:

- `read_only_paths` uses the shared Git-backed change guard.
- Stage contracts validate required deliverables.
- Verifier decisions control completion for stages without contracts.

The command-line permission override applies only to the child process. Cybervisor never migrates or modifies `~/.gemini/antigravity-cli/settings.json`.

## Models, timeouts, and conversations

- A `stage_overrides` model value is passed verbatim with `--model`. An invalid value fails loudly; Cybervisor never substitutes a default.
- Headless runs use a one-hour print timeout by default.
- Set `CYBERVISOR_ANTIGRAVITY_PRINT_TIMEOUT` to a positive number of seconds to override it. Values above 86,400 seconds are capped.
- When a contract or verifier blocks a completed turn, Cybervisor relaunches `agy` against the captured conversation with `--conversation <id>` and a focused continuation prompt. This repairs the stage in-session rather than immediately retrying the whole stage.
- Eligible pipeline retries also resume the captured conversation. If the CLI explicitly reports that the conversation is unavailable, Cybervisor stops the continuation loop and uses the normal failure path. Authentication, model, permission, and timeout errors do not trigger a fresh conversation.
- A stage attempt allows up to 25 continuation turns.

## Live stream output

Stage logs render the `stream-json` events that `agy` actually emits:

- `tool call:` for every tool step, with its parameters.
- `tool result received (...)` with a bounded summary. Output that spans multiple lines or exceeds 200 characters is reduced to a `<n> lines, <m> chars` count so one log entry stays on one line.
- `reply:` for assistant text.
- `agent error: ...` for CLI error steps, or `agent error reported (no detail)` when the step carries no message.

Two limits come from the CLI itself, not from Cybervisor:

- **No `thinking:` events.** The CLI reports reasoning only as a `usage.thinking_tokens` count and never streams the reasoning text. No CLI flag exposes it; `--effort` changes reasoning depth, not visibility.
- **Replies arrive at the end.** The CLI attaches assistant text only to the final `agent_response` step. Intermediate steps carry usage totals with no text, so there is no running narration between tool calls.

Full raw events are always retained in the stage JSONL log under `.cybervisor/logs/stages/`.

## Cancellation

`cybervisor cancel` or a foreground interrupt sends `SIGINT` to the real `agy` process group. The CLI gets a brief opportunity to emit an `INTERRUPTED` result, after which Cybervisor applies bounded termination and descendant cleanup. A Cybervisor-requested cancellation exits with status 130.

## Troubleshooting

### `agy` was not found

Re-run the install command, add `~/.local/bin` to `PATH`, and verify:

```bash
agy --version
```

### Unsupported CLI or missing `stream-json`

Cybervisor requires version 1.1.8 or newer. Re-run the official installer to upgrade. For a repackaged build with an unrecognized version string, `cybervisor doctor` checks `agy --help` for the required output capability.

### Authentication failure

Run `agy` interactively and complete sign-in. Headless Cybervisor stages close stdin and terminate any authentication prompt, so they fail with setup guidance instead of waiting for interactive login.

### Non-`SUCCESS` result

`ERROR`, `CANCELED`, `INTERRUPTED`, `INVALID`, `WAITING`, and `RUNNING` are failures even when `agy` exits with code 0. Review the CLI error and diagnostic tail shown by Cybervisor. A missing terminal result also fails the stage.

## Native conversation discovery

Antigravity stores conversations in its normal CLI store because Cybervisor inherits the ambient process environment and does not redirect the database. The verified CLI has no separate conversation-list command. Use the identifier from `.cybervisor/latest-session.json` with `agy --conversation <session-id>`; recognition of that exact identifier is the native discovery boundary. Exit without sending a prompt when inspecting only addressability.
