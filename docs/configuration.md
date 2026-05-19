---
title: Configuration Reference
---

# Configuration Reference

> **Audience: Users** — Pipeline operators and configuration authors.

`cybervisor` is configured with a `cybervisor.yaml` file. The global agent and verifier settings reside in `~/.cybervisor/config.yaml`.

## Global Flags

| Flag | Description |
|------|-------------|
| `--quiet` | Suppress non-error stderr output for all commands |
| `--help` | Show help message and exit |

## Global Configuration (`~/.cybervisor/config.yaml`)

The global config file is created with `0o600` permissions (owner read/write only) to protect API keys and other sensitive credentials from being world-readable.

Manage the default agent with `cybervisor use <agent>`. Supported: `claude`, `gemini`, `codex`, `opencode`, `cursor`, `mock`.

```yaml
agent_tool: gemini
llm:
  api_key: your-api-key
  base_url: https://api.openai.com/v1 # Optional
  model: gpt-4o                     # Optional
server:
  host: 127.0.0.1        # Interface to bind; use 0.0.0.0 to expose externally
  port: 8765            # WebSocket port for daemon mode
  reconnect_ttl_seconds: 300.0   # How long completed/disconnected tasks are retained for resume
  max_event_buffer: 1000        # Maximum events buffered per task for replay
```

### Server Settings

The `server` block controls the `cybervisor serve` daemon:

| Setting | Default | Purpose |
|---------|---------|---------|
| `host` | `127.0.0.1` | Network interface to bind; `0.0.0.0` exposes on all interfaces |
| `port` | `8765` | WebSocket port for daemon connections (must be an integer, not a string) |
| `reconnect_ttl_seconds` | `300.0` | Seconds a task is kept after the last activity before cleanup; also bounds how long a disconnected client can `resume` (must be a number, not a string) |
| `max_event_buffer` | `1000` | Maximum server events stored per task for `resume` replay; oldest events are evicted FIFO when the cap is hit (must be an integer, not a string) |

Override on the command line: `cybervisor serve --host 0.0.0.0 --port 9000`.

### Docker Sandbox Serve (`cybervisor sandbox`)

Launch the daemon in an isolated Docker container with the current working directory mounted. See [Docker Sandbox Serve](testing.md#docker-sandbox-serve) for full documentation.

```bash
cybervisor sandbox                        # Default: 127.0.0.1:8765, pulls latest image
cybervisor sandbox --host 0.0.0.0 --port 9000
cybervisor sandbox --background           # Detached mode
cybervisor sandbox --image myregistry/cybervisor:dev  # Use a custom image
cybervisor sandbox --no-pull              # Skip auto-pull, use cached image
```

### Workspace-Local Config Override

A `.cybervisor/config.yaml` file in the current working directory completely replaces `~/.cybervisor/config.yaml` when present — all settings (verifier, `agent_tool`, `stage_models`, `stage_agents`, `usage_reporting`, `server`, etc.) come from the workspace-local file, and the home-directory config is not loaded. Pipeline configuration (`cybervisor.yaml`) has no CWD override — it is always resolved from the project root.

This is useful for teams that need project-specific verifier credentials or model overrides without modifying the global config.

### Usage Reporting

The `usage_reporting` block configures optional per-stage usage telemetry to an Elasticsearch endpoint. Reporting is disabled by default and never blocks pipeline success — failures are logged as warnings.

| Setting | Default | Purpose |
|---------|---------|---------|
| `enabled` | `false` | Enable usage reporting |
| `endpoint` | `""` | Elasticsearch endpoint URL (e.g., `https://elasticsearch.example.com`) |
| `api_key` | `""` | Elasticsearch API key for authentication |
| `index` | `cybervisor-usage` | Elasticsearch index/target for documents |
| `user` | *(local username)* | Optional user identity sent in each usage document; when omitted, cybervisor uses the local system account name |

When enabled, cybervisor sends one best-effort Elasticsearch request per completed stage. Each event includes user identity, agent name, stage name, model (when known), request count, status (`success` or `failure`), and a UTC timestamp. Token counts and run/task identifiers are included when available. Failures (network errors, bad credentials, missing endpoint) produce warnings but never fail a pipeline stage.

```yaml
usage_reporting:
  enabled: true
  endpoint: https://elasticsearch.example.com
  api_key: your-api-key
  index: cybervisor-usage
  user: alice@example.com
```

### Codex Notes
- Requires the `codex` CLI on `PATH`.
- Blocked-start guidance: `Codex requires the codex CLI on PATH. Install it and verify with codex --version.`
- Uses the app-server JSON-RPC protocol. Unlike Gemini, OpenCode, and Cursor, this path does not use ACP `session/request_permission` for read-only path enforcement.
- Starts Codex with config overrides `sandbox_mode="danger-full-access"` and `approval_policy="never"` plus matching app-server thread/turn sandbox settings because Cybervisor supplies the outer sandbox/container boundary; this avoids nested Codex sandbox setup warnings such as missing bubblewrap.
- Answers app-server approval callbacks autonomously for command, file-change, and permission requests. For `item/fileChange/requestApproval`, protected paths matching `read_only_paths` receive a `deny` response (optimistic — Codex may bypass via alternative paths). For `item/permissions/requestApproval`, filesystem entries exclude protected patterns instead of granting blanket root write access.
- Read-only path enforcement is **primarily via filesystem snapshots**: files matching active `read_only_paths` are snapshotted before the first turn, and after each turn protected changes are restored. A protected-path change raises `RuntimeError`, failing the stage attempt. Each enforcement decision (modified/created/deleted path restoration) is logged to `.cybervisor/hooks/hook-events.jsonl` with action type and restoration status. The interception layer is optimistic; the snapshot is the reliable enforcement layer.

### Gemini Notes
- Requires the `gemini` CLI on `PATH` with ACP mode support (`gemini --acp` must be available; requires a recent version of Gemini CLI).
- Uses Strategy B (runtime config only) — no native settings hooks are installed. Contract enforcement runs through `evaluate_reply()` after each prompt turn, with a verify-and-continue loop that sends continuation prompts when the verifier blocks.
- **Permission enforcement**: The adapter launches with `--approval-mode default` so Gemini emits `session/request_permission` before tool execution. Cybervisor's ACP permission handler proactively denies disallowed tools and protected-path writes. **`ACPReadOnlySnapshot`** post-hoc restoration remains as belt-and-suspenders for writes the proactive layer may miss (child processes, shell commands).
- Authentication: The adapter sends an ACP `authenticate` request between `initialize` and `session/new`, using the authentication method derived from the `initialize` response (`authMethods` in current Gemini CLI, legacy `capabilities.authMethods` in older versions). Known legacy values (e.g., `google_login`) are mapped transparently to their current ACP enum values. If authentication fails, the adapter raises a `RuntimeError`. Ensure you have authenticated with Gemini CLI before starting the pipeline, or that your environment supports the advertised authentication method.
- The adapter communicates with Gemini CLI over JSON-RPC via stdio (`gemini --acp`). The `--yolo`, `--sandbox`, and `--output-format stream-json` CLI flags are no longer used.
- Blocked-start guidance: `Gemini requires the gemini CLI on PATH. Install it and verify with gemini --version.` If `gemini --acp` is not available, the guidance directs ensuring a recent version of Gemini CLI is installed.

### OpenCode Notes
- Requires the `opencode` CLI on `PATH` with ACP mode support (`opencode acp` must be available; requires OpenCode v0.4.0 or later).
- Uses Strategy B (runtime config only) — no native settings hooks are installed. Contract enforcement runs through `evaluate_reply()` after each prompt turn, with a verify-and-continue loop that sends continuation prompts when the verifier blocks.
- **Model override** (`stage_models`): When a model is specified for an OpenCode stage via `stage_models`, the adapter injects it through the `OPENCODE_CONFIG_CONTENT` environment variable, which takes highest precedence in OpenCode's config resolution. When no Cybervisor `stage_models` override is set, the adapter reads the user's OpenCode model configuration from global and project config files and propagates it so that OpenCode ACP mode matches the model the user sees when running `opencode` interactively, instead of falling back to `opencode/big-pickle`. After session creation, `session/set_model` is also attempted as a secondary best-effort call. The adapter verifies the model was applied by inspecting the `session/new` response and logs a WARNING if the active model differs. Cybervisor does **not** create or modify `opencode.json` in the workspace — all overrides are injected via `OPENCODE_CONFIG_CONTENT`. Model selection in OpenCode is a known upstream limitation — bugs #13644, #21556, and #18620 may cause the model setting to be silently ignored.
- **Permission enforcement**: The adapter generates native OpenCode permission configuration from Cybervisor's `disallowed_tools` and `read_only_paths` settings and injects it via `OPENCODE_CONFIG_CONTENT` — this is the primary mechanism for enforcing permissions. The adapter does **not** use `session/set_mode` for permission enforcement. OpenCode's "build" and "plan" modes are agent execution modes that lack permission semantics — the adapter excludes them from `set_mode` consideration. When no genuine permission-asking mode remains, no `set_mode` call is made and enforcement is `"post_hoc_only"` from the start. A first-turn health check detects the rare case where `set_mode` succeeds with a mode that still does not deliver permission requests. See [Troubleshooting — Write Protection](troubleshooting.md#write-protection-read_only_paths) for details.
- **File-context disabling**: Cybervisor automatically disables OpenCode's file-context ingestion for Cybervisor runs. This is done through three mechanisms: (1) the generated runtime config sets `instructions` to an empty array, preventing OpenCode from loading context files automatically; (2) the adapter sets `OPENCODE_DISABLE_PROJECT_CONFIG=true` and `OPENCODE_DISABLE_CLAUDE_CODE=true` environment variables to suppress project-level config discovery and Claude-specific context ingestion; (3) legacy `fileContext` and `contextPaths` keys are stripped from the merged config. Disabling file context ensures the agent receives only the prompt and artifact context Cybervisor explicitly provides.
- Read-only path enforcement is **post-hoc via filesystem snapshots** as a belt-and-suspenders backstop. Native OpenCode permissions proactively deny writes on protected paths. The snapshot compares file content hashes before and after each turn and restores any protected-file modifications. This catches writes from any source (ACP tool calls, bash commands, child processes).
- Tool disabling (e.g., `question`) is handled via native OpenCode permission configuration injected through `OPENCODE_CONFIG_CONTENT`, replacing the previous `OPENCODE_CONFIG` environment variable approach.
- The adapter communicates with OpenCode over JSON-RPC via stdio (`opencode acp`), not CLI flags. The `--dangerously-skip-permissions` and `--format json` flags are no longer used.
- Blocked-start guidance: `OpenCode requires the opencode CLI on PATH. Install it and verify with opencode --version.` If `opencode acp` is not available, the guidance directs upgrading to OpenCode v0.4.0 or later.

### Cursor Notes
- Requires the `cursor-agent` CLI on `PATH` with ACP mode support (`cursor-agent acp` must be available).
- Uses Strategy B (runtime config only) — no native settings hooks are installed. Contract enforcement runs through `evaluate_reply()` after each prompt turn, with a verify-and-continue loop that sends continuation prompts when the verifier blocks.
- **Permission enforcement**: The adapter generates native Cursor CLI permission configuration from Cybervisor's `read_only_paths` settings and writes it to the project-level `.cursor/cli.json` before launching the agent. The existing config (if any) is backed up and restored after the session ends. Deny rules prevent writes to protected paths via the `Write(pathOrGlob)` permission type. See [Cursor CLI Permissions](https://cursor.com/docs/cli/reference/permissions) for the permission schema. Post-hoc `ACPReadOnlySnapshot` enforcement remains active as a belt-and-suspenders backstop regardless of proactive permission status.
- Read-only path enforcement is **post-hoc via filesystem snapshots** as a belt-and-suspenders backstop. Native Cursor CLI permissions proactively deny writes on protected paths. The snapshot compares file content hashes before and after each turn and restores any protected-file modifications. This catches writes from any source (ACP tool calls, bash commands, child processes). The `session/request_permission` flow is still used for disallowed-tool denial (e.g., `question` tool kind).
- Authentication: Set `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN` in the environment, or run `cursor login` before starting the pipeline. The adapter sends an ACP `authenticate` request (method `cursor_login`) between `initialize` and `session/new`. If authentication fails, the adapter raises a `RuntimeError`.
- The adapter communicates with Cursor over JSON-RPC via stdio (`cursor-agent acp`), not CLI flags.
- Blocked-start guidance: `Cursor requires the cursor-agent CLI on PATH. Install it and verify with cursor-agent --version.` If `cursor-agent acp` is not available, the guidance directs ensuring a recent version of Cursor CLI is installed.

## Scaffolding (`cybervisor init`)

Initialize a project scaffold. Overwrite protection is active by default.

- `cybervisor init`: Creates a `simple` 6-stage pipeline with `Design Delivery -> Review Delivery Docs -> Implement -> Review Code -> Review Docs -> Verify`.
- `cybervisor init --template speckit`: Creates a `speckit`-integrated pipeline.
- `--force`: Required to explicitly replace an existing `cybervisor.yaml`.

## Running the Pipeline (`cybervisor run`)

The positional `prompt` argument (or `stdin`) provides the `{objective}` for stage templates.

### Prompt Resolution Priority

When running `cybervisor run` or `cybervisor submit`, the task prompt is resolved with the following priority:

1. **Positional argument** — `cybervisor run "Your task description"`
2. **stdin** — `printf "Your task" | cybervisor run`
3. **Config-driven promptless execution** — If no prompt is provided and every stage in the effective slice has a self-contained `prompt_template` (one that does not reference `{objective}`), the task runs without an objective prompt using the configured templates.
4. **Error** — If no prompt is provided and any stage still requires `{objective}`, the command exits with an error listing the stages that need a prompt.

If a positional prompt argument is present, stdin is ignored even when piped.

When `--path <dir>` is provided with `cybervisor submit`, positional prompts and stdin are both bypassed — each `.md` file in the directory supplies a prompt. `--path` and the positional prompt are mutually exclusive. See [Runtime and Daemon — Batch Submit](runtime-user.md#batch-submit) for full documentation.

```bash
cybervisor run "Implement feature X"
cybervisor run --config custom.yaml        # Use specific config
cybervisor run --start-stage "Implement"   # Resume from stage
cybervisor run --end-after "Review Code"  # Run up to and including this stage, then stop (updatable via end --after in daemon mode)
cybervisor run --end-before "Verify"       # Stop before this stage (updatable via end --before in daemon mode)
```

### Self-Contained Config Flow Example
If all active stages define an explicit `prompt_template`, the positional prompt may be omitted:

```bash
# Using stage templates (standalone)
cybervisor run --config self-contained.yaml

# Using stage templates (daemon)
cybervisor submit --config self-contained.yaml --start-stage "Design Delivery"

# Overriding with stdin (standalone)
printf 'hotfix retry handling\n' | cybervisor run --config self-contained.yaml

# Overriding with positional prompt (standalone)
cybervisor run "ship the retry fix" --config self-contained.yaml

# Overriding with positional prompt (daemon)
cybervisor submit "ship the retry fix" --config self-contained.yaml --start-stage "Implement"
```

## Diagnostics & Validation

### `cybervisor doctor` (Verifier Readiness)
Validates `~/.cybervisor/config.yaml` connectivity and credentials.

- `Doctor: verifier ready` — Success.
- `Doctor: verifier blocked` — Local configuration error (e.g., missing API key).
- `Doctor: verifier needs attention` — Remote rejection (e.g., 401 Unauthorized).

### `cybervisor validate` (Config Safety)
Checks `cybervisor.yaml` for route safety and prompt synchronization.
- Use `--show-guidance` to preview the exact contract instructions generated for the agent.

## Stage Configuration

### Global Config: `stage_agents`

Per-stage agent overrides live in `~/.cybervisor/config.yaml` (not in `cybervisor.yaml`) because they are a per-user runtime concern, not a pipeline-structure concern. Add a top-level `stage_agents` section to override the agent tool for specific stages:

```yaml
# ~/.cybervisor/config.yaml
agent_tool: claude
stage_agents:
  "Design Delivery": gemini
  "Review Delivery Docs": gemini
```

**Behavior:**
- `stage_agents` is optional; absent means all stages use the global `agent_tool` default.
- A stage name must match exactly (case-sensitive, per `StageConfig.name`). Unknown stage names are silently ignored at runtime.
- Values are validated against supported agent names at config load time. Invalid values produce an error listing supported names.
- The agent resolution order: `stage_agents[stage_name]` → global `agent_tool` default.
- `cybervisor use <agent>` sets the global default only; it does not alter `stage_agents` entries.

**Hook compatibility:** All supported adapters enforce contracts and read-only paths. Claude uses settings-file hooks with launch-time write blocking; Gemini uses `--approval-mode default` with post-hoc snapshots as a backstop; OpenCode uses native permissions in `OPENCODE_CONFIG_CONTENT` with post-hoc snapshots as a backstop; Cursor uses native deny rules in `.cursor/cli.json` with post-hoc snapshots as a backstop; Codex uses app-server permission interception (optimistic) and post-hoc filesystem snapshots. Per-stage agent overrides work with any supported adapter without requiring settings-file hooks except for Claude.

### Self-Refining Review Loop Example
This pattern enables autonomous correction loops without a separate fix stage.

```yaml
stages:
  - name: Implement

  - name: Review Code
    max_iterations: 5
    max_iterations_next_stage: Verify
    prompt_template: |
      Review the implementation and edit the code directly when focused fixes are needed.
      Do not use `APPROVED` status if this run edited any code or tests.
      Use `APPROVED` status only when the code is ready for verification and this run made no code or test edits.
    contract:
      fields:
        Findings:
          description: Key issues found during the review.
          example: |
            - Retry coverage does not assert the exhausted-attempts path.
        Required Changes:
          description: Concrete fixes required before approval.
          example: |
            - Add a regression test for the exhausted retry path.
      routes:
        APPROVED:
          description: The implementation passed review and move to verification.
          next_stage: Verify
        CHANGES_MADE:
          description: This review run applied focused fixes, so the updated implementation must be reviewed again.
          next_stage: Review Code

  - name: Verify
```

**Contract Rules:**
- **No Top-Level Next:** Contract stages MUST use `contract.routes` for branching.
- **Status Match:** Route keys MUST appear in the emitted YAML `Status` field (capitalized). Lowercase `status` is rejected with a clear error message.
- **Injections:** Injected fields MUST have a corresponding entry in `contract.fields` or `contract.field_definitions`.
- **Self-Referencing Routes:** Self-referencing routes (where `next_stage` equals the stage's own `name`) SHOULD use `max_iterations` with `max_iterations_next_stage` to prevent unbounded loops.

### Stage Field: `backup_artifacts`

Declare `backup_artifacts: [list, of, paths]` on any stage to automatically copy artifact files to `.cybervisor/backups/<stage_name>/<timestamp>/` after the stage completes successfully (passed hook verification and valid artifact validation). Backups are best-effort — missing source files are skipped with a warning and do not abort the pipeline.

**Example:**
```yaml
stages:
  - name: Spec
    backup_artifacts:
      - .cybervisor/artifacts/spec.md
      - .cybervisor/artifacts/plan.md
```

**Behavior:**
- A stage with `backup_artifacts: []` or without the field performs no backup.
- Relative paths are resolved against the task's working directory.
- Each successful stage completion creates a new timestamped backup directory (format: `YYYY-MM-DDTHH-MM-SS`, UTC). Previous backups are preserved — no overwrite.
- `.cybervisor/backups/` is never wiped by the pipeline's artifact reset. `.cybervisor/artifacts/` cleanup is skipped when files are present, preserving pre-written or seeded artifacts across pipeline restarts.
- Backup occurs only after successful stage completion — failures or retries do not trigger a backup.

See the full reference in [Pipeline Authoring Guide](pipeline-authoring.md#backup_artifacts) for daemon-mode behavior and edge cases.

### Stage Field: `keep_artifacts`

Declare `keep_artifacts: [list, of, paths]` on any stage to block it if the named artifacts are missing at hook invocation. The hook checks `Path.exists()` for each path before allowing the stage to complete. Missing files produce a `block` decision with a remediation message directing the agent to recreate them.

See the full reference in [Pipeline Authoring Guide](pipeline-authoring.md#keep_artifacts) for path rules, deduplication, daemon-mode behavior, and failure-before-teardown isolation.

### Stage Field: `cleanup`

Declare `cleanup: [list, of, paths]` on any stage to sweep files at the declared paths before the stage's agent starts. For directories, all contents (files, symlinks, and subdirectories) are removed recursively, preserving only the directory itself; regular files and symlinks are removed directly. Use `cleanup` on stages that produce their own artifacts and need a clean slate from a previous run (e.g., Spec to discard stale specs before regenerating). Avoid on stages that depend on upstream artifacts (e.g., Review, Implement, Verify), since sweeping would destroy the inputs the stage needs.

**Example:**
```yaml
stages:
  - name: Implement
    cleanup:
      - .cybervisor/artifacts
      - .cybervisor/backups
```

See the full reference in [Pipeline Authoring Guide](pipeline-authoring.md#cleanup) for path validation rules, interaction with `keep_artifacts`, and safety warnings.

### Stage Fields: `max_iterations` and `max_iterations_next_stage`

Set `max_iterations` on a stage to cap how many times it may be visited (including contract route-backs). The counter increments on fresh visits only (not on retries), never resets on success, and triggers forced routing when exceeded. When the cap is exceeded, the pipeline forces a route to `max_iterations_next_stage` instead of following normal contract routing. Default is `0` (disabled). Stages with `max_iterations > 0` log the current iteration count at stage start (e.g., `iteration 1/5`) in both stderr output and JSON logs, and include `iteration_count` and `max_iterations` in stage-start events.

**Example:**
```yaml
stages:
  - name: Review Code
    max_retries: 3
    max_iterations: 5
    max_iterations_next_stage: Verify
```

See the full reference in [Pipeline Authoring Guide](pipeline-authoring.md#max_iterations) for iteration counting semantics, fallback behavior, and interaction with `end_stage_name`.

### Global Config: `stage_models`

Add a top-level `stage_models` section in `~/.cybervisor/config.yaml` to override the agent tool model for specific stages. Keys are stage names (case-sensitive); values are model identifiers (e.g., `claude-sonnet-4-6`, `gemini-2.5-pro`). The verifier always uses the global `llm.model`.

```yaml
# ~/.cybervisor/config.yaml
agent_tool: claude
llm:
  api_key: "sk-..."
  model: "gpt-4o"

stage_models:
  Spec: "claude-sonnet-4-6"
  "Review Code": "claude-opus-4-6"
```

The previous `llm.stage_models` key is deprecated; if present, a warning is logged and the value is ignored. Migrate by moving `stage_models` to the top level.

See the full reference in [Pipeline Authoring Guide](pipeline-authoring.md#stage_models) for resolution order and runtime behavior.

### Global Config: `disabled_skills`

Add a top-level `disabled_skills` list in `cybervisor.yaml` to selectively disable project-local agent skills before a pipeline run. This prevents skill sets that conflict with cybervisor's own workflow and contract enforcement from interfering with autonomous execution.

```yaml
disabled_skills:
  # Individual skill directory names (not skill set names)
  - brainstorming
  - speckit-specify
  - openspec-propose
```

**Validation rules:**
- Each entry must be a string matching the exact directory name installed under the agent's project-local skills directory (e.g., `.claude/skills/`, `.gemini/skills/`, `.agents/skills/`).
- Entries must not contain `/` or `\` (path separators) and must not be `.` or `..` (directory traversal). Invalid entries cause cybervisor to exit with an error at startup.
- Skill set names like `superpowers`, `speckit`, or `openspec` are not valid entries — use individual skill directory names instead.

**Behavior:**
- At pipeline start, `cybervisor` first restores any skills left behind by a previous unclean shutdown, then moves each listed skill from the project-local skills directory to `.cybervisor/backups/skills/<adapter>/` (where `<adapter>` is `claude`, `gemini`, or `codex`; `opencode` and `cursor` have no project-local skills directories and are skipped).
- After the pipeline finishes (success, failure, or interrupt), all moved skills are restored to their original locations.
- Global skills directories (`~/.claude/skills/`, `~/.gemini/skills/`, etc.) are never touched.
- The default scaffolds (`simple` and `speckit`) include `disabled_skills` listing every individual skill directory name from the superpowers, speckit, and openspec skill sets.

**Adapter directory mapping:**
| Adapter | Project-local skills directory |
|---------|-------------------------------|
| `claude` | `.claude/skills/` |
| `gemini` | `.gemini/skills/` |
| `codex` | `.agents/skills/` |
| `opencode` | None (OpenCode uses `.opencode/agents/` for its own agent definitions, which does not map to cybervisor's skills concept) |
| `cursor` | None (Cursor has no project-local skills directory; all enforcement is at the ACP layer) |

See the full reference in [Runtime and Daemon — User Guide](runtime-user.md#skill-disablerestore) for the skill disable/restore lifecycle.

### Stage Config: `read_only_paths`

Add a per-stage `read_only_paths` list in `cybervisor.yaml` to block write-tool calls targeting matching file paths during that stage and inject a read-only-paths section into the stage prompt so the agent knows which paths are off-limits upfront. This prevents coding agents from modifying source code or config files during design stages where only specs and artifacts should be written, while allowing full write access during implementation stages.

```yaml
stages:
  - name: Design Delivery
    read_only_paths:
      - "src/**"
      - "pyproject.toml"
      - "tests/**"
    cleanup:
      - .cybervisor/artifacts
    max_retries: 5
    next_stage: Review Delivery Docs
```

**Behavior:**
- When a stage has `read_only_paths` set, write protection is enforced per adapter: Claude Code uses a `PreToolUse` hook (blocks writes at launch time); Gemini, OpenCode, and Cursor enforce it via post-hoc filesystem snapshots that detect and restore protected-file modifications after each turn; Codex app-server snapshots matching files, restores protected changes after each turn, and fails the attempt.
- Write tools (`Write`, `Edit`, `NotebookEdit`) extract the target file path and check it against all patterns.
- Bash tool calls are inspected for file-write patterns (`>`, `>>`, `sed -i`, `tee`). If a write pattern targets a read-only path, the call is blocked. This is conservative — false positives are accepted over missed writes.
- Read tools (`Read`, `Glob`, `Grep`, etc.) are always allowed and are not included in the hook matcher, so the hook is never invoked for them.
- When `read_only_paths` is empty or absent for a stage, no tool-use hook is installed for that stage, avoiding overhead on every tool call.
- The tool-use hook is installed per-stage: stages with `read_only_paths` get write protection; stages without it run without the hook.
- When `read_only_paths` is non-empty, the pipeline runner also appends a read-only-paths section to the stage prompt listing each pattern and instructing the agent not to modify matching files. This reduces wasted tool-call budget on writes that would be blocked anyway. The section appears after the injection appendix (if any) and before contract guidance.
- The `Stop` / `AfterAgent` verifier hook continues to work independently.

**Validation rules:**
- Each entry must be a non-empty, relative path string. Patterns use path-segment glob matching: `*` matches within one path segment, while `**` matches zero or more path segments. For example, `src/*.py` matches `src/foo.py`, `src/**/*.py` also matches `src/sub/bar.py`, and `src/**` matches everything under `src/`.
- Absolute paths and paths containing `..` are rejected at config validation time.
- Patterns are resolved relative to the workspace root.
- If a `read_only_paths` pattern matches a `keep_artifacts` entry for the same stage, a warning is emitted because the hook will block writes to files the stage expects to be present.

**Migration:** The top-level `read_only_paths` key and the previous `protected_paths` key are no longer accepted. If either is present, a validation error is raised with a migration hint. Move `read_only_paths` into individual stage definitions in your `cybervisor.yaml`.

See the full reference in [Pipeline Authoring Guide](pipeline-authoring.md#read_only_paths) for the field schema, matching semantics, and interaction with other stage fields.
