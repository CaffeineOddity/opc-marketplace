# OPC Marketplace

OPC (Opinionated Pipeline Compiler) — state-machine-driven pipeline compiler with reflection loops, knowledge graph, and quality gates.

> [中文文档](README.zh-CN.md) | **English**

## Plugins

| Plugin | Description |
|--------|-------------|
| `opc-orchestrator` | Pipeline orchestrator with UserPromptSubmit hook, `/opc-status` command, and 3 MCP servers (state, knowledge, reflection) |
| `opc/official-kits` | 27 sub-agents covering the full product lifecycle: product, design, dev, QA, ship, growth |

### MCP Servers (bundled with opc-orchestrator)

| Server | Tools |
|--------|-------|
| `opc-state-server` | `opc_flow_query`, `opc_flow_lifecycle`, `opc_flow_correct`, `opc_flow_step_complete`, `opc_pipeline_lifecycle`, `opc_phase_*`, `opc_node_*` |
| `opc-knowledge-server` | `opc_knowledge_open`, `opc_knowledge_read`, `opc_knowledge_write`, `opc_knowledge_delete`, `opc_knowledge_index` |
| `opc-reflection-server` | `opc_reflect_plan`, `opc_reflect_execute`, `opc_reflect_complete`, `opc_reflect_admin`, `opc_corrections` |

### Agents (27 in opc/official-kits)

product-manager, business-analyst, startup-advisor, ux-researcher, ux-designer, ui-designer, design-bridge, backend-architect, backend-engineer, frontend-developer, fullstack-engineer, cloud-architect, database-administrator, devops-engineer, deployment-engineer, security-engineer, penetration-tester, sre-engineer, performance-engineer, test-automator, qa-expert, cove-verifier, critic, debater, tot-explorer, meta-synthesizer, opc-distiller

## Quick Install

### 1. Add the marketplace

```shell
claude plugin marketplace add CaffeineOddity/opc-marketplace
```

### 2. Install plugins

```shell
# Core orchestrator (required)
claude plugin install opc-orchestrator

# Official agent kits
claude plugin install opc/official-kits
```

### 3. Restart Claude Code

Agent files and MCP servers are loaded on restart.

## Verify Installation

```shell
# Check installed plugins
claude plugin list

# View marketplace status
claude plugin marketplace list
```

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 10

### Build

```shell
pnpm install
pnpm run --filter @opc/memory-store build
pnpm run --filter @opc/tool-aliases build
pnpm run --filter @opc/state-server build
pnpm run --filter @opc/knowledge-server build
pnpm run --filter @opc/reflection-server build
```

### Run Tests

```shell
pnpm run --filter @opc/state-server test
pnpm run --filter @opc/knowledge-server test
pnpm run --filter @opc/reflection-server test
pnpm run --filter opc-orchestrator-test test
```

## License

MIT
