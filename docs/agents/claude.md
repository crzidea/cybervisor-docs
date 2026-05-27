---
title: Claude Code Agent Guide
---

# Claude Code Agent Guide

> **Audience: Users** — Operators configuring or troubleshooting the Claude Code agent adapter.

The Claude Code adapter enables `cybervisor` to use the Claude Code CLI (`claude`) as a pipeline agent. It uses CLI arguments for non-interactive mode and hooks into Claude's native tool execution system by patching its settings file.

---

## Configuration and Setup

### Prerequisites
- Requires the `claude` CLI on `PATH`.
- CLI check command: `claude --version`.

### Headless and Autonomous Operation
- The Claude adapter uses the `--dangerously-skip-permissions` flag for fully autonomous operation.
- **Critical Warning:** This flag is required in container environments and CI/CD pipelines where interactive permission prompts would block automation. Do not remove this flag or attempt to replace it with interactive settings.

### Hooks and Settings Patching
Unlike other adapters (which use ACP or server-mode overrides), Claude requires settings file patching:
- At stage start, `hooks.py` writes hook runtime metadata under `.cybervisor/hooks/`, saves a backup of your original settings file, and patches `.claude/settings.json` to configure the tool-specific hook wiring.
- This wiring directs Claude to run the packaged `cybervisor-agent-hook` entry point for stage-contract enforcement and write protection.
- At stage completion, the original settings file is restored from the backup.

### Permission Enforcement
- **Proactive Protection:** Claude enforces `read_only_paths` at launch time via a `PreToolUse` hook. Files are checked before write-tool execution (`Write`, `Edit`, `NotebookEdit`), and write access is blocked immediately if they match protected patterns.
- **Command Filtering:** Shell tool calls are inspected for write patterns (like `>`, `>>`, `sed -i`, `tee`). If a write target cannot be resolved or matches a protected path, the command is blocked.
- **Logging:** Permissions decisions are logged to `.cybervisor/hooks/hook-events.jsonl` as `permission_denied` or `permission_allowed` events.

---

## Troubleshooting

### Settings snapshot was not restored after a crash
If `cybervisor` was forcefully killed (e.g. via SIGKILL or power outage), the settings restore step may have been skipped, leaving the hooks inside your active Claude settings file.
1. Check `.cybervisor/hooks/` for the backup settings snapshot (e.g. `settings_snapshot.json`).
2. Manually restore this snapshot to `.claude/settings.json`, or edit the file to remove any cybervisor hook entries.
