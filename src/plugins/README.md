# kits/

OPC kits are Claude Code plugins that bundle role-specific
sub-agents, skills, and MCP server configs. Each kit is loaded
at Claude Code session start (per host-contract C4-推论), so kit
changes require a session restart.

## The six v1 kits

| Kit | Purpose | Phases primarily served |
|---|---|---|
| `product-kit` | Product management, market research, PRD authoring | 00-ideation, 01-validation |
| `design-kit` | UI/UX design, brand system, accessibility | 03-design |
| `dev-kit` | Frontend / backend / DB / security / architecture | 04-implement-design, 05-implement |
| `qa-kit` | Testing, QA, penetration testing, reflection critics | 06-testing, all phases' reflection loops |
| `ship-kit` | CI/CD, SRE, runbook, SLO monitoring | 07-release |
| `growth-kit` | SEO, marketing, analytics, performance | 08-growth, 09-scale |

## Kit directory layout

```
kits/<kit-name>/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── agents/
│   ├── <agent-1>.md          # Sub-agent with `tools` whitelist (REQUIRED)
│   └── ...
├── skills/                   # Optional: invocable skills (Claude /<skill>)
│   ├── <skill-1>/
│   │   └── SKILL.md
│   └── ...
└── mcp/
    └── .mcp.json             # Optional MCP server registrations
```

## Agent frontmatter contract

Every `agents/<agent>.md` MUST declare these fields:

```yaml
---
name: <agent-id>                 # MUST equal filename minus .md
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

Reference: [`doc/feature/06-host-contract/00_overview.md §2.5 C4`](../doc/feature/06-host-contract/00_overview.md).

### Hard rules

1. **No implicit "all"**: every agent MUST list its tools
   explicitly. The kit-loader CI check will fail on missing
   `tools` field.

2. **Reflection-role bans**: agents that serve as reflection
   sub-agents (`critic` / `debater` / `tot-explorer` /
   `meta-synthesizer` / `cove-verifier`) MUST NOT have ANY
   write-class tools. Specifically banned:
   - `Write`, `Edit`, `NotebookEdit`
   - `opc_knowledge_write`, `opc_knowledge_admin` (delete)
   - `opc_corrections_upsert` (write side)
   - `Bash` (would allow `rm`/`mv`/etc as a write side-channel)

   Allowed for reflection roles: `Read`, `Grep`, `Glob`,
   `opc_knowledge_get*`, `opc_knowledge_list`,
   `opc_knowledge_search`, `opc_corrections_query`, `WebFetch`,
   `WebSearch`.

3. **OPC server double-insurance**: even if a kit accidentally
   grants a write tool to a critic-class agent, the OPC
   knowledge-server checks `dispatch_context.role` and rejects
   writes from reflection roles. The whitelist is the primary
   defense; OPC server check is the backstop.

## plugin.json template

```json
{
  "name": "opc/<kit-name>",
  "version": "0.1.0",
  "description": "<one-line>",
  "author": "OPC",
  "license": "MIT",
  "homepage": "https://github.com/CaffeineOddity/opc-marketplace",
  "agents": "./agents",
  "skills": "./skills",
  "mcp": "./mcp/.mcp.json"
}
```

The `agents` / `skills` / `mcp` keys are paths Claude Code reads
on session startup. Omit keys whose directories are empty.

## Cross-kit constraints

- **Agent name uniqueness**: agent names must be unique across all
  installed kits. If two kits ship the same agent name, Claude
  Code reports a conflict at startup. The recommendation: prefix
  domain-specific agents (`growth-frontend-developer` if you need
  a flavor that overlaps with `dev-kit/frontend-developer`).

- **Phase-node cross-reference**: every agent named in any
  `phases/*/nodes/*.md` `agents.primary[]` or `agents.fallback[]`
  field MUST exist in some kit (otherwise `opc_node_start` fails
  the Agent availability check). The `kits/REGRESSION.md` audit
  verifies this every M13 sub-letter.

## kit-install UX

Per C4-推论: kits are loaded only at session start. The
`opc-kit install <name>` CLI:

1. Writes kit files into the project's `.claude/agents/` and
   `.mcp.json` paths.
2. Prints **mandatory**: "请重启 Claude Code 以加载新 kit。"
3. Does NOT attempt hot-reload — would not work.

## Reference

- Marketplace layout: [`doc/feature/01-overview/01_marketplace-directory.md §kits/`](../doc/feature/01-overview/01_marketplace-directory.md)
- C4 PoC: [`doc/feature/06-host-contract/00_overview.md §2.5`](../doc/feature/06-host-contract/00_overview.md)
- Reflection agent constraints: [`doc/feature/05-opc-reflection-server/02-server-design/00_overview.md`](../doc/feature/05-opc-reflection-server/02-server-design/00_overview.md)
- Agent availability check: [`doc/feature/02-opc-state-server/04-node/07_tools.md §opc_node_start`](../doc/feature/02-opc-state-server/04-node/07_tools.md)
