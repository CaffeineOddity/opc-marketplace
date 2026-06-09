# opc-orchestrator

Minimal Claude Code plugin that wires a `UserPromptSubmit` hook to nudge Claude
toward calling `mcp__opc-state__opc_flow_query` before reasoning about any
request, plus a small library of scenario recipes Claude consults on demand.

The plugin is intentionally tiny — all real logic lives in the three MCP
servers (`opc-state-server`, `opc-knowledge-server`, `opc-reflection-server`).
This package only:

1. Injects a one-line notice on qualifying user messages.
2. Ships scenario recipes Claude can read for tool sequencing.

## Layout

```
platform/opc-orchestrator/
├── .claude-plugin/plugin.json   ← hook registration
├── bin/opc-hook.sh              ← the hook script (quiet default)
├── scenarios/                   ← recipe markdown Claude reads on demand
│   ├── add-feature.md
│   └── fix-bug.md
└── test/opc-hook.test.ts        ← vitest harness shelling out to the script
```

## Hook intensity

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
