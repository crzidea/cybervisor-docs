---
title: Getting Started with cybervisor
---

# Getting Started with cybervisor

> **Audience: Users** — New users installing and running their first pipeline.

This guide takes you from installation to your first autonomous pipeline run in five minutes.

---

## 1. Install cybervisor

You need Python 3.11+ and `uv`:

```bash
uv tool install cybervisor
cybervisor --version
```

If you prefer a local editable install for development:

```bash
uv tool install -e . --force
cybervisor --version
```

---

## 2. Choose Your Harness

Set the default harness. Options are `claude`, `codex`, `opencode`, `cursor`,
`antigravity`, or `mock`:

```bash
cybervisor use claude
```

For CI or local testing without API keys, use `mock`:

```bash
cybervisor use mock
```

---

## 3. Configure Verifier Credentials (Non-Mock)

Mock mode needs no credentials. For real harnesses, `llm.api_key` in
`~/.cybervisor/config.yaml` is required only when an effective non-contract
stage uses model-assisted stop verification. Contract-enabled stages validate
their result artifacts locally, so a contract-only slice can run without this
key. The selected harness may still need separate credentials; `llm.api_key`
configures the verifier, not the coding runtime.

```bash
mkdir -p ~/.cybervisor
cat > ~/.cybervisor/config.yaml <<'EOF'
harness: claude
llm:
  api_key: your-api-key
  # Optional:
  # base_url: https://api.openai.com/v1
  # model: gpt-4o
EOF
chmod 600 ~/.cybervisor/config.yaml
```

Verify connectivity:

```bash
cybervisor doctor
```

### Runtime Defaults and Per-Stage Overrides

Set the global harness and optional effort default, then group stage-specific
changes under `stage_overrides`:

```yaml
harness: claude
model_effort: medium
llm:
  api_key: your-api-key

stage_overrides:
  Plan:
    harness: codex
    model: gpt-5.6
    effort: xhigh
  Review Code:
    effort: high
```

Each override may set `harness`, `model`, `effort`, any subset, or nothing.
See [Configuration Reference](configuration.md#global-harness-and-per-stage-runtime-overrides)
for resolution order, supported efforts, reload behavior, and migration.

---

## 4. Initialize a Project

Inside your project repository:

```bash
cybervisor init
```

`cybervisor init` detects your environment:

- If `.specify/` exists, it installs the **speckit** scaffold — a 10-stage pipeline integrated with speckit workflows (specification discovery, plan/task management, and structured review loops).
- Otherwise, it installs the **simple** scaffold — a 6-stage standalone pipeline (Plan, Review Plan, Implement, Review Code, Review Docs, Verify) that writes artifacts directly to `.cybervisor/artifacts/` without speckit dependencies.

Both create a `cybervisor.yaml` with the full pipeline configuration.

### The `mock` Harness

The `mock` harness (`cybervisor use mock`) requires no external binary or API
key. It returns a canned success response for every stage, making it useful for
CI testing, pipeline structure validation, and development without real model
access.

### The `cursor` Harness

The `cursor` harness uses the `cursor-sdk>=1.0.24` Python package, included as a
Cybervisor dependency. The platform wheel bundles its own bridge launcher, so no
`cursor-sdk-bridge` binary needs to be on `PATH`. Configure authentication only
through the active Cybervisor config:

```yaml
harness: cursor
harnesses:
  cursor:
    api_key: your-cursor-api-key
```

Environment variables and Cursor CLI login state are not used. Run
`cybervisor doctor` to verify the SDK and API key. See the
[Cursor Harness Guide](/agents/cursor.html) for complete setup details.

### The `claude` Harness

The `claude` harness uses the `claude-agent-sdk` Python SDK and runs in-process
(no CLI binary needed). The SDK is included as a standard Cybervisor
dependency, so no separate install is required. Authentication requires a
supported provider credential such as `ANTHROPIC_API_KEY`. Run
`cybervisor doctor` to verify the adapter reports ready. See the
[Claude Code Harness Guide](/agents/claude.html) for full setup details.

### The `antigravity` Harness

The `antigravity` harness requires the official `agy` CLI version 1.1.8 or
newer. Install it on macOS or Linux, then launch it once to sign in:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy
```

Cybervisor uses the CLI's headless `stream-json` mode and the user's normal
Antigravity login. Values from `stage_overrides.<stage>.model` are passed
verbatim. See the [Antigravity Harness Guide](/agents/antigravity.html) for
permission ownership, timeout configuration, cancellation, and troubleshooting.

### The `opencode` Harness

The `opencode` harness requires the `opencode` CLI on `PATH`, authenticated
through the normal OpenCode CLI workflow, with `opencode serve` support
(OpenCode v0.12.0 or later). `cybervisor doctor` checks serve-mode support.
Each stage starts an isolated local server and injects model, effort,
permission, and file-context settings without modifying workspace config. Use
`stage_overrides.<stage>.model` to override its model. See
[OpenCode Notes](configuration.md#opencode-notes) for setup details.

---

## 5. Shell Completions

cybervisor supports bash tab completion through two mechanisms:

**Eval-based (dynamic, requires argcomplete):**

```bash
uv tool install 'cybervisor[completions]'
eval "$(register-python-argcomplete cybervisor)"
```

Add the `eval` line to `~/.bashrc` to persist across sessions. This mode
provides dynamic completions for stage names, harnesses, and document IDs.

**Static script (no dependencies):**

```bash
source <(cybervisor completion bash)
```

Add to `~/.bashrc` for persistence. This covers subcommands, flags, and static choices (e.g., `--template simple|speckit`) without runtime dependencies.

For full details, see [Shell Completions](/completions.html).

---

## 6. Run Your First Pipeline

Pass a prompt describing what you want built:

```bash
cybervisor "Create a 360 feedback system"
```

Or pipe from stdin:

```bash
printf "Create a 360 feedback system" | cybervisor run
```

Watch the pipeline execute stage by stage. Output streams to stderr; full logs are written to `.cybervisor/logs/`. Logs are cleared before each run so they always reflect the current execution — previous run logs are not preserved.

---

## 7. Inspect Results

After the run finishes:

```bash
# Structured JSONL logs
cat .cybervisor/logs/cybervisor.log.jsonl

# Per-stage transcripts
ls .cybervisor/logs/stages/

# Contract artifacts (if any stage emitted routing decisions)
ls .cybervisor/contracts/artifacts/
```

---

## 8. Restart or Cancel

If you interrupt a run with Ctrl-C, cybervisor cleans up settings and skills automatically. To start fresh from a specific stage later, use `--start-from`:

```bash
cybervisor run "Create a 360 feedback system" --start-from "Implement"
```

`--start-from` alone starts a **fresh** agent session at the selected stage — it does not automatically reuse the previous session.

When a stage breaks after an agent session is captured, cybervisor persists the session metadata under `.cybervisor/latest-session.json`. To continue from that session instead of starting fresh, add `--resume`:

```bash
cybervisor run "Create a 360 feedback system" --start-from "Implement" --resume
```

- The stage name, adapter name, and workspace root must all match the stored metadata.
- If the adapter does not support continuation, or metadata is absent or mismatched, cybervisor logs the reason and starts a fresh attempt.
- This works with both `cybervisor run` and `cybervisor submit`.

To stop after a specific stage:

```bash
cybervisor run "Create a 360 feedback system" --end-after "Review Code"
```

---

## Next Steps

- Learn the full config surface: [Configuration Reference](/configuration.html)
- Design custom pipelines with contracts: [Pipeline Authoring Guide](/pipeline-authoring.html)
- Run in daemon mode for headless/remote execution: [Runtime and Daemon](/runtime-user.html) and [WebSocket Protocol](/websocket-protocol.html)
- Troubleshoot common issues: [Troubleshooting](/troubleshooting/index.html)
