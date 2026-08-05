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
- `evaluation/test_contracts_events_prompts.py` — post-run contract evaluation
- `test_adapter_registry.py` — Harness adapter registry
- `test_completions.py` — Shell completion script generation and dynamic completer wiring
- `test_daemon_lock.py` — Daemon lock file management and stale-lock recovery

Run the unit tests:
```bash
uv run pytest
```

---

## Smoke Tests

For a dedicated verify-stage smoke test that runs from `Review Plan` through `Verify` using a minimal feature prompt and the bundled mock LLM API (target runtime: under 90 seconds):

```bash
scripts/e2e-verify-smoke.sh [--harness claude]
```

This is the preferred CI smoke test for exercising cybervisor's verify-stage contract and routing infrastructure.
- By default it uses `harness: mock` (no external binaries or API keys needed).
- Pass `--harness claude` to exercise the Claude Code adapter path with all LLM calls still routed through the mock API server.
- Creates a fresh workspace under `.tmp/e2e-verify/` and points the verifier to the mock API (does not touch `~/.cybervisor/config.yaml`).
- Starts the bundled mock LLM API server (`scripts/.e2e_mock_llm_api.py`) in allow mode.
- Runs the final five simple scaffold stages (Review Plan → Implement → Review Code → Review Docs → Verify).
- Skips Plan because the required planning artifacts are pre-written.
- Asserts artifact presence, Verify contract, and minimal generated-code footprint.

---

## Mock API Server

The mock API server (`scripts/.e2e_mock_llm_api.py`) is an OpenAI-compatible HTTP server for testing. It:
- Returns deterministic `approve`/`block` decisions for verifier calls.
- Returns stage-specific responses from a JSON config file for harness-backed stage calls.

### Standalone Mock API Usage

Start the mock API server alongside a pipeline run:

```bash
python3 scripts/.e2e_mock_llm_api.py \
    --config .cybervisor/mock-stage-config.json \
    --hook-mode allow
```

The server prints its URL to stdout on startup. Point the verifier at that URL and use any string as the API key.
- The mock server's `--hook-mode allow` flag causes all verifier calls to return `approve`; use `--hook-mode block` for `block` decisions. This flag controls mock verifier responses and is unrelated to Cybervisor's removed agent-hook runtime.
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
The top-level entries cover all harnesses; the `"claude"` section overrides specific stage responses for Claude Code tool prompts.

---

## Docker Image Building

The repository includes a single-image `Dockerfile` for the published GHCR image and local sandbox testing. The image installs `cybervisor`, Python tooling, latest Node.js, Playwright with Chromium, Claude Code, OpenCode, and the official `agy` binary. Codex uses the `openai-codex` Python package and its bundled runtime. Antigravity credentials are not built into the image; operators must provide access to an authenticated keyring or complete login in the running environment.

The image declares `ENV IS_SANDBOX=1` so Claude stages can use `bypassPermissions` while the container runs as root. Host installations do not receive this declaration automatically; it is scoped to the container trust boundary only.

### Local Build and Dev Sandbox

Build the local image:
```bash
docker build -t cybervisor:local .
```

For the usual local development loop, use the dev sandbox script:
```bash
scripts/dev-sandbox.sh
```

It requires `mcp.client_id` and `mcp.client_secret` in `~/.cybervisor/config.yaml`, upgrades every locked dependency to the newest compatible release, reinstalls the host `cybervisor` CLI from the current checkout with upgraded dependencies, builds `cybervisor:local` from the refreshed lockfile, replaces the matching sandbox container for the current directory, and runs the sandbox attached with the daemon on port `8766` and the OAuth-protected MCP server on port `8767`. Review and commit the resulting `uv.lock` changes before publishing. Pass a different daemon port as the first argument; the MCP port defaults to the next port. Pass both ports to override them independently, for example `scripts/dev-sandbox.sh 9000 9100`. For ChatGPT or Gemini Spark, expose the MCP port through HTTPS and pass the exact external endpoint with `scripts/dev-sandbox.sh 9000 9100 --mcp-public-url https://workspace.example.com/mcp`, then enter the same configured client ID and secret in the client's manual OAuth fields.

To run a generated-project smoke test, prepare an isolated workspace first:
```bash
./scripts/e2e-demo-simple-project.sh --dir .tmp/e2e-demo
cd .tmp/e2e-demo
cybervisor sandbox --image cybervisor:local --no-pull
```
