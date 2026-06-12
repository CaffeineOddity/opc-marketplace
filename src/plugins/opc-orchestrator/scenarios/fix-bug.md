# Scenario: fix-bug

> Concise recipe for "fix / repair / 修复 / 修 / 解决 bug" requests.

## Trigger phrases

- "修复 / 修 / 解决 / 排查 / fix / repair / debug / bug / 报错 / 异常"
- "失败了 / 不工作 / broken / not working / regression"

## Tool sequence

1. `opc_flow_query` — see whether an existing pipeline can be resumed via `opc_pipeline_replan(add_sub_pipeline(execution_priority="immediate"))`.
2. If no flow active: `opc_flow_lifecycle(action="start")` → `step_complete(intent="task")`.
3. `task_analysis` with `complexity="low"` is common for hot-fix; reserve `"medium"`/`"high"` for cross-cutting bugs.
4. Decomposition usually yields 1 sub-pipeline; skip decomposition only if `complexity="low"` AND scope ≤ 1 unit.
5. Brief should cite reproduction steps, expected vs actual, suspected unit, and rollback strategy.
6. `opc_pipeline_create` → primary phases `05-implement` → `06-testing`.
7. If hot-patch on a paused pipeline: `opc_pipeline_replan(add_sub_pipeline=[{execution_priority:"immediate", knowledge_unit:<bug-unit>}])` then `opc_pipeline_resume` after node-boundary suspension (see [[project_phase_reset_and_insert]]).

## Reflection touchpoints

- One round of `critique` after `task_analysis` is usually enough; complex bugs add `cove` as secondary.
- `validator` runs implicitly via V1-V5 on the produced artifact.

## Anti-patterns

- Never call `opc_phase_reset` to "rewind" a working state — that loses commits. Use replan + immediate-insert instead.
