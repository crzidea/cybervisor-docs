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

## 2. Choose Your Agent

Set the default agent tool. Options are `claude`, `gemini`, `codex`, `opencode`, `cursor`, or `mock`:

```bash
cybervisor use claude
```

For CI or local testing without API keys, use `mock`:

```bash
cybervisor use mock
```

---

## 3. Configure Verifier Credentials (Non-Mock)

Mock mode needs no credentials. For real agents, create `~/.cybervisor/config.yaml`:

```bash
mkdir -p ~/.cybervisor
cat > ~/.cybervisor/config.yaml <<'EOF'
agent_tool: claude
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

### Per-Stage Model Override (`stage_models`)

To use a different agent tool model for specific stages, add a top-level `stage_models` mapping to `~/.cybervisor/config.yaml`:

```yaml
agent_tool: claude
llm:
  api_key: your-api-key
  model: gpt-4o

stage_models:
  Spec: "claude-sonnet-4-6"
  "Review Code": "claude-opus-4-6"
```

Each key is a stage name (case-sensitive, matching `cybervisor.yaml`); the value is the model identifier to use for that stage. Stages not listed fall back to the agent tool's default model. The verifier always uses `llm.model` globally.

### Per-Stage Agent Override (`stage_agents`)

To use a different agent tool for a specific stage, add a top-level `stage_agents` section in `~/.cybervisor/config.yaml`:

```yaml
# ~/.cybervisor/config.yaml
agent_tool: claude
stage_agents:
  "Design Delivery": gemini
  "Review Delivery Docs": gemini
```

Each key is a stage name (case-sensitive, matching `cybervisor.yaml`); the value is the agent tool to use for that stage. Values must match a supported agent name (`claude`, `gemini`, `codex`, `opencode`, `cursor`, `mock`). Stages not listed fall back to the global `agent_tool`. See [Configuration Reference — Global Config: stage_agents](configuration.md#stage-agents) for full details.

---

## 4. Initialize a Project

Inside your project repository:

```bash
cybervisor init
```

`cybervisor init` detects your environment:

- If `.specify/` exists, it installs the **speckit** scaffold — a 10-stage pipeline integrated with speckit workflows (specification discovery, plan/task management, and structured review loops).
- Otherwise, it installs the **simple** scaffold — a 6-stage standalone pipeline (Design Delivery, Review Delivery Docs, Implement, Review Code, Review Docs, Verify) that writes artifacts directly to `.cybervisor/artifacts/` without speckit dependencies.

Both create a `cybervisor.yaml` with the full pipeline configuration.

### The `mock` Agent

The `mock` agent (`cybervisor use mock`) requires no external binary or API key. It returns a canned success response for every stage, making it useful for CI testing, pipeline structure validation, and development without real agent access.

### The `cursor` Agent

The `cursor` agent requires the `cursor-agent` CLI on `PATH` with ACP mode support (`cursor-agent acp` must be available). Before running a pipeline, authenticate by setting `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN` in the environment, or by running `cursor login`. See [Configuration Reference — Cursor Notes](configuration.md#cursor-notes) for full setup details.

### The `opencode` Agent

The `opencode` agent requires the `opencode` CLI on `PATH` with ACP mode support (`opencode acp` must be available; OpenCode v0.4.0 or later). Cybervisor injects model, permission, and file-context settings through `OPENCODE_CONFIG_CONTENT` and does **not** create or modify `opencode.json` in your workspace. Use top-level `stage_models` in `~/.cybervisor/config.yaml` to override the model for specific OpenCode stages. See [Configuration Reference — OpenCode Notes](configuration.md#opencode-notes) for full setup details.

---

## 5. Shell Completions

cybervisor supports bash tab completion through two mechanisms:

**Eval-based (dynamic, requires argcomplete):**

```bash
uv tool install 'cybervisor[completions]'
eval "$(register-python-argcomplete cybervisor)"
```

Add the `eval` line to `~/.bashrc` to persist across sessions. This mode provides dynamic completions for stage names, agent tools, and document IDs.

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

Watch the pipeline execute stage by stage. Output streams to stderr; full logs are written to `.cybervisor/logs/`.

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

## 8. Resume or Cancel

If you interrupt a run with Ctrl-C, cybervisor cleans up settings and skills automatically. To resume from a specific stage later:

```bash
cybervisor run "Create a 360 feedback system" --start-stage "Implement"
```

To stop after a specific stage:

```bash
cybervisor run "Create a 360 feedback system" --end-after "Review Code"
```

---

## Next Steps

- Learn the full config surface: [Configuration Reference](/configuration.html)
- Design custom pipelines with contracts: [Pipeline Authoring Guide](/pipeline-authoring.html)
- Run in daemon mode for headless/remote execution: [Runtime and Daemon](/runtime-user.html) and [WebSocket Protocol](/websocket-protocol.html)
- Troubleshoot common issues: [Troubleshooting](/troubleshooting.html)
