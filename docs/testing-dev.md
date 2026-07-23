---
title: Testing and Docker Image Reference
---

# Testing and Docker Image Reference

> **Audience: Developers** — Contributors modifying or testing the `cybervisor` codebase.

This document describes the test suite layout, E2E smoke tests, the mock LLM API server, and container building.

---

## Unit Test Files

Key unit test files in `tests/unit/` include:
- `test_config_parsing.py` — Configuration loading and validation
- `test_cli_commands.py` — CLI command dispatch and behavior
- `test_pipeline_stage_execution.py` — Pipeline stage execution
- `test_hook_contracts.py` — Hook contract enforcement
- `test_adapter_registry.py` — Agent adapter registry
- `test_completions.py` — Shell completion script generation and dynamic completer wiring
- `test_daemon_lock.py` — Daemon lock file management and stale-lock recovery

Run the unit tests:
```bash
uv run pytest
```

---

## Smoke Tests

For a dedicated verify-stage smoke test that runs the full pipeline through `Verify` using a minimal feature prompt and the bundled mock LLM API (target runtime: under 90 seconds):

```bash
scripts/e2e-verify-smoke.sh [--agent claude]
```

This is the preferred CI smoke test for exercising cybervisor's verify-stage contract and routing infrastructure. 
- By default it uses `agent_tool: mock` (no external binaries or API keys needed). 
- Pass `--agent claude` to exercise the Claude Code adapter path with all LLM calls still routed through the mock API server. 
- Creates a fresh workspace under `.tmp/e2e-verify/` and points the hook verifier to the mock API (does not touch `~/.cybervisor/config.yaml`).
- Starts the bundled mock LLM API server (`scripts/.e2e_mock_llm_api.py`) in allow mode.
- Runs the full 6-stage simple scaffold pipeline (Plan → Review Plan → Implement → Review Code → Review Docs → Verify).
- Asserts artifact presence, Verify contract, and minimal generated-code footprint.

---

## Mock API Server

The mock API server (`scripts/.e2e_mock_llm_api.py`) is an OpenAI-compatible HTTP server for testing. It:
- Returns deterministic `approve`/`block` decisions for hook verification calls.
- Returns stage-specific responses from a JSON config file for stage-agent calls.

### Standalone Mock API Usage

Start the mock API server alongside a pipeline run:

```bash
python3 scripts/.e2e_mock_llm_api.py \
    --config .cybervisor/mock-stage-config.json \
    --hook-mode allow
```

The server prints its URL to stdout on startup. Point the hook verifier at that URL and use any string as the API key. 
- The `--hook-mode allow` flag causes all hook verification calls to return `approve`; use `--hook-mode block` for `block` decisions.
- Stage-agent calls are routed by stage name extracted from the prompt. Provide a JSON config file mapping stage names to response strings.

Example config JSON:
```json
{
  "Plan": "Write the spec and plan.",
  "Review Plan": "IMPLEMENTATION_READY",
  "Implement": "# Summary\n\nDone.",
  "Review Code": "APPROVED",
  "Review Docs": "APPROVED",
  "Verify": "APPROVED",
  "_fallback": "PASS",
  "claude": {
    "Plan": "Write the spec and plan.",
    "Review Plan": "IMPLEMENTATION_READY",
    "Implement": "# Summary\n\nDone.",
    "Review Code": "APPROVED",
    "Review Docs": "APPROVED",
    "Verify": "APPROVED"
  }
}
```
The top-level entries cover all agent tools; the `"claude"` section overrides specific stage responses for Claude Code tool prompts.

---

## Docker Image Building

The repository includes a single-image `Dockerfile` for the published GHCR image and local sandbox testing. The image installs `cybervisor`, Python tooling, latest Node.js, Playwright with Chromium browser support, and the supported coding-agent CLIs: Claude Code, Codex CLI, OpenCode, and Cursor Agent. (The Claude adapter uses the in-process `claude-agent-sdk` Python SDK and the Antigravity adapter uses the in-process `google-antigravity` Python SDK — neither requires its CLI at runtime, but the Claude CLI is still installed for backward compatibility.)

### Local Build and Dev Sandbox

Build the local image:
```bash
docker build -t cybervisor:local .
```

For the usual local development loop, use the dev sandbox script:
```bash
scripts/dev-sandbox.sh
```

It reinstalls the host `cybervisor` CLI from the current checkout, builds `cybervisor:local`, replaces the matching sandbox container for the current directory, and runs the sandbox attached on port `8766`. Pass a different port as the first argument, for example `scripts/dev-sandbox.sh 9000`.

To run a generated-project smoke test, prepare an isolated workspace first:
```bash
./scripts/e2e-demo-simple-project.sh --dir .tmp/e2e-demo
cd .tmp/e2e-demo
cybervisor sandbox --image cybervisor:local --no-pull
```
