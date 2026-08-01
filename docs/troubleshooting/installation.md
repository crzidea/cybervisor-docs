---
title: Installation and Setup Troubleshooting
---

# Installation and Setup Troubleshooting

> **Audience: Users** — Pipeline operators experiencing installation or configuration issues.

---

## Installation and Setup

### `cybervisor: command not found`

`uv` did not install the tool onto your PATH, or your shell has not reloaded.

```bash
# Confirm uv's tool bin directory is on PATH
echo $PATH | grep -q "\.local/bin" || echo 'Add export PATH="$HOME/.local/bin:$PATH" to your shell profile'

# Reinstall and verify
uv tool install cybervisor
cybervisor --version
```

---

## Verifier and Credentials

### `Doctor: verifier blocked`

`~/.cybervisor/config.yaml` is missing or the `llm.api_key` field is absent. The `llm.api_key` field is required when at least one effective non-contract stage needs model-assisted stop verification. If every effective stage for a non-mock adapter is contract-enabled, the verifier check is skipped and contract-only slices can run without `llm.api_key`.

```bash
mkdir -p ~/.cybervisor
cat > ~/.cybervisor/config.yaml <<'EOF'
harness: claude
llm:
  api_key: sk-your-key-here
EOF
chmod 600 ~/.cybervisor/config.yaml
```

### `Doctor: verifier needs attention`

The API key is present but the remote endpoint rejected it (401 Unauthorized).

- Check that `llm.api_key` is valid and has not expired.
- If using a custom `base_url`, confirm the endpoint is reachable: `curl -I "$BASE_URL/models" -H "Authorization: Bearer $API_KEY"`.

---

## Cursor Adapter Preflight

When Cursor is selected globally or for an effective stage, `cybervisor doctor` checks the SDK import and `harnesses.cursor.api_key` in the active config.

### `Doctor: adapter 'cursor' blocked` — SDK missing

Install Cybervisor with synchronized dependencies, or install the minimum SDK version in the same Python environment:

```bash
pip install "cursor-sdk>=1.0.24"
cybervisor doctor
```

The platform wheel bundles its own bridge launcher, so a missing `cursor-sdk-bridge` on `PATH` does not block Cursor.

### `Doctor: adapter 'cursor' blocked` — API key missing

Add the key under `harnesses.cursor.api_key` in the active home or workspace-local config. `CURSOR_API_KEY` is not used as a fallback.

---

## Usage Reporting

### WARNING: "Usage reporting request failed"

When `usage_reporting.enabled` is true, cybervisor sends one best-effort document per completed stage to Elasticsearch. Network errors, invalid credentials, or a missing `endpoint` produce warnings but never fail the pipeline stage.

- Confirm `usage_reporting.endpoint` and `index` match your cluster.
- Verify `api_key` can index into the configured index.
- Check stderr or `.cybervisor/logs/` for the warning; credentials are not logged.
- Reporting requires `httpx`; if it is not installed, a warning is logged and reporting is skipped.

See [Configuration Reference — Usage Reporting](../configuration.md#usage-reporting) for setup.
