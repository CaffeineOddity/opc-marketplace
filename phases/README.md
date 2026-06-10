# phases/

Standard 9-phase definitions for OPC pipelines. Each subdirectory
is self-contained: `phase.md` (metadata) + `nodes/*.md` (executable
units) + `templates/` (knowledge-file skeletons).

## The 9 phases

| ID | Name | Description |
|---|---|---|
| 00-ideation | 构思 | Idea validation, feasibility analysis |
| 01-validation | 验证 | Market research, user interviews |
| 03-design | 设计 | UI/UX design, brand system |
| 04-implement-design | 实现设计 | API design, database schema, scaffold |
| 05-implement | 编码实现 | Coding, TDD |
| 06-testing | 测试 | QA, security audit |
| 07-release | 发布 | Deploy, CI/CD |
| 08-growth | 增长 | Marketing, SEO |
| 09-scale | 规模化 | Performance, architecture evolution |

`02-` ID is reserved for future expansion.

## How phases are consumed

1. `opc_task_analysis_complete` selects a subset into
   `state.json.phase_plan.selected`.
2. `opc_phase_start` scans `phases/<phase>/nodes/*.md` AND the
   project-local `opc-nodes/<phase>/nodes/*.md` overrides.
3. Tag intersection filters surface `available_nodes[]`; scenario
   triggers mark `recommended: true` (no LLM ranking at this layer).
4. Claude collects `selection_evidence` and submits via
   `opc_phase_confirm` — V1–V5 validators decide auto-confirm /
   quick-confirm / reflection-loop. See
   [`platform/mcp/opc-state-server/prompts/05_phase-execution.md`](../platform/mcp/opc-state-server/prompts/05_phase-execution.md).

## phase.md frontmatter contract

```yaml
---
phase: <phase-id>            # MUST equal directory name
name: <Chinese display name>
description: <one-line summary>
order:
  prev: <prev-phase-id> | null
  next: <next-phase-id> | null
---
```

Body sections (markdown):

- `## 目标` — what this phase delivers
- `## 职责` — responsibilities (bullet list)

`order.prev` / `order.next` drive `opc_phase_complete` auto-advance.
Skipped phases (not in `phase_plan.selected`) are still chained
correctly because advance lookup follows `selected` order, not
`available`.

## node.md frontmatter contract

```yaml
---
name: <node-name>            # MUST equal filename minus .md
tags: [<tag1>, <tag2>, ...]  # from the 06_task-analysis.md tag pool
description: <one-line>
agents:
  primary: [<agent-id>]
  fallback: [<agent-id>]     # optional
input:
  - path: <opc-knowledge path or src/ pattern>
    type: knowledge | artifact
  - ...
output:
  - path: <opc-knowledge path>
    type: knowledge
  - ...
quality_gates:
  L1:                        # node-level deterministic gates
    - <gate-id>
  L2:                        # phase-level gates (optional)
    - <gate-id>
always_show: false           # optional; tag-filter bypass
---
```

Body documents the node's contract for the human reader; not
parsed by state-server. Tag pool source:
[`doc/feature/02-opc-state-server/01-intent-analysis/06_task-analysis.md §6.2②`](../doc/feature/02-opc-state-server/01-intent-analysis/06_task-analysis.md).

## Source of truth

- Phase semantics: [`doc/feature/02-opc-state-server/03-phase/01_nine-phases.md`](../doc/feature/02-opc-state-server/03-phase/01_nine-phases.md)
- Node selection: [`02_node-selection.md`](../doc/feature/02-opc-state-server/03-phase/02_node-selection.md)
- phase_plan validation: [`02-pipeline/04_state-json.md §六`](../doc/feature/02-opc-state-server/02-pipeline/04_state-json.md)
