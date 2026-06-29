# plugins/

OPC ships two Claude Code plugins from this directory, bundled into `dist/`
by `scripts/build-release.mjs` and registered in `.claude-plugin/marketplace.json`.

## The two plugins

| Plugin | Path | Contents |
|---|---|---|
| `opc` | `src/plugins/opc/` | Core orchestrator: `UserPromptSubmit` hook (`bin/opc-hook.sh`), `/opc-status` slash command, `opc-status` read-only CLI, `.mcp.json` registering the three state/knowledge/reflection MCP servers. The hook nudges Claude to call `opc_flow_query` before acting (quiet by default, loud/off configurable). |
| `opc-official-kits` | `src/plugins/official-kits/` | 27 sub-agents covering the full product lifecycle, organized into 6 categories. |

> v2 consolidation note: v1 shipped six separate plugins (`product-kit`, `design-kit`,
> `dev-kit`, `qa-kit`, `ship-kit`, `growth-kit`) plus an `opc-kit install` CLI. v2
> collapses them into a single `opc-official-kits` plugin and removes the install CLI —
> kits load at session start like any plugin, no per-kit install step.

## official-kits agent categories

`opc-official-kits/.claude-plugin/plugin.json` declares `agents` as an array of the six
category directories:

| Category | Agents | Phases primarily served |
|---|---|---|
| `product/` | product-manager, business-analyst, startup-advisor, ux-researcher | 00-ideation, 01-validation |
| `design/` | ux-designer, ui-designer, design-bridge | 03-design |
| `dev/` | backend-architect, backend-engineer, frontend-developer, fullstack-engineer, database-administrator, cloud-architect | 04-implement-design, 05-implement |
| `infra/` | devops-engineer, deployment-engineer, sre-engineer | 07-release |
| `qa/` | test-automator, qa-expert, security-engineer, penetration-tester, performance-engineer | 06-testing |
| `reflection/` | critic, debater, tot-explorer, meta-synthesizer, cove-verifier, opc-distiller | all phases' reflection loops |

## Agent frontmatter contract

Every `agents/<category>/<agent>.md` MUST declare these fields:

```yaml
---
name: <agent-id>                 # MUST equal filename minus .md; unique across all categories
description: <one-line role summary>
model: sonnet | opus | haiku     # optional; defaults to inherit
tools:                           # MUST be explicit; NEVER "all" or omitted
  - <tool-1>
  - <tool-2>
---
```

Body documents the agent's responsibilities for the human reader;
Claude reads it as the system prompt when this agent is spawned
via `Task`.

## tools whitelist enforcement (C4)

Per host-contract C4 (PoC-verified): the Host (Claude Code's
`Task` tool) **directly trims the tool list** by the
`subagent_type`'s declared `tools`. Tools not in the whitelist
are **invisible** to the sub-agent — not "visible but denied",
truly not present in the tool list.

Reference: [`doc/feature/06-host-contract/00_overview.md §2.5 C4`](../../doc/feature/06-host-contract/00_overview.md).

### Hard rules

1. **No implicit "all"**: every agent MUST list its tools
   explicitly. The kit-health check (`src/mcp/opc-state-server/src/kit-health.ts`)
   surfaces agents missing the `tools` field.

2. **Reflection-role bans**: agents that serve as reflection
   sub-agents (`critic` / `debater` / `tot-explorer` /
   `meta-synthesizer` / `cove-verifier`) MUST NOT have ANY
   write-class tools. Specifically banned:
   - `Write`, `Edit`, `NotebookEdit`
   - `opc_knowledge_write`, `opc_knowledge_admin` (delete)
   - `opc_corrections` (write side — upsert/migrate/endorse/freeze/delete)
   - `Bash` (would allow `rm`/`mv`/etc as a write side-channel)

   Allowed for reflection roles: `Read`, `Grep`, `Glob`,
   `opc_knowledge_read`, `opc_knowledge_open`,
   `opc_corrections` (query side only), `WebFetch`, `WebSearch`.

3. **OPC server double-insurance**: even if a kit accidentally
   grants a write tool to a critic-class agent, the OPC
   knowledge-server checks `dispatch_context.role` and rejects
   writes from reflection roles. The whitelist is the primary
   defense; OPC server check is the backstop.

## Cross-category constraints

- **Agent name uniqueness**: agent names must be unique across all
  categories (the `name:` field, not the path). Claude Code reports
  a conflict at startup if two agents share a name.

- **Phase-node cross-reference**: every agent named in any
  `phases/*/nodes/*.md` `agents.primary[]` or `agents.fallback[]`
  field MUST exist in some category (otherwise `opc_node_start` fails
  the Agent availability check). The `REGRESSION.md` audit verifies this.

## kit-health check

`src/mcp/opc-state-server/src/kit-health.ts` scans installed agents and
verifies the contract above (tools whitelist present, reflection-role bans
respected). It is invoked via the state-server and surfaces problems in
`opc_flow_query` responses.

## Reference

- Marketplace layout: [`doc/feature/01-overview/01_marketplace-directory.md`](../../doc/feature/01-overview/01_marketplace-directory.md)
- C4 PoC: [`doc/feature/06-host-contract/00_overview.md §2.5`](../../doc/feature/06-host-contract/00_overview.md)
- Reflection agent constraints: [`doc/feature/05-opc-reflection-server/02-server-design/04_subagent-permissions.md`](../../doc/feature/05-opc-reflection-server/02-server-design/04_subagent-permissions.md)
- Agent availability check: [`doc/feature/02-opc-state-server/04-node/07_tools.md §opc_node_start`](../../doc/feature/02-opc-state-server/04-node/07_tools.md)
