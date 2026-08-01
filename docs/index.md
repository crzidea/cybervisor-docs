---
title: cybervisor Documentation
---

# cybervisor Documentation

> **Audience: All** — New and experienced users, operators, and contributors.

This directory contains all user-facing and contributor-facing documentation for `cybervisor`. Each document declares its audience at the top (Users, Developers, or All).

## Web documentation site

These Markdown files are the canonical source for the public docs site built from the workspace `cybervisor-docs/` project. Edit files here, then run `npm run sync` in `cybervisor-docs/` to refresh the site. See `cybervisor-docs/README.md` for local preview, build, and Cloudflare Workers deployment.

## New Users — Start Here

1. Read the [project README](https://github.com/crzidea/cybervisor) for a high-level overview, installation, and quick start.
2. Follow the [Getting Started](/getting-started.html) tutorial for a guided first run.
3. If something goes wrong, check [Troubleshooting](/troubleshooting/index.html).

## Architecture Overview

For the repository layout and package structure, see [Development](/development.html). For component-specific runtime details:

- CLI commands, daemon usage, and skill management: [Runtime and Daemon — User Guide](/runtime-user.html)
- Pipeline internals, adapter details, and generated artifacts: [Runtime and Daemon — Developer Reference](/runtime-internals.html)
- Daemon WebSocket protocol and message schema: [WebSocket Protocol](/websocket-protocol.html)
- Pipeline stages, contracts, and routing design: [Pipeline Authoring Guide](/pipeline-authoring.html)
- Running tests and sandbox environment: [Testing and Sandbox](/testing.html) (Users), [Testing Reference](/testing-dev.html) (Developers)

## User Guides

| Document | What it covers |
|----------|---------------|
| [Getting Started](/getting-started.html) | Step-by-step tutorial from install to first pipeline run |
| [Configuration Reference](/configuration.html) | `cybervisor.yaml`, `~/.cybervisor/config.yaml`, stage fields, CLI commands |
| [Pipeline Authoring Guide](/pipeline-authoring.html) | Designing stages, contracts, routing, and stage prompts |
| [Runtime and Daemon — User Guide](/runtime-user.html) | Daemon commands, client interaction, live stderr output, native session discovery, skill disable/restore, signals |
| [Updating](/updating.html) | Install, upgrade, and migration workflows |
| [Shell Completions](/completions.html) | Bash tab completion setup and comparison |
| [Local Usage Metrics](/usage-metrics.html) | Private task history, filters, grouping, and token coverage |
| [Troubleshooting](/troubleshooting/index.html) | Common issues and resolutions |
| [Testing and Sandbox](/testing.html) | Sandbox usage, mock adapter, simple demo scripts |
| [Claude Code Harness Guide](/agents/claude.html) | Claude Code adapter SDK configuration, autonomous operation, and permission enforcement |
| [Cursor Harness Guide](/agents/cursor.html) | Cursor adapter configuration, SDK integration, and auth |
| [OpenCode Harness Guide](/agents/opencode.html) | OpenCode adapter serve mode, configuration injection, and timeouts |
| [Antigravity Harness Guide](/agents/antigravity.html) | Official `agy` CLI setup, authentication, permissions, and troubleshooting |
| [Codex Harness Guide](/agents/codex.html) | Official SDK runtime, autonomous continuation, and Git-backed enforcement |

## Developer Guides

| Document | What it covers |
|----------|---------------|
| [Runtime and Daemon — Developer Reference](/runtime-internals.html) | Pipeline lifecycle, adapter compatibility, generated artifacts |
| [Native Session Verification Report](/native-session-verification.html) | Metadata-only evidence for native session persistence and discovery boundaries |
| [Testing Reference](/testing-dev.html) | Unit test suite layout, mock API server, Docker image building |
| [Updating — Developer Reference](/updating-dev.html) | Repo update and release publishing |
| [Development](/development.html) | Repository layout, local setup, tests, and release workflow |
| [Adding an Adapter](/contributing/adding-an-adapter.html) | Maintainer contract for new harness adapters |
| [WebSocket Protocol](/websocket-protocol.html) | Daemon message schema, connection lifecycle, chunking |
