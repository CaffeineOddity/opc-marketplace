# opc

Minimal Claude Code plugin that ships the `/opc init` and `/opc-status` slash
commands, the `opc-hook.sh` script, and MCP server config for the three OPC
servers (`opc-state-server`, `opc-knowledge-server`, `opc-reflection-server`).

The plugin is intentionally tiny — all real logic lives in the MCP servers.
This package:

1. **`/opc init`** — the explicit per-project onboarding step. It creates the
   `.opc/` scaffold + a `.project-init` marker (which gates the state-server's
   bootstrap of `.opc/phases/` + `.opc/scenarios/`) and installs the
   `UserPromptSubmit` hook into the project's `.claude/settings.json`.
2. **`/opc-status`** — read-only terminal health snapshot of the active flow.

> Enabling the plugin alone does **not** create `.opc/` or fire the hook in a
> project. Both are gated behind `/opc init`, so an enabled plugin never
> silently affects every project you open. Run `/opc init` once in any project
> where you want OPC active.

Scenarios live in `.opc/scenarios/` (bootstrapped by opc-state-server, but only
after `/opc init` has created the `.opc/` marker).

## Layout

```
src/plugins/opc/
├── .claude-plugin/plugin.json   ← MCP config only (no global hook — see /opc init)
├── bin/opc-init.mjs             ← /opc init implementation
├── bin/opc-hook.sh              ← UserPromptSubmit hook script (project-scoped via /opc init)
├── bin/opc-status.mjs           ← /opc-status shim → dist/opc-status/cli.js
├── commands/opc-init.md         ← /opc init slash command
├── commands/opc-status.md       ← /opc-status slash command
├── src/opc-status/              ← opc-status CLI source (bundled at build time)
└── test/                        ← vitest harness
```

## Hook intensity

The hook installed by `/opc init` reads `OPC_HOOK_INTENSITY` (default `quiet`):

| `OPC_HOOK_INTENSITY` | Behaviour |
|---|---|
| unset / `quiet` | inject only if (a) message starts without `/` AND (b) message contains a trigger keyword OR an `in_progress` flow exists under `.opc/sessions/` — **v1 default** per host-contract §2.6 (A2 modification) |
| `loud` | inject on every non-slash message |
| `off` | never inject |

### Trigger keywords (quiet mode)

Built-in (case-insensitive for ASCII):

- **CN**: 任务 / 实现 / 修复 / 重构 / 加 / 改 / 新增 / 优化 / 设计 / 写 / 调试 / 上线
- **EN**: implement / fix / refactor / add / update / build / debug / deploy / design / write

Add custom keywords via `OPC_HOOK_KEYWORDS=spike:scaffold:patch` (colon-separated).

### Slash exemption

Any message starting with `/` (slash command — e.g. `/opc-status`) is silent in
all intensities. This prevents the hook from interfering with user-invoked
skills.

## Active-flow detection

`quiet` mode treats an `in_progress` flow as "always inject" so Claude doesn't
forget about it across turns. The check greps
`.opc/sessions/*/flow-state.json` for `"status": "in_progress"` — read-only,
~ms latency, no JSON parsing.

## Why so quiet by default

PoCs V4 (hook vs system prompt priority) and V5 (whether hook text accumulates
in user message history and burns tokens) have not yet validated `loud`.
Defaulting to `quiet` keeps token cost flat for casual chat while still
catching task-shaped requests; once V4/V5 pass, the default may flip.

## Testing

```
pnpm test
```

The orchestrator's hook tests run under the root vitest config; they shell out
to `bin/opc-hook.sh` and verify the intensity matrix end-to-end.
