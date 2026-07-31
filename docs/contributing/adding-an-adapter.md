---
title: Adding a harness adapter
---

# Adding a harness adapter

> **Audience: Developers** — Contributors implementing or reviewing harness adapters.

An adapter translates one agent runtime into Cybervisor's common launch,
streaming, cancellation, and post-run evaluation interfaces. Pipeline
orchestration, retries, routing, contract validation, and verifier policy stay
in shared modules.

## Required surface

Implement an `AgentAdapter` and register its descriptor in
`cybervisor.adapters.registry`. The adapter must provide:

- command or SDK launch through `start(request)`
- cancellation and wait semantics through its execution handle
- canonical stream events for replies, reasoning, tools, and session metadata
- `evaluate_reply(context, reply_text, session_id=None)` when its descriptor
  declares `supports_post_run_evaluation=True`
- a health check and any adapter-specific authentication discovery

`HarnessCapabilities` advertises behavior. Do not add harness-name conditionals
to pipeline code; keep transport-specific behavior inside the adapter.

## Post-run evaluation

`HarnessLaunchRequest.evaluation_context` contains an immutable
`StageEvaluationContext`:

```python
@dataclass(frozen=True)
class StageEvaluationContext:
    harness: str
    workspace_root: Path
    stage_name: str
    stage_prompt: str
    contract: StageContractConfig | None
    attempt: int
    max_retries: int
    event_log_path: Path
```

Use the context passed by the pipeline. Do not reconstruct stage state from a
runtime file and do not edit an agent's persistent settings. A normal adapter
implementation is a thin call to the shared evaluator:

```python
from cybervisor.evaluation.reply import evaluate_stage_reply

def evaluate_reply(
    self,
    context: StageEvaluationContext,
    *,
    reply_text: str,
    session_id: str | None = None,
) -> AgentDecision:
    return evaluate_stage_reply(
        context=context,
        display_name=self.descriptor.display_name,
        reply_text=reply_text,
        session_id=session_id,
    )
```

The shared evaluator validates the active contract first and then asks the
configured verifier for a structured `approve` or `block` decision. Malformed
responses use structured-output recovery; unavailable verification fails
safely. Evaluation events append directly to
`.cybervisor/logs/evaluation-events.jsonl`.

Verifier endpoint, model, and API-key configuration belongs in
`~/.cybervisor/config.yaml`; never persist verifier secrets in a workspace.
The evaluation context and event records contain only non-secret stage
metadata.

Adapters that support conversational continuation translate a blocking
`AgentDecision` with `continuation_message_for_decision()` and resume their
existing session. Final-attempt behavior is available as
`context.is_final_attempt`.

## Read-only paths

Read-only enforcement is separate from reply evaluation:

- Claude, Codex, Cursor, and Antigravity use the shared Git-backed guard.
- OpenCode converts protected paths into process-local native permission
  rules.

Enforcement must never mutate persistent user settings. Preserve adapter-local
permission configuration in the launched process only.

## Streaming and cancellation

Normalize tool calls without changing their arguments. Visible assistant text
maps to `reply:`, internal model output maps to `thinking:`, and tool activity
maps to `tool call:`. Preserve provider session identifiers when available.

Cancellation must stop the active SDK task or process group, perform bounded
cleanup, and return code `130`. A handle's `wait()` must be idempotent.

## Registration and validation

Add the adapter descriptor to the registry and verify:

- the declared adapter name is unique
- required launch, health, and stream methods exist
- `evaluate_reply` exists when post-run evaluation is advertised
- credential failures are actionable and contain no secret values

## Tests

Add:

1. descriptor and registry-validation tests
2. launch request and stream translation tests
3. cancellation and process cleanup tests
4. context propagation tests covering prompt, contract, and attempt
5. approve, block, malformed response, and verifier-unavailable tests
6. proof that no agent settings file is created or changed

Run:

```bash
uv run ruff check src/
uv run mypy --strict src/
uv run pytest
```
