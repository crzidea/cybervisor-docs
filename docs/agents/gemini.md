---
title: Gemini Agent Guide
---

# Gemini Agent Guide

> **Audience: Users** — Operators configuring or troubleshooting the Gemini agent adapter.

The Gemini adapter enables `cybervisor` to use Gemini CLI as a pipeline agent. It communicates exclusively via the Agent Connection Protocol (ACP) JSON-RPC over stdio (`gemini --acp`).

---

## Configuration and Setup

### Prerequisites
- Requires the `gemini` CLI on `PATH`.
- ACP mode support must be available (requires a recent version of Gemini CLI).
- CLI check command: `gemini --acp --help` (should exit with code 0).

### Authentication
Before starting the pipeline, ensure you have authenticated with Gemini CLI. The adapter sends an ACP `authenticate` request between the initialization and session start.
- Run `gemini auth login` or follow the Gemini CLI authentication flow to establish credentials.
- Headless check: A successful `gemini -p "hello"` confirms headless Gemini auth.

### Permission Enforcement
The adapter launches with `--approval-mode default` so Gemini emits `session/request_permission` before tool execution.
- Cybervisor's ACP permission handler proactively denies disallowed tools and protected-path writes (`read_only_paths`).
- **`ACPReadOnlySnapshot`** post-hoc restoration remains active as a belt-and-suspenders backstop for edits that the proactive layer may miss (e.g., child processes, shell commands).

---

## Troubleshooting

### Gemini ACP mode not available
If cybervisor reports that `gemini --acp` is not supported:
- Verify Gemini CLI version: `gemini --acp --help` should exit with code 0.
- If it fails, upgrade Gemini CLI to the latest version.
- Check that `gemini` is on your `PATH` and is the correct binary (not an alias or wrapper script).

### Gemini ACP authentication fails
If the adapter raises a `RuntimeError` during authentication:
- Run `gemini auth login` to establish credentials.
- The adapter sends an ACP `authenticate` request using the method derived from the `initialize` response (`oauth-personal` for current Google login flows; legacy values are mapped transparently to current enum values).
- Check `.cybervisor/logs/stages/` for the full ACP transcript, which contains the authentication response and any error details.

### Gemini ACP session hangs or times out
- ACP notification waits time out after 30 seconds. If no notification arrives within 30 seconds, a warning is logged and the adapter continues waiting — this is normal for slow agents and does not indicate a failure.
- If the agent is idle for 300 seconds (5 minutes) without any notification, the turn is abandoned with an error that includes the last notification summary and whether the process exited or the grace period expired.
- Check `.cybervisor/logs/stages/` for ACP transcript details. The log file contains the full JSON-RPC transcript for each stage.
- If the agent appears stuck, try `cybervisor cancel` to send a cancel request and clean up.
