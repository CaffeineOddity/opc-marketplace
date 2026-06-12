# Scenario: add-feature

> Concise recipe Claude consults when a request matches "build / add / implement a new feature".
> Method docs live under `prompts/`; this file just sequences the OPC tool calls.

## Trigger phrases

- "实现 / 新增 / 加 / 添加 / 加上 / 开发 / build / implement / add"
- Any phrase paired with a noun describing user-visible behaviour ("登录 / 支付 / 通知 / endpoint / route / page")

## Tool sequence

1. `opc_flow_query` — confirm no active flow blocks the request.
2. `opc_flow_lifecycle(action="start", initial_message=<user text>)`.
3. `opc_flow_step_complete(step="intent_analysis", intent="task")`.
4. `opc_flow_step_complete(step="task_analysis", analysis_result={...})` — set `complexity`, `suggested_phases`, `knowledge_unit`.
5. `opc_flow_step_complete(step="task_decomposition", sub_pipelines=[...], execution_order=[[...]])` — split when scope > 1 sub-pipeline.
6. `opc_flow_step_complete(step="brief_generation", brief_content=<markdown>)`.
7. `opc_pipeline_create(...)` — emits `flow_next.tool="opc_phase_start"`.
8. For each phase: `opc_phase_start` → for each node: `opc_node_start` / `opc_node_complete` → `opc_phase_complete`.
9. On pipeline completion: `opc_reflect_record_interventions` to mine corrections.

## Reflection touchpoints

- After `task_analysis`, `task_decomposition`, `brief_generation`: invoke `opc_reflect_plan` → `opc_reflect_critique` → `opc_reflect_critique_complete` → `opc_flow_reflect`.
- Honour `skip_reflection_once_for_step` when a prior `rounds_exceeded` or expired-skip cleared it.

## Suggested phases

`01-validation` → `03-design` → `05-implement` → `06-testing` (skip 04-implement-design for backend-only features).
