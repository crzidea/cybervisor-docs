---
title: cybervisor Documentation
---

# cybervisor Documentation

> **Audience: All** — New and experienced users, operators, and contributors.

This directory contains all user-facing and contributor-facing documentation for `cybervisor`. Each document declares its audience at the top (Users, Developers, or All).

## New Users — Start Here

1. Read the [project README](https://github.com/crzidea/cybervisor) for a high-level overview, installation, and quick start.
2. Follow the [Getting Started](/getting-started.html) tutorial for a guided first run.
3. If something goes wrong, check [Troubleshooting](/troubleshooting.html).

## Architecture Overview

For the repository layout and package structure, see [Development](/development.html). For component-specific runtime details:

- CLI commands, daemon usage, and skill management: [Runtime and Daemon — User Guide](/runtime-user.html)
- Pipeline internals, adapter details, and generated artifacts: [Runtime and Daemon — Developer Reference](/runtime-internals.html)
- Daemon WebSocket protocol and message schema: [WebSocket Protocol](/websocket-protocol.html)
- Pipeline stages, contracts, and routing design: [Pipeline Authoring Guide](/pipeline-authoring.html)
- Smoke tests, mock adapter, Docker, and sandbox: [Testing and Sandbox](/testing.html)

## User Guides

| Document | What it covers |
|----------|---------------|
| [Getting Started](/getting-started.html) | Step-by-step tutorial from install to first pipeline run |
| [Configuration Reference](/configuration.html) | `cybervisor.yaml`, `~/.cybervisor/config.yaml`, stage fields, CLI commands |
| [Pipeline Authoring Guide](/pipeline-authoring.html) | Designing stages, contracts, routing, and agent prompts |
| [Runtime and Daemon — User Guide](/runtime-user.html) | Daemon commands, client interaction, live stderr output, skill disable/restore, signals |
| [Updating](/updating.html) | Install, upgrade, and migration workflows |
| [Shell Completions](/completions.html) | Bash tab completion setup and comparison |
| [Troubleshooting](/troubleshooting.html) | Common issues and resolutions |
| [Testing and Sandbox](/testing.html) | Smoke tests, mock adapter, Docker image, sandbox internals |

## Developer Guides

| Document | What it covers |
|----------|---------------|
| [Runtime and Daemon — Developer Reference](/runtime-internals.html) | Pipeline lifecycle, adapter compatibility, generated artifacts |
| [Testing and Sandbox](/testing.html) | Mock API server, Docker image, sandbox internals |
| [Updating — Developer Reference](/updating-dev.html) | Repo update and release publishing |
| [Development](/development.html) | Repository layout, local setup, tests, and release workflow |
| [Adding an Adapter](/contributing/adding-an-adapter.html) | Maintainer contract for new coding-agent adapters |
| [WebSocket Protocol](/websocket-protocol.html) | Daemon message schema, connection lifecycle, chunking |
