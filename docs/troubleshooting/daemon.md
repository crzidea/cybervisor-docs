---
title: Daemon and Process Troubleshooting
---

# Daemon and Process Troubleshooting

> **Audience: Users** — Pipeline operators experiencing issues with daemon, sandbox, process cleanup, or batch runs.

---

## Daemon Mode

### `Daemon not reachable at ws://127.0.0.1:8765`

The daemon is not running, or it is bound to a different host/port.

```bash
# Check if the daemon process exists
ps aux | grep "cybervisor serve"

# Start it explicitly
cybervisor serve

# Or with custom binding
cybervisor serve --host 0.0.0.0 --port 9000
```

When using custom ports, pass `--host` and `--port` to every client command:

```bash
cybervisor status --host 127.0.0.1 --port 9000
```

### `nested_task_rejected` when submitting

You submitted a new task from a directory that already has a running daemon task. Submit from a different directory, or cancel the existing task first.

### Sandbox CLI and daemon versions differ

When `cybervisor sandbox` starts, it logs two version lines:

```
INFO | cybervisor CLI 0.18.1
INFO | cybervisor daemon 0.18.0
```

If these versions differ, the container image is outdated. Pull the latest image:

```bash
cybervisor sandbox          # pulls automatically by default
# or
docker pull ghcr.io/crzidea/cybervisor:latest
```

If the CLI shows a newer version available (`cybervisor CLI 0.18.1 (latest: 0.18.2)`), upgrade the host CLI:

```bash
uv tool upgrade cybervisor
```

---

## Process Cleanup

### Agent subprocess hangs

- **OpenCode serve** starts an isolated `opencode serve` process per stage. Cybervisor shuts it down via `POST /instance/dispose` when available, otherwise with the same `terminate_process()` sequence (SIGTERM, then SIGKILL). Startup failures and cancellations also terminate the serve process group.
- **Codex** uses the app-server subprocess with the same bounded termination sequence.
- **In-process adapters (Claude, Cursor, Antigravity)** use cooperative cancellation. Cursor also requests cancellation through the SDK. The daemon then joins the worker with a bounded timeout and proceeds if it does not exit.
- If any agent subprocess persists beyond 12 seconds after stage completion, the pipeline-level process sweep should still catch it.

### Agent-spawned processes remain after pipeline finishes

cybervisor terminates descendant processes at two points: after each stage (process group kill plus individual PID fallback) and after the full pipeline (process-tree sweep). If a process survives both:

- Check `.cybervisor/logs/cybervisor.log.jsonl` for entries with `"status": "Cleanup"` — these show which PIDs were targeted and whether SIGTERM/SIGKILL was sent.
- A process that called `setpgid` or `setsid` to leave the agent's process group and was then reparented to init (because its parent exited) may not be discoverable by the pipeline-level sweep. This is a known limitation.
- To check for remaining processes: `ps aux | grep -E 'vite|npm|node'` or use `psutil` to walk the process tree from the cybervisor process.

### Cleanup logs show "already exited" messages

This is normal and expected. When a process exits between discovery and termination, cybervisor logs a warning and continues. These messages confirm best-effort cleanup is working correctly.

---

## Batch Submit (`--path`)

### Batch stops after one file fails

This is expected behavior — `--path` stops on the first non-zero exit code so you can inspect and fix the problem before continuing. Files already moved to `completed/` are skipped on re-run.

```bash
# Fix the issue, then re-run the same command
cybervisor submit --path prompts/
```

### `--path` directory has no `.md` files

The `--path` directory must contain at least one `.md` file at the top level. Non-`.md` files are ignored, and subdirectories (including `completed/`) are not searched recursively.

```bash
ls prompts/*.md   # confirm .md files exist at the top level
```

### Files are processed in the wrong order

Files are sorted lexicographically by filename. Use zero-padded names for predictable ordering:

```
01-first-task.md    # processed first
02-second-task.md
10-tenth-task.md    # not between 01 and 02
```

### Concurrent batch runs against the same directory

No locking is applied to the prompt directory. Running two `--path` submissions against the same directory concurrently may cause race conditions (e.g., both trying to move the same file to `completed/`). Use separate directories or run batches sequentially.
