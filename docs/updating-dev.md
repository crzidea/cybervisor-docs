---
title: Updating `cybervisor` (Developer Reference)
---

# Updating `cybervisor` (Developer Reference)

> **Audience: Developers** — Contributors updating checkouts and publishing releases.

## Update The Repo During Development

If you are contributing to `cybervisor`, update your checkout and then run the standard verification commands:

```bash
uv sync
uv run mypy --strict src/
uv run pytest
```

## Publish A New `cybervisor` Release

If you are preparing a new package release, use the repo helper from the repository root:

```bash
./scripts/publish.sh patch
```

Replace `patch` with `minor` or `major` when appropriate. The script requires a clean git working tree, bumps the version, refreshes `uv.lock`, creates a release commit and annotated git tag like `v0.7.1`, and pushes the commit and tag. The tag triggers the repository's release workflow, which publishes the Python package and builds the multi-platform GHCR image directly from this repository's `Dockerfile`.
