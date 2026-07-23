---
title: Shell Completions
---

# Shell Completions

> **Audience: Users** — Shell operators setting up autocompletion.

cybervisor provides bash tab completion through two mechanisms: an `argcomplete`-based eval method (dynamic) and a static completion script (no dependencies).

## Eval-based completion (argcomplete)

Requires the `argcomplete` optional dependency:

```bash
uv tool install 'cybervisor[completions]'
eval "$(register-python-argcomplete cybervisor)"
```

If cybervisor is already installed without the extra, reinstall with `uv tool install 'cybervisor[completions]'`. To persist across shell sessions, add the `eval` line to `~/.bashrc`.

### What is dynamic

When runtime data is available, the argcomplete integration completes:

- **Agent tools** (`cybervisor use <TAB>`) — lists adapter registry names (e.g., `claude`, `mock`, `codex`)
- **Stage names** (`--start-from`, `--end-after`, `--end-before`) — reads stage names from `cybervisor.yaml` in the current directory
- **Document IDs** (`cybervisor docs <TAB>`) — lists available document identifiers

When runtime data is unavailable (no `cybervisor.yaml` in cwd, or missing config), dynamic completers return no suggestions rather than erroring.

### What is static

All subcommands, flags, and enum choices (e.g., `--template simple|speckit`, `completion bash`) are always available regardless of runtime state.

## Static completion script

No additional dependencies required:

```bash
source <(cybervisor completion bash)
```

To persist across shell sessions, add the `source` line to `~/.bashrc`.

This method covers all subcommands, global flags, per-subcommand flags, and static choices. Dynamic values (stage names, document IDs, agent tools) are not available through the static script; they fall back to default file completion.

## Comparison

| Feature | argcomplete (eval) | Static script |
|---------|-------------------|---------------|
| Subcommands | yes | yes |
| Flags | yes | yes |
| Static choices | yes | yes |
| Agent tools | yes | no |
| Stage names | yes | no |
| Document IDs | yes | no |
| Task IDs | no | no |
| Extra dependency | argcomplete | none |

Task ID completion is deferred to avoid adding fragile daemon WebSocket dependencies to the completion module.
