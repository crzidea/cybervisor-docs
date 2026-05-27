---
title: Development
---

# Development

> **Audience: Developers** — Contributors modifying the cybervisor source code.

If you are contributing to `cybervisor`:

User-facing workflow or specification changes should be documented in tracked files under `docs/` and, when relevant, the README. Do not leave those changes only in local working directories such as `specs/` or `.cybervisor/artifacts/`, because they are not part of the committed project history.

To preview or publish the browser documentation site, use the sibling `cybervisor-docs/` project in the workspace: run `npm run sync` there after editing files in this `docs/` directory, then `npm run dev` or `npm run build`. When you add or rename a doc page, update the VitePress sidebar in `cybervisor-docs/.vitepress/config.mjs`. See `cybervisor-docs/README.md` for deploy steps.

```bash
uv sync
uv run ruff check src/
uv run mypy --strict src/
uv run pytest
```

For self-hosted E2E or verify-stage smoke tests, do not run from the repository root when the goal is to simulate a generated project. Create an isolated demo workspace first, typically with:

```bash
./scripts/e2e-demo-simple-project.sh
```

For a fast smoke test that exercises the full pipeline through `Verify` using a minimal feature prompt and mock LLM API:

```bash
./scripts/e2e-verify-smoke.sh
./scripts/e2e-verify-smoke.sh --agent claude   # use Claude Code adapter instead of mock
```

Both modes route all LLM calls (hook verifier and stage-agent) through the bundled mock API server, so no real API keys are needed.

Release helper:

```bash
./scripts/publish.sh patch  # or minor, major
```

The script requires a clean git working tree, bumps the package version, refreshes `uv.lock`, creates a release commit and annotated git tag like `v0.7.1`, pushes the tag, then tags `https://github.com/crzidea/cybervisor-container` to trigger the GHCR image workflow. The container workflow checks out the matching `cybervisor` tag and builds the `cybervisor` target from this repository's `Dockerfile`.

## Test Coverage

Run coverage with:

```bash
uv run pytest --cov
```

The following source modules currently lack direct test coverage (no test file exercises their logic in isolation):

- `adapters/codex/_app_helpers.py`
- `client/commands.py`
- `client/rendering.py`
- `client/streaming.py`
- `cli/_standalone_cmds.py`
- `pipeline/_interrupt.py`
- `server/_path.py`
- `server/_task_exec.py`
- `server/_daemon_config.py`

If `uv` fails with a cache permission error, set a writable cache directory:

```bash
export UV_CACHE_DIR=/tmp/uv-cache
uv run pytest --cov
```

## Adding a New Adapter

See [Adding an Adapter](/contributing/adding-an-adapter.html) for the full maintainer contract, required interface members, event spec, and validation checklist.

## Repository Layout

```text
src/cybervisor/        Core CLI package (split into focused subpackages)
  cli/                 CLI entry point (commands, _daemon_cmds, _standalone_cmds, parser, instance, docs, serve_sandbox)
  client/              Daemon WebSocket client (commands, connection, rendering, streaming)
  pipeline/            Pipeline execution (runner, _execution, _cleanup, _interrupt, _routing, artifacts, contract)
  server/              Daemon WebSocket server (daemon, _daemon_config, handlers, _task_exec, tasks, _cleanup, _path)
  core_hooks/          Hook runtime (runner, tool_use, _http, contracts, streaming, verifier, common)
  adapters/            Agent adapter registry and tool-specific adapters (gemini, claude, codex, opencode, cursor, antigravity, mock)
    codex/             Codex adapter (adapter, app_server, _app_helpers)
    gemini/            Gemini adapter (adapter, acp_transport, _acp_helpers, stream)
    claude/            Claude adapter (adapter)
    opencode/          OpenCode adapter (adapter, serve_transport, serve_client, stream)
    cursor/            Cursor adapter (adapter, acp_transport, _acp_helpers, stream)
    antigravity/       Antigravity adapter (adapter, _handle, _sdk_wrapper)
    mock/              Mock adapter (adapter)
  config/              Configuration package (_types, _parsing, _stage_parsing; re-exports through __init__)
  cli.py, client.py,   Thin backward-compatible re-exports
  pipeline.py, server.py
  hooks.py             Hook installer and runtime config
  agent_hook.py        Packaged cybervisor-agent-hook entry point
  preflight.py         Dependency pre-check
  signals.py           Signal handler
  logging.py           Structured logging
  init.py              Scaffold installer (`cybervisor init`)
  doctor.py            Verifier readiness check (`cybervisor doctor`)
  global_config.py     ~/.cybervisor/config.yaml loader
  skills.py            Project-local skill disable/restore
  upgrade.py           Background version-check
assets/hooks/          Hook prompt assets and fixtures
scripts/               Demo and utility scripts
tests/                 Unit and integration coverage
.specify/              Constitution and repo-specific scripts
AGENTS.md              Symlink to constitution
GEMINI.md              Symlink to AGENTS.md
CLAUDE.md              Symlink to AGENTS.md
.cybervisor/           Runtime state (instance.lock, daemon.lock, hooks/, logs/)
```
