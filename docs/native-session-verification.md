---
title: Native Session Verification Report
---

# Native Session Verification Report

> **Audience: Developers** — Reviewers evaluating native harness persistence evidence for the August 2026 implementation.

This report intentionally contains only session identifiers, native surfaces, boolean outcomes, and unverified reasons. It excludes prompts, replies, transcript bodies, authentication data, and picker screen contents.

| Harness | Session identifier | Store outcome | Native surface outcome |
|---|---|---|---|
| Codex | `019fbb96-fcfe-7c23-adf8-72e62f0a1944` | Session JSONL survived SDK client teardown in the configured `CODEX_HOME`; `auth.json` and `config.toml` were byte-identical | Write audit passed |
| Codex | `019fbba1-92fe-74e1-b5fb-3263c93fe888` | Exact identifier was the only session in the isolated normal store | `codex resume --all --include-non-interactive`: row present; `codex resume <session-id>`: exact identifier accepted |
| Claude | `bf11af3a-2bcb-4544-9d6a-2407cac3e93c` | Live Cybervisor adapter transcript survived under the isolated native project store | Own-project picker: absent; all-projects picker: absent; `claude --resume <session-id>` accepted the exact identifier |
| OpenCode | `ses_044647ecaffeB26ZrJsnu049NA` | Native OpenCode database retained the exact identifier | `opencode session list --format json`: present; `opencode export <session-id>`: success |
| Cursor | `agent-e36e3487-470a-4cc6-abb9-e9d6ea2fc993` | Transcript remained under Cursor's normal project `agent-transcripts` store | `cursor-agent ls`: absent; `cursor-agent --resume <session-id>` accepted the exact identifier |
| Antigravity | `85e201a4-0696-4e49-9d6f-ff2157fb9064` | Matching database remained in the normal Antigravity conversation store | `agy --conversation <session-id>` accepted the exact identifier |

The confirmed failure sequence was exercised for every installed harness. Missing native listing rows for Claude and Cursor are documented limitations with exact-ID direct access; they are not represented as passing discovery checks. Mock explicitly declares no native history behavior.
