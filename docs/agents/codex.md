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

### Turn Completion
- Cybervisor completes the app-server handshake before starting a thread.
- Assistant replies are collected from the active turn's live item stream.
- Current Codex versions can send a terminal completion with an intentionally empty item list because the completed items were already streamed separately. This is expected and does not produce a warning.
- The terminal status remains authoritative. Failed and interrupted turns fail the stage attempt and are not submitted to the verifier as successful replies.

### Permission Enforcement
Cybervisor intercepts and enforces Codex write protection via two layers:
1. **Approval Callback Interception:** The adapter autonomously handles app-server approval callbacks for command, file-change, and permission requests.
   - For `item/fileChange/requestApproval` calls, protected paths matching `read_only_paths` receive a `deny` response (this is optimistic, as Codex may bypass via alternative paths).
   - For `item/permissions/requestApproval` calls, filesystem entries exclude protected patterns instead of granting blanket root write access.
2. **Post-Hoc Snapshots:** Because the interception layer is optimistic, the primary enforcement layer snapshots working-tree files matching active `read_only_paths`. Protected changes are restored after every turn outcome, including failed and interrupted turns.
3. **Failure on Violation:** Any protected working-tree change detected by the snapshot layer fails the current stage attempt.
4. **Logging:** Each enforcement decision (such as created, modified, or deleted file restorations) is logged to `.cybervisor/hooks/hook-events.jsonl` with the action type and restoration status.

Git administration directories and `.git` files are not included in post-hoc snapshots. Restoring selected Git database files is not transactional and can corrupt repository state. Use a disposable checkout or an outer read-only filesystem boundary when refs, hooks, indexes, or other Git metadata must remain immutable.
