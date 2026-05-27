---
title: Cursor Agent Guide
---

# Cursor Agent Guide

> **Audience: Users** — Operators configuring or troubleshooting the Cursor agent adapter.

The Cursor adapter enables `cybervisor` to use Cursor CLI (`cursor-agent`) as a pipeline agent. It communicates over stdio using JSON-RPC via the Agent Connection Protocol (ACP).

---

## Configuration and Setup

### Prerequisites
- Requires the `cursor-agent` CLI on `PATH`.
- ACP mode support must be available (`cursor-agent acp` must be available).
- CLI check command: `cursor-agent acp --help` (should exit with code 0).

### Authentication
Before starting the pipeline, authenticate either via environment variables or interactive login:
- Set `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN` in the environment.
- Or run `cursor login` to authenticate interactively.
- The adapter sends an ACP `authenticate` request (method `cursor_login`) during the initial handshake.

### Permission Enforcement
Cursor enforces write protection using two layers:
1. **Proactive Permissions:** The adapter generates native Cursor CLI permission rules from Cybervisor's `read_only_paths` setting and writes them to the project-level `.cursor/cli.json` before launching the agent. (The original `.cursor/cli.json`, if it exists, is backed up and restored after the session completes).
2. **Post-Hoc Snapshots:** `ACPReadOnlySnapshot` is used as a belt-and-suspenders layer. It compares file hashes before and after each turn and restores any protected-file modifications (from ACP tool calls, bash commands, or child processes).
3. **Disallowed Tools:** The `session/request_permission` flow is used to deny disallowed tools (e.g. `question` tool kind).

---

## Troubleshooting

### WARNING: "proactive enforcement may not be active"
You may see a WARNING log like:
```
agent accepted set_mode to 'default' but emitted zero session/request_permission events; 'default' is an agent execution mode (not a permission-asking mode), so only post-hoc ACPReadOnlySnapshot enforcement is active
```
- **Cause:** Cybervisor requested `set_mode` to switch the agent to a non-yolo approval mode, but the agent never sent permission request events. This happens if the Cursor version is older or does not honor the mode.
- **Impact:** ACP-level proactive denial via `session/request_permission` is inactive. However, Cursor still applies native deny rules from `.cursor/cli.json` and post-hoc snapshot restoration for `read_only_paths`.
- **Resolution:** There is no CLI flag workaround. Native harness permissions still protect `read_only_paths`, and the post-hoc snapshot layer remains active. If ACP-level proactive enforcement is critical, consider using Gemini.

### Cursor ACP mode not available
If cybervisor reports that `cursor-agent acp` is not supported:
- Verify Cursor CLI version: `cursor-agent acp --help` should exit with code 0.
- If it fails, upgrade Cursor CLI to the latest version.
- Check that `cursor-agent` is on your `PATH`.

### Cursor ACP authentication fails
If the adapter raises a `RuntimeError` during authentication:
- Set `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN` in the environment, or run `cursor login` to authenticate.
- Check `.cybervisor/logs/stages/` for the full ACP transcript to see the authentication response details.

### Cursor ACP session hangs or times out
- ACP notification waits time out after 30 seconds. A warning is logged, and the adapter continues waiting (normal for slow turns).
- If the agent is idle for 300 seconds (5 minutes) without any notification, the turn is abandoned with an error.
- Check `.cybervisor/logs/stages/` for the JSON-RPC transcript.
- If stuck, try `cybervisor cancel` to abort the session and clean up.
