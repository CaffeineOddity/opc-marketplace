# Scenario: redesign-product

> Recipe for redesigning or overhauling an existing product's UI/UX.
> Design-heavy flow starting from `03-design`, skipping ideation and validation
> (the product already exists and has validated users).

## Trigger phrases

- "重新设计 / 改版 / 重构界面 / UI 重做 / 换一套设计 / 视觉升级"
- "redesign / UI overhaul / revamp / refresh / restyle / modernise the look"
- "用户体验不好 / 界面太丑 / 不好用 / 交互优化"

## Tool sequence

1. `opc_flow_query` — confirm no active flow; if an existing pipeline covers the same product, consider `opc_pipeline_replan(add_sub_pipeline(...))`.
2. `opc_flow_lifecycle(action="start", initial_message=<user text>)`.
3. `opc_flow_step_complete(step="intent_analysis", intent="task")`.
4. `opc_flow_step_complete(step="task_analysis", analysis_result={...})` — `tags` include `["ui", "frontend", ...]`; `suggested_phases` start from `03-design`; `complexity` is typically `"medium"` for cosmetic refresh, `"high"` for full information-architecture rework.
5. `opc_flow_step_complete(step="task_decomposition", sub_pipelines=[...])` — split by page/section or design system component (atoms → molecules → pages).
6. `opc_flow_step_complete(step="brief_generation", brief_content=<markdown>)` — include current-state screenshot references, target design system (Material, custom, etc.), accessibility level (WCAG 2.1 AA minimum).
7. `opc_pipeline_create(...)`.
8. For each phase: `opc_phase_start` → for each node: `opc_node_start` / `opc_node_complete` → `opc_phase_complete`.

## Reflection touchpoints

- After `task_analysis`: `opc_reflect_plan` → `opc_reflect_critique` to validate the scope boundary (what stays vs what changes).
- `03-design` phase: extra `debate` round comparing before/after UX flows; user-testing evidence gates phase completion.
- After `brief_generation`: verify accessibility targets and responsive breakpoints are explicitly stated.

## Suggested phases

`03-design` → `04-implement-design` → `05-implement` → `06-testing`

- `03-design`: design system audit, component inventory, wireframe → high-fidelity mockups, interaction prototypes.
- `04-implement-design`: component API contracts, design-token extraction, CSS architecture (Tailwind config, CSS variables).
- `05-implement`: design-system components → page-level composition → animation/polish.
- `06-testing`: visual regression testing, cross-browser/device QA, accessibility audit (axe-core, Lighthouse).

## Anti-patterns

- Skipping `03-design` and jumping straight to code — "redesign" implies visual/UX change; without mockups there is no target to implement against.
- Redesigning everything at once — prefer incremental rollout behind feature flags; full rip-and-replace breaks user mental models.
- Ignoring the existing design system — audit what's reusable before building new components.
