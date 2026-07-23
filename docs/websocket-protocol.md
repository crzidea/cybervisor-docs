---
title: WebSocket Protocol — Cybervisor Daemon Mode
---

# WebSocket Protocol — Cybervisor Daemon Mode

> **Audience: Developers** — Systems integrators building WebSocket clients against the daemon.

**Protocol Version:** 1.0 (pong `tasks` extension: v2 — includes `cwd`, `end_stage`, `end_before` per-task fields)
**Transport:** WebSocket (text frames carrying JSON)
**Default Endpoint:** `ws://127.0.0.1:8765`

All messages are JSON objects. The server never sends messages to a client that has no active task. Each message carries a `type` field that determines its structure.

---

## Common Fields

Every message includes:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Message type identifier |
| `task_id` | `string` | UUID of the task this message pertains to (present on server→client events; required on client→server requests) |
| `timestamp` | `string` | ISO 8601 UTC timestamp when the server generated the message |

---

## Client → Server Messages

### `run` — Start a New Task

```json
{
  "type": "run",
  "prompt": "Implement feature X for the auth module",
  "cwd": "/workspace/project",
  "config": "cybervisor.yaml",
  "start_stage": null,
  "end_stage": null,
  "end_before": null,
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "resume_last_session": false
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `prompt` | Conditional | Task description / objective. Required when any stage in the effective slice uses `{objective}` in its `prompt_template`; optional when every stage has a self-contained `prompt_template` (config-driven promptless execution). Omit or pass an empty string for promptless runs. |
| `cwd` | Yes | Absolute path of the client's working directory; used to resolve workspace-local `.cybervisor/config.yaml` for per-task config reload and to detect nested tasks in the same directory |
| `config` | No | Non-empty workspace-relative path to cybervisor.yaml (default: `cybervisor.yaml`); absolute paths and `..` segments are rejected |
| `start_stage` | No | Non-empty stage name to begin at (default: first stage); must match a stage name in the resolved config |
| `end_stage` | No | Non-empty stage name to stop after; the named stage is executed, then the pipeline stops; must match a stage name in the resolved config; mutually exclusive with `end_before`; updatable mid-run via `set_stop_stage` |
| `end_before` | No | Non-empty stage name to stop before; must match a stage name in the resolved config; mutually exclusive with `end_stage` |
| `task_id` | Yes | Non-empty client-generated UUID for this task |
| `resume_last_session` | No | Boolean (default `false`). When `true`, the pipeline attempts to continue from the last captured agent session at `start_stage` (requires `start_stage` to also be set). If metadata is absent, mismatched, or the adapter does not support continuation, the stage starts fresh with a logged fallback reason. |

Malformed `run` messages are rejected with an `error` event using code `invalid_message`; the daemon does not synthesize missing required fields. Config selection is limited to files inside the current workspace so the daemon stays aligned with the documented local workflow. Stage names in `start_stage`, `end_stage`, and `end_before` are validated against the stages defined in the resolved config; unknown names result in `invalid_message`. Supplying both `end_stage` and `end_before` results in `mutually_exclusive_end_stage`.

**Server response:** `run_accepted` on success, `error` if a task is already in progress or the message is invalid.

---

### `set_stop_stage` — Update End Stage Mid-Task

```json
{
  "type": "set_stop_stage",
  "stage": "Verify",
  "end_before": null,
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "cwd": "/workspace/project"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `stage` | No | Name of the stage to stop after; the named stage is executed, then the pipeline stops; must match a stage name in the task's pipeline config; mutually exclusive with `end_before` |
| `end_before` | No | Name of the stage to stop before; the named stage is skipped (not executed); must match a stage name in the task's pipeline config; mutually exclusive with `stage` |
| `task_id` | No | The active task to modify; if absent or empty, the server searches for the running task in `cwd` |
| `cwd` | Yes | Working directory of the requesting client; used for CWD-based task lookup when `task_id` is absent |

`stage` and `end_before` are mutually exclusive — supplying both results in a `mutually_exclusive_end_stage` error. At least one of `stage` or `end_before` must be provided.

When `task_id` is absent or empty, the server finds the non-completed, non-cancelled task in the matching `cwd` (path-normalized). If exactly one such task exists, its stop stage is updated. If none exist, `unknown_task` is returned. If multiple exist, `multiple_tasks` is returned.

**Server response:** `stop_stage_updated` or `error`.

---

### `cancel` — Abort Active Task

```json
{
  "type": "cancel",
  "task_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `task_id` | No | Non-empty task ID to cancel; if absent or empty, the server searches for the running task in `cwd` and cancels it |
| `cwd` | Yes | Working directory of the requesting client; used for CWD-based task lookup when `task_id` is absent |

When `task_id` is absent or empty, the server finds the non-completed, non-cancelled task in the matching `cwd` (path-normalized). If exactly one such task exists, it is cancelled. If none exist, `unknown_task` is returned. If multiple exist, `multiple_tasks` are returned.

Sends SIGINT to the active subprocess group. The pipeline aborts gracefully via its built-in interrupt handling.

**Server response:** `pipeline_abort` followed by `run_complete`.

---

### `resume` — Reconnect and Replay Events

```json
{
  "type": "resume",
  "task_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Sent by a client that disconnected mid-task. The server replies with an `event_replay` batch of all buffered events for that task. If the replay payload exceeds the protocol size limit, the daemon sends ordered `event_replay_chunk` frames from `chunk_index: 0` through `chunk_index: chunk_count - 1`. If the task is still running, the resumed socket becomes the live event target for all subsequent updates. If the task already completed, the replay remains available until reconnect TTL cleanup with `live_resume: false`.

**Server response:** `event_replay` (if task found and still active/complete), `error` (if task not found or TTL expired).

---

### `ping` — Keepalive

```json
{
  "type": "ping"
}
```

Client may send `ping` at any time. Server responds with `pong`.

---

## Server → Client Messages

### `run_accepted` — Task Queued

```json
{
  "type": "run_accepted",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-04-02T12:00:00.000Z"
}
```

### `stage_start` — Stage Execution Began

```json
{
  "type": "stage_start",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "stage_name": "Spec",
  "attempt": 1,
  "retry_mode": "fresh",
  "timestamp": "2026-04-02T12:00:01.000Z"
}
```

`retry_mode` is optional. Values: `fresh` (first attempt or unsupported adapter), `continued` (resumed session), `fallback` (continuation attempted but unavailable). When `retry_mode` is `fallback`, an optional `fallback_reason` string is also included (e.g., `"no_prior_session_id"`).

### `stage_complete` — Stage Finished

```json
{
  "type": "stage_complete",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "stage_name": "Spec",
  "success": true,
  "attempt": 1,
  "timestamp": "2026-04-02T12:00:05.000Z"
}
```

### `stage_retry` — Stage Failed, Retrying

```json
{
  "type": "stage_retry",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "stage_name": "Spec",
  "attempt": 2,
  "max_retries": 3,
  "retry_mode": "continued",
  "error": "Agent exited with code 1",
  "timestamp": "2026-04-02T12:00:05.000Z"
}
```

`retry_mode` is optional. Values: `fresh` (unsupported adapter, starting new session), `continued` (resumed session via adapter-native mechanism), `fallback` (continuation attempted but unavailable). When `retry_mode` is `fallback`, an optional `fallback_reason` string is also included (e.g., `"adapter_does_not_support_continuation"` or `"no_prior_session_id"`).

### `stage_failed` — Stage Exhausted Retries

```json
{
  "type": "stage_failed",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "stage_name": "Spec",
  "attempt": 3,
  "error": "Retries exhausted",
  "timestamp": "2026-04-02T12:00:10.000Z"
}
```

### `artifact_validated` — Contract Artifact Validated

```json
{
  "type": "artifact_validated",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "stage_name": "Review Code",
  "artifact_status": "approved",
  "timestamp": "2026-04-02T12:00:05.000Z"
}
```

### `routing_decision` — Next Stage Resolved

```json
{
  "type": "routing_decision",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "stage_name": "Review Code",
  "next_stage": "Verify",
  "decision_source": "contract_route",
  "timestamp": "2026-04-02T12:00:05.000Z"
}
```

### `pipeline_abort` — Pipeline Aborted

```json
{
  "type": "pipeline_abort",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "cancelled_by_client",
  "stage_name": "Implement",
  "timestamp": "2026-04-02T12:00:08.000Z"
}
```

### `run_complete` — Task Finished

```json
{
  "type": "run_complete",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "success": true,
  "timestamp": "2026-04-02T12:05:00.000Z"
}
```

### `event_replay` — Historical Events on Resume

```json
{
  "type": "event_replay",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "events": [
    { ... },
    { ... }
  ],
  "live_resume": true,
  "timestamp": "2026-04-02T12:00:10.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `events` | `array` | Array of server event objects (all types above) |
| `live_resume` | `boolean` | `true` if task is still running; `false` if already complete |

### `stop_stage_updated` — Confirm Stop Stage Change

```json
{
  "type": "stop_stage_updated",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "stage": "Verify",
  "timestamp": "2026-04-02T12:00:06.000Z"
}
```

### `pong` — Keepalive Response

```json
{
  "type": "pong",
  "task_id": "",
  "timestamp": "2026-04-02T12:00:00.000Z"
}
```

Extended pong (protocol v2 — when active tasks are present):
```json
{
  "type": "pong",
  "task_id": "",
  "timestamp": "2026-04-02T12:00:00.000Z",
  "tasks": [
    {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "active_stage": "Spec",
      "attempt": 1,
      "status": "running",
      "cwd": "/workspace/project",
      "end_stage": "Verify",
      "end_before": null
    }
  ]
}
```
**Note:** The `end_before` field is present in v2 pongs even when `null`, matching the `end_stage` / `end_before` pair shown in the task snapshot field table above. Pre-feature daemons emit a bare pong without the `tasks` field entirely (no `null` value — the key is absent).

| Task snapshot field | Type | Description |
|---------------------|------|-------------|
| `task_id` | `string` | Unique task identifier |
| `active_stage` | `string \| null` | Current stage name; `null` before first stage execution (displayed as `"initializing"`) |
| `attempt` | `integer` | Current attempt count for the active stage |
| `status` | `string` | `"running"` (active), `"completed"`, or `"cancelled"` |
| `cwd` | `string` | Working directory of the task at submission time |
| `end_stage` | `string \| null` | Bound: stage to stop after (executed, then pipeline stops), if set |
| `end_before` | `string \| null` | Bound: stage to stop before, if set |

Note: `pong` is a connection-level keepalive response, not tied to any specific task. The `task_id` field is included for protocol consistency but is always empty for pong events. The optional `tasks` field contains a snapshot of all non-abandoned tasks in the registry. When no tasks are active, `tasks` is an empty array `[]`. When the daemon predates this extension, `tasks` is absent entirely (clients treat it as `[]`). The `active_stage` field may be `null` during the window between task registration and first stage execution (displayed as `"initializing"` by status clients). The `status` field values are `"running"` (active, neither completed nor cancelled), `"completed"`, or `"cancelled"`. Each task snapshot also includes `cwd`, `end_stage`, and `end_before` from the original `run` message.

### `error` — Protocol or Execution Error

```json
{
  "type": "error",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "code": "task_in_progress",
  "message": "A task is already in progress",
  "timestamp": "2026-04-02T12:00:00.000Z"
}
```

| Error Code | Description |
|------------|-------------|
| `task_in_progress` | Rejected because another task is currently executing |
| `nested_task_rejected` | A new `run` was submitted in a directory that already has a running task; submit from that directory's CWD instead |
| `unknown_task` | `task_id` not found (e.g., TTL expired) |
| `multiple_tasks` | Multiple running tasks found in the same directory; disambiguate with an explicit `task_id` |
| `not_cancellable` | Task is not in a cancellable state |
| `invalid_message` | Message failed validation, including requests that are no longer valid for the task's current lifecycle state |
| `mutually_exclusive_end_stage` | Both `end_stage` and `end_before` were provided in a `run` or `set_stop_stage` message; use one or the other |
| `server_error` | Internal server error |

---

## Connection Lifecycle

1. Client opens WebSocket connection to `ws://host:port`
2. Server accepts connection; no authentication in v1
3. Client sends a message (typically `run` or `resume`)
4. Server and client exchange messages as described above
5. Client disconnects at any time; server continues task execution
6. If client reconnects and sends `resume` with the same `task_id`, server replays buffered history then continues live streaming
7. Task eventually completes; server sends `run_complete`
8. Client may send a new `run` on the same connection after `run_complete`

---

## Large Payload Chunking

Only oversized `event_replay` responses are chunked. Normal live events such as `artifact_validated` are always sent as their native event type.

When replay history exceeds 64 KB, the server emits ordered `event_replay_chunk` frames:

```json
{
  "type": "event_replay_chunk",
  "task_id": "...",
  "chunk_id": "ch-0",
  "chunk_index": 0,
  "chunk_count": 3,
  "events": [ ... ],
  "live_resume": true,
  "timestamp": "2026-04-02T12:00:10.000Z"
}
```

| Chunk frame field | Type | Description |
|-------------------|------|-------------|
| `chunk_id` | `string` | Stable identifier grouping all frames of the same payload; format: `ch-{index}` on server-side chunking, `{task_id}_{connection_generation}` when emitted from resume replay |
| `chunk_index` | `integer` | Zero-based frame index within the payload |
| `chunk_count` | `integer` | Total number of frames in the payload |
| `events` | `array` | Slice of server event objects for this frame |
| `live_resume` | `boolean` | `true` if the task is still running at replay time; `false` if the task has completed |

Client reassembles by `chunk_index` ascending until `chunk_count` frames have been received.

---

## Running the Integration Suite

Run the daemon integration suite with:

```bash
uv run pytest --run-integration tests/integration/test_server_ws.py
```

This suite is intended to run in local development and CI/review. It exercises the required daemon acceptance coverage for ping/pong, `set_stop_stage`, cancellation ordering, resume replay, replay chunking, and error handling.

## Example Session

```
Client → Server:
{ "type": "run", "prompt": "build auth feature", "config": "cybervisor.yaml", "task_id": "abc" }

Server → Client:
{ "type": "run_accepted", "task_id": "abc", "timestamp": "..." }

Server → Client:
{ "type": "stage_start", "task_id": "abc", "stage_name": "Spec", "attempt": 1, "timestamp": "..." }

... (client reconnects here) ...

Client → Server:
{ "type": "resume", "task_id": "abc" }

Server → Client:
{ "type": "event_replay", "task_id": "abc", "events": [{ "type": "run_accepted", ... }, { "type": "stage_start", ... }], "live_resume": true, "timestamp": "..." }

Server → Client:
{ "type": "stage_complete", "task_id": "abc", "stage_name": "Spec", "success": true, "attempt": 1, "timestamp": "..." }
...
```
