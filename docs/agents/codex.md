---
title: Codex Agent Guide
---

# Codex Agent Guide

> **Audience: Users** — Operators configuring or troubleshooting the Codex agent adapter.

The Codex adapter enables `cybervisor` to use the Codex CLI as a pipeline agent. It communicates via the Codex app-server JSON-RPC protocol.

---

## Configuration and Setup

### Prerequisites
- Requires the `codex` CLI on `PATH`.
- CLI check command: `codex --version`.

### Execution and Sandbox Overrides
- Cybervisor launches Codex with configuration overrides `sandbox_mode="danger-full-access"` and `approval_policy="never"`, plus matching app-server thread/turn sandbox settings.
- This is because Cybervisor itself provides the outer sandbox/container boundary. Using these overrides prevents nested Codex sandbox configuration warnings (such as missing `bubblewrap` warnings).

### Permission Enforcement
Unlike Gemini and Cursor, Codex does not use the Agent Connection Protocol (ACP). Cybervisor intercepts and enforces write protection via two layers:
1. **Approval Callback Interception:** The adapter autonomously handles app-server approval callbacks for command, file-change, and permission requests.
   - For `item/fileChange/requestApproval` calls, protected paths matching `read_only_paths` receive a `deny` response (this is optimistic, as Codex may bypass via alternative paths).
   - For `item/permissions/requestApproval` calls, filesystem entries exclude protected patterns instead of granting blanket root write access.
2. **Post-Hoc Snapshots:** Because the interception layer is optimistic, the primary enforcement layer uses filesystem snapshots (`CodexReadOnlySnapshot`). Files matching active `read_only_paths` are snapshotted before the first turn, and any protected changes are restored after each turn.
3. **Failure on Violation:** Any write violation on a protected path detected by the snapshot layer raises a `RuntimeError` that fails the current stage attempt.
4. **Logging:** Each enforcement decision (such as created, modified, or deleted file restorations) is logged to `.cybervisor/hooks/hook-events.jsonl` with the action type and restoration status.
