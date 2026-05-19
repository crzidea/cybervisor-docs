---
title: Updating `cybervisor`
---

# Updating `cybervisor`

> **Audience: Users** — Pipeline operators upgrading installations.

Use the update path that matches how `cybervisor` was installed.

## Automatic Background Upgrades

When you run `cybervisor run`, `cybervisor serve`, or `cybervisor sandbox`, cybervisor automatically checks PyPI for a newer version in a background thread. If a newer version is found, it logs an info-level notice suggesting the manual upgrade command. No pip subprocess is spawned — the upgrade takes effect on the **next** run.

Example log output when an upgrade is available:
```
Newer version available: X.Y.Z (current: A.B.C). Run `uv tool upgrade cybervisor` or `pip install --upgrade cybervisor` to update.
```

Key behavior:
- The check runs entirely in a daemon thread and never blocks the main process. Network timeouts (10 seconds) are swallowed silently.
- For `sandbox`, the upgrade check runs on the host before the Docker container starts; the container inherits the installed version.
- The current version is logged at startup: `cybervisor CLI X.Y.Z` for `run` and `sandbox`, `cybervisor daemon X.Y.Z` for `serve`. For `sandbox`, the CLI line also shows `(latest: X.Y.Z)` when a newer release is available on PyPI (see [Testing and Sandbox — Version Output](testing.md#version-output)).
- To upgrade, run `uv tool upgrade cybervisor` (or `pip install --upgrade cybervisor`).

## Update A Released Install

If you installed `cybervisor` from PyPI with `uv tool install cybervisor`, upgrade it in place:

```bash
uv tool upgrade cybervisor
cybervisor --version
```

This keeps your existing global configuration in `~/.cybervisor/config.yaml`.

If `cybervisor` is not installed yet, use:

```bash
uv tool install cybervisor
```

## Update An Editable Local Install

If you installed from a local checkout for development, reinstall the tool from the repo root so the executable points at the current source tree:

```bash
uv tool install -e . --force
cybervisor --version
```

Then refresh the project environment if dependencies changed:

```bash
uv sync
```

## Migration: `protected_paths` → `read_only_paths`

The top-level `protected_paths` key and the previous top-level `read_only_paths` key are no longer accepted in `cybervisor.yaml`. If your config contains either key, you will see a validation error with a migration hint at startup.

To migrate, move `read_only_paths` (or `protected_paths`) from the top level into individual stage definitions:

**Before (deprecated):**
```yaml
read_only_paths:
  - "src/**"
  - "tests/**"

stages:
  - name: Spec
  - name: Implement
```

**After (current):**
```yaml
stages:
  - name: Spec
    read_only_paths:
      - "src/**"
      - "tests/**"
  - name: Implement
```

The per-stage approach allows different write-protection patterns for different stages (e.g., design stages protect source code while implementation stages allow full write access).
