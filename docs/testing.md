---
title: Testing and Sandbox Guide
---

# Testing and Sandbox Guide

> **Audience: Users** — Pipeline operators running test pipelines or executing inside a Docker sandbox.

This guide covers how to run demo pipelines, configure the built-in mock agent for configuration testing, and execute the supervisor within an isolated Docker sandbox.

---

## Smoke Tests and Demos

### Standalone Scaffold Demo

For a quick first run using the standalone simple scaffold, you can use:

```bash
scripts/e2e-demo-simple-project.sh
```

That script:
- Creates a fresh temporary standalone workspace under `.tmp/e2e-demo-simple/` (isolated from the `cybervisor` repository state).
- Runs `cybervisor init` inside that workspace.
- Initializes a Git repository (when available).
- Prints the exact `cd` and `cybervisor` commands to run.

---

## Mock Adapter (`harness: mock`)

When `harness: mock` is set in the active global config, the pipeline uses the built-in mock adapter instead of launching an external harness. The adapter completes every stage with a zero-exit process and:
- Emits contract artifacts for stages that have a contract with field-injection routes (e.g. `Review Plan`, `Review Code`). The status value is the first route key from the loaded config.
- Also emits contract artifacts for stages with `contract.required_tasks` even when routes have no injections, because `required_tasks` enforcement needs the artifact.
- Does **not** emit contract artifacts for routing-only stages — stages whose routes all redirect to other stages without injected fields and without `required_tasks`.
- Does **not** generate planning artifacts (spec.md, plan.md, tasks.md). Planning artifacts must be provided externally — e.g., pre-written by the smoke test script or seeded in test fixtures. On the `Plan` stage the adapter is a pass-through; contract artifacts are still emitted for downstream stages.
- Falls back gracefully when `cybervisor.yaml` is absent or malformed, skipping contract artifact emission rather than raising.

---

## Docker Sandbox Serve (`cybervisor sandbox`)

`cybervisor sandbox` launches the cybervisor daemon inside an isolated Docker container with the current working directory and user home directory mounted. This is useful for CI/CD pipelines, restricted workstations, or environments where direct tool installation is impractical.

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

# Mount additional host paths into the sandbox
cybervisor sandbox --mount /data/project
cybervisor sandbox --mount /data/project:/mnt/project:ro
cybervisor sandbox --mount /data:/data:ro --mount /tmp/cache:/cache

# Add supplementary groups (e.g., Docker socket group)
cybervisor sandbox --group-add docker
cybervisor sandbox --group-add 123 --group-add users
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
| `--mount MOUNT_SPEC` | None | Extra Docker volume mount; repeatable. Supports `HOST`, `HOST:CONTAINER`, and `HOST:CONTAINER:ro|rw` |
| `--group-add GROUP` | None | Docker supplementary group to add inside the container; repeatable. Group names or numeric IDs are passed verbatim to Docker |
| `--docker` | `false` | Mount the host Docker socket and add its supplementary group (Docker-in-Docker shorthand) |

### Image Pull Behavior

By default, `cybervisor sandbox` pulls the image from the registry before starting the container. This ensures the running container matches the latest published version. Docker's layer progress streams live to the terminal, and there is no artificial timeout.

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
The **CLI** line shows the host's installed version. If a newer release is available on PyPI, it appends the latest version: `(latest: 0.18.2)`. The **daemon** line shows the version running inside the container. Both lines should display the same version number. If they differ, the container image may be outdated — pull the latest image with `cybervisor sandbox` (without `--no-pull`) or run `docker pull ghcr.io/crzidea/cybervisor:latest`.

### Network Architecture
The container uses `--network=host`, sharing the host's network stack directly. The `--host` and `--port` flags are passed through to `cybervisor serve` inside the container, so the daemon binds to the specified address and port without Docker port mapping. This means the container can reach all external services the host can (package registries, API endpoints, git remotes).

### Volume Mounts
Host directories are mounted to the same absolute path inside the container, so tools like Claude, Codex, Cursor, and OpenCode find their config at the expected `~/.claude/`, `~/.codex/`, `~/.cursor/`, `~/.opencode/`, etc.

| Host Path | Container Path | Condition |
|-----------|---------------|-----------|
| Current working directory | Same as host path | Always |
| `~/` (home directory) | Same as host path | Always |
| `/etc/passwd` | `/etc/passwd` | Read-only, for UID/GID name resolution |
| `/etc/group` | `/etc/group` | Read-only, for UID/GID name resolution |

The home directory mount covers `~/.cybervisor`, `~/.claude.json`, and agent credential directories.

Use `--mount` to add more host paths. If only `HOST` is provided, cybervisor mounts it at the same absolute path inside the container. If the mode is omitted, Docker uses a read-write mount. The host path must already exist; cybervisor validates this before running the container so Docker does not silently create a missing directory.

### Supplementary Groups (`--group-add`)

Use `--group-add` one or more times to add supplementary Linux groups inside the sandbox container. Each value is passed verbatim to Docker's `--group-add` flag.

**Docker socket use case.** A common scenario is mounting the host Docker socket and granting the container process membership in the socket's group:

```bash
# One-line shorthand (socket mount + socket group)
cybervisor sandbox --docker

# Equivalent manual recipe
DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
cybervisor sandbox --mount /var/run/docker.sock:/var/run/docker.sock --group-add "$DOCKER_GID"
```

`--docker` composes with explicit `--mount` and `--group-add` values. It adds the socket mount and group alongside anything you pass manually.

When `DOCKER_HOST` uses a `unix://` path, `--docker` also forwards that setting into the container. For non-Unix values such as `tcp://`, it uses the default `/var/run/docker.sock` path instead.

> **Security note:** Passing the Docker socket group expands host-level trust. Processes inside the container can control the host Docker daemon, which effectively grants root-equivalent access on the host. Only use this where you accept that trust boundary expansion.

**Prefer numeric group IDs.** Use numeric IDs rather than group names whenever the group may not exist inside the container image. A group name like `docker` is only resolved if it exists in the container's `/etc/group`. Numeric IDs work regardless of the image's group database.

### Environment Variables
- `HOST_HOME` is set inside the container to the host user's home directory.
- `HOME` is set to the same path as the host home directory inside the container.
- `PYTHONNOUSERSITE=1` is set inside the container to prevent the host's `site.USER_SITE` directory from shadowing the container's own package metadata.
- `IS_SANDBOX=1` is declared in the container image. This enables Claude stages to use `bypassPermissions` while the container runs as root. Host installations do not receive this declaration — it is scoped to the container trust boundary only.
- API key environment variables (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `CYBERVISOR_LLM_*`) are forwarded if set on the host.
- A Unix-socket `DOCKER_HOST` is forwarded when `--docker` is set.

### Lifecycle
- **Foreground mode** (default): Container runs attached to the terminal. `--rm` is passed so the container is auto-removed on exit. Pressing Ctrl+C sends SIGTERM to the container for graceful shutdown.
- **Background mode** (`--background`): Container starts detached. The container ID is printed. Use `docker stop <name>` to stop.
