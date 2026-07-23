---
title: Antigravity Agent Guide
---

# Antigravity Agent Guide

> **Audience: Users** — Operators configuring or troubleshooting the Antigravity agent adapter.

The Antigravity adapter is the first truly in-process adapter in Cybervisor. The `google-antigravity` SDK's async `Agent` runs directly inside the Cybervisor process via a background event loop instead of spawning a CLI subprocess or executing ACP JSON-RPC.

---

## Configuration and Setup

### Prerequisites
- The `google-antigravity` SDK is a standard dependency of Cybervisor. No separate installation is needed.
- If the SDK is missing or not importable, reinstall Cybervisor:
  ```bash
  uv sync
  # or
  pip install --force-reinstall .
  ```
- The Antigravity CLI (`agy` / `antigravity-cli`) is **not** required and cannot be used with Cybervisor, as it lacks support for the Agent Connection Protocol (ACP), settings hooks, and JSONL log parsing.

### Authentication
The SDK requires standard developer-oriented Google Cloud credentials:
- Set `GOOGLE_APPLICATION_CREDENTIALS` to point to a service account JSON key file.
- Or run `gcloud auth application-default login` to configure Application Default Credentials (ADC).
- **Google AI Pro Limitation:** Consumer accounts with Google AI Pro or Google One AI Premium subscriptions (including Gemini Advanced) cannot be used to authenticate the SDK.

### Model Configuration and Overrides
- When `stage_models` overrides the model for a stage, the adapter attempts to pass it to the SDK.
- Because the SDK is in preview, if it does not accept model overrides or other capability configurations, the adapter will log a warning and run with SDK defaults.
- Post-hoc snapshot enforcement and Cybervisor's contract/verifier system remain active as a backstop.

### Permission Enforcement
- The adapter maps `disallowed_tools` and `read_only_paths` to SDK capabilities where supported.
- **Post-Hoc Snapshots:** `ACPReadOnlySnapshot` provides post-hoc filesystem write protection. Cybervisor captures file hashes before and after the agent run and automatically restores any protected-file modifications.

---

## Troubleshooting

### Antigravity SDK not installed
If `cybervisor doctor` or preflight reports that the Antigravity SDK is not installed:
- Reinstall Cybervisor using `uv sync` or `pip install .`.
- Confirm installation by running:
  ```bash
  python -c "import google.antigravity; print('OK')"
  ```
- Ensure your Python version (3.11+) and OS are supported by the `google-antigravity` wheel (the SDK is platform-specific and contains a compiled runtime).

### Antigravity SDK platform not supported
If `cybervisor doctor` reports "does not expose the Agent API on this platform":
- Ensure your OS and Python versions are compatible with the SDK wheel.
- Try re-installing Cybervisor with `pip install --force-reinstall .`.

### Antigravity authentication not configured
If the adapter reports that authentication is missing or expired:
- Set `GOOGLE_APPLICATION_CREDENTIALS` or run `gcloud auth application-default login`.
- Verify credentials work by running:
  ```bash
  python -c "import google.auth; print(google.auth.default())"
  ```
- **Note:** Direct browser login for a consumer account (`gcloud auth login`) will not work for SDK authentication.

---

## Cancellation

The Antigravity adapter runs in-process via a background thread. When you run `cybervisor cancel`, the daemon sets a cooperative stop event that the SDK thread checks between iterations, then joins the thread. The task stops promptly — the SDK thread does not continue after cancellation.
