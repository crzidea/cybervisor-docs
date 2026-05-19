---
title: Testing and Sandbox
---

# Testing and Sandbox

> **Audience: Users and Developers**

## Unit Test Files

Key unit test files in `tests/unit/` include:

- `test_config_parsing.py` — Configuration loading and validation
- `test_cli_commands.py` — CLI command dispatch and behavior
- `test_pipeline_stage_execution.py` — Pipeline stage execution
- `test_hook_contracts.py` — Hook contract enforcement
- `test_adapter_registry.py` — Agent adapter registry
- `test_completions.py` — Shell completion script generation and dynamic completer wiring
- `test_daemon_lock.py` — Daemon lock file management and stale-lock recovery

## Smoke Tests

For the standalone `cybervisor init` scaffold in a repo without `.specify/`, use:

```bash
scripts/e2e-demo-simple-project.sh
```

That script:

- creates a fresh temporary standalone workspace instead of reusing the `cybervisor` repo root
- runs `cybervisor init` inside that new workspace so simple-scaffold verification uses an isolated environment
- is the preferred bootstrap for `cybervisor` self-hosted smoke tests that should not inherit repo-root state
- supports `--dir` to choose the target workspace path and otherwise defaults to `.tmp/e2e-demo-simple`
- initializes a fresh git repository when `git` is available
- prints the exact `cd` and `cybervisor` command to run manually
- reminds you to install the CLI first if `cybervisor` is not yet on your `PATH`

For a dedicated verify-stage smoke test that runs the full pipeline through `Verify` using a minimal feature prompt and the bundled mock LLM API (target: under 90 seconds):

```bash
scripts/e2e-verify-smoke.sh [--agent claude]
```

This is the preferred CI smoke test for exercising cybervisor's verify-stage contract and routing infrastructure. By default it uses `agent_tool: mock` (no external binaries or API keys needed). Pass `--agent claude` to exercise the Claude Code adapter path with all LLM calls still routed through the mock API server. It:

- Creates a fresh workspace under `.tmp/e2e-verify/`
- Writes a workspace-local `.cybervisor/config.yaml` pointing the hook verifier to the mock API (does not touch `~/.cybervisor/config.yaml`)
- Starts the bundled mock LLM API server (`scripts/.e2e_mock_llm_api.py`) in allow mode
- Runs the full 6-stage simple scaffold pipeline (Design Delivery → Review Delivery Docs → Implement → Review Code → Review Docs → Verify)
- Asserts artifact presence, Verify contract, and minimal generated-code footprint

## Mock Adapter (`agent_tool: mock`)

When `agent_tool: mock` is set in `cybervisor.yaml` or `~/.cybervisor/config.yaml`, the pipeline uses the built-in mock adapter instead of launching an external agent tool. The adapter completes every stage with a zero-exit process and:

- Emits contract artifacts for stages that have a contract with field-injection routes (e.g. `Review Delivery Docs`, `Review Code`, `Verify`). The status value is the first route key from the loaded config.
- Does **not** emit artifacts for routing-only stages — stages whose contracts redirect to another stage without injecting fields (e.g. `Review Docs`).
- Does **not** generate design artifacts (spec.md, plan.md, tasks.md). Design artifacts must be provided externally — e.g., pre-written by the smoke test script or seeded in test fixtures. On the `Design Delivery` stage the adapter is a pass-through; contract artifacts are still emitted for downstream stages.
- Falls back gracefully when `cybervisor.yaml` is absent or malformed, skipping contract artifact emission rather than raising.

Useful demo paths:
- Demo workspace: `.tmp/e2e-demo-simple/`
- Smoke test workspace: `.tmp/e2e-verify/`
- Contract artifacts: `.tmp/e2e-verify/.cybervisor/contracts/artifacts/`
- Runtime logs: `.tmp/e2e-verify/.cybervisor/logs/`

## Mock API Server

The mock API server (`scripts/.e2e_mock_llm_api.py`) is an OpenAI-compatible HTTP server for testing. It:

- Returns deterministic `approve`/`block` decisions for hook verification calls
- Returns stage-specific responses from a JSON config file for stage-agent calls

### Standalone Mock API Usage

Start the mock API server alongside a pipeline run:

```bash
python3 scripts/.e2e_mock_llm_api.py \
    --config .cybervisor/mock-stage-config.json \
    --hook-mode allow
```

The server prints its URL to stdout on startup. Point the hook verifier at that URL and use any string as the API key. The `--hook-mode allow` flag causes all hook verification calls to return `approve`; use `--hook-mode block` for `block` decisions.

Stage-agent calls are routed by stage name extracted from the prompt. Provide a JSON config file mapping stage names to response strings:

```json
{
  "Design Delivery": "Write the spec and plan.",
  "Review Delivery Docs": "IMPLEMENTATION_READY",
  "Implement": "# Summary\n\nDone.",
  "Review Code": "APPROVED",
  "Review Docs": "APPROVED",
  "Verify": "APPROVED",
  "_fallback": "PASS",
  "claude": {
    "Design Delivery": "Write the spec and plan.",
    "Review Delivery Docs": "IMPLEMENTATION_READY",
    "Implement": "# Summary\n\nDone.",
    "Review Code": "APPROVED",
    "Review Docs": "APPROVED",
    "Verify": "APPROVED"
  }
}
```

The top-level entries cover all agent tools; the `"claude"` section overrides specific stage responses for Claude Code tool prompts (useful when the stage name appears in a different prompt format). Entries in `"claude"` take priority over top-level entries when the active agent is Claude Code.

## Docker Image

The repository includes a single-image `Dockerfile` for the published GHCR image and local sandbox testing. The image installs `cybervisor`, Python tooling, latest Node.js, and the supported coding-agent CLIs: Claude Code, Gemini CLI, Codex CLI, OpenCode, and Cursor Agent.

The `cybervisor-container` workflow checks out this repository and builds `cybervisor/Dockerfile`.

Build the local image:

```bash
docker build -t cybervisor:local .
```

Use the local image with the sandbox daemon:

```bash
cybervisor sandbox --image cybervisor:local --no-pull
```

For the usual local development loop, use the dev sandbox script:

```bash
scripts/dev-sandbox.sh
```

It reinstalls the host `cybervisor` CLI from the current checkout, builds `cybervisor:local`, replaces the matching sandbox container for the current directory, and runs the sandbox attached on port `8766`. Pass a different port as the first argument, for example `scripts/dev-sandbox.sh 9000`.

For generated-project smoke testing, prepare an isolated workspace first:

```bash
./scripts/e2e-demo-simple-project.sh --dir .tmp/e2e-demo
cd .tmp/e2e-demo
cybervisor sandbox --image cybervisor:local --no-pull
```

The sandbox command mounts the current working directory and home directory into the container at the same absolute paths, so agent credential directories such as `~/.claude`, `~/.codex`, `~/.cursor`, `~/.opencode`, and `~/.gemini` remain available inside the container.

## Docker Sandbox Serve

`cybervisor sandbox` launches the cybervisor daemon inside an isolated Docker container with the current working directory mounted. This is useful for CI/CD pipelines, restricted workstations, or environments where direct tool installation is impractical.

### Usage

```bash
# Basic sandbox serve (defaults to 127.0.0.1:8765)
cybervisor sandbox

# Custom host/port
cybervisor sandbox --host 0.0.0.0 --port 9000

# Run container in background
cybervisor sandbox --background --port 9000

# Use a custom image
cybervisor sandbox --image myregistry/cybervisor:dev

# Custom container name
cybervisor sandbox --name my-sandbox

# Skip auto-pull, use cached image
cybervisor sandbox --no-pull
```

### Options

| Flag | Default | Purpose |
|------|---------|---------|
| `--host` | `127.0.0.1` | Host address to bind on the host machine |
| `--port` | `8765` | Host port to expose |
| `--background` | `false` | Run container in background (detached) |
| `--image` | `ghcr.io/crzidea/cybervisor:latest` | Docker image to use (pulled automatically on each run unless `--no-pull` is passed) |
| `--no-pull` | `false` | Skip automatic image pull; use local image as-is |
| `--name` | `cybervisor-sandbox-<hash>` | Container name (auto-generated from cwd hash if omitted) |

### Image Pull Behavior

By default, `cybervisor sandbox` pulls the image from the registry before starting the container. This ensures the running container matches the latest published version.

- **Pull succeeds**: Container starts with the freshly pulled image.
- **Pull fails but a local image exists**: A warning is logged and the container starts with the local image. This covers intermittent network errors and registry outages.
- **Pull fails and no local image exists**: The command exits with an error. Download the image manually (`docker pull <image>`) and retry, or check your network and registry access.
- **`--no-pull` with no local image**: The command exits with an error indicating the image was not found locally and `--no-pull` was specified. Run without `--no-pull` to download the image first.

Pass `--no-pull` to skip the automatic pull and use the cached local image. This is useful in CI jobs that pin a specific image digest, air-gapped environments without registry access, or when iterating locally and network latency is a concern.

### Version Output

When `cybervisor sandbox` starts, it logs two labeled version lines:

```
INFO | cybervisor CLI 0.18.1
INFO | cybervisor daemon 0.18.1
```

The **CLI** line shows the host's installed version. If a newer release is available on PyPI, it appends the latest version:

```
INFO | cybervisor CLI 0.18.1 (latest: 0.18.2)
```

When PyPI is unreachable or the installed version is already the latest, no suffix is shown — no error or "up to date" message.

The **daemon** line shows the version running inside the container. Both lines should display the same version number. If they differ, the container image may be outdated — pull the latest image with `cybervisor sandbox` (without `--no-pull`) or run `docker pull ghcr.io/crzidea/cybervisor:latest`.

### Network Architecture

The container uses `--network=host`, sharing the host's network stack directly. The `--host` and `--port` flags are passed through to `cybervisor serve` inside the container, so the daemon binds to the specified address and port without Docker port mapping. This means the container can reach all external services the host can (package registries, API endpoints, git remotes).

### Volume Mounts

Host directories are mounted to the same absolute path inside the container, so tools like Claude, Codex, Cursor, OpenCode, and Gemini find their config at the expected `~/.claude/`, `~/.codex/`, `~/.cursor/`, `~/.opencode/`, `~/.gemini/`, etc.

| Host Path | Container Path | Condition |
|-----------|---------------|-----------|
| Current working directory | Same as host path | Always |
| `~/` (home directory) | Same as host path | Always |
| `/etc/passwd` | `/etc/passwd` | Read-only, for UID/GID name resolution |
| `/etc/group` | `/etc/group` | Read-only, for UID/GID name resolution |

The home directory mount covers `~/.cybervisor`, `~/.claude.json`, and agent credential directories. The sandbox avoids additional overlapping subdirectory mounts so Docker's inspected mount list remains small and readable.

### Environment Variables

- `HOST_HOME` is set inside the container to the host user's home directory.
- `HOME` is set to the same path as the host home directory inside the container.
- `PYTHONNOUSERSITE=1` is set inside the container to prevent the host's `site.USER_SITE` directory from shadowing the container's own package metadata. This ensures the daemon reports the correct installed version.
- API key environment variables (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `CYBERVISOR_LLM_*`) are forwarded if set on the host.

### Lifecycle

- **Foreground mode** (default): Container runs attached to the terminal. `--rm` is passed so the container is auto-removed on exit. Pressing Ctrl+C sends SIGTERM to the container for graceful shutdown.
- **Background mode** (`--background`): Container starts detached. The container ID is printed. Use `docker stop <name>` to stop.
