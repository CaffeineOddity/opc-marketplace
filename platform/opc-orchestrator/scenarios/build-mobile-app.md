# Scenario: build-mobile-app

> Recipe for cross-platform or native mobile app development.
> Covers React Native, Flutter, and native (Swift/Kotlin) paths.

## Trigger phrases

- "APP / 手机应用 / 移动端 / 客户端 / iOS / Android / 跨平台"
- "build a mobile app / React Native / Flutter / native app / mobile-first"
- Any phrase describing a mobile application with platform-specific concerns (push, offline, store review)

## Tool sequence

1. `opc_flow_query` — confirm no active flow blocks the request.
2. `opc_flow_lifecycle(action="start", initial_message=<user text>)`.
3. `opc_flow_step_complete(step="intent_analysis", intent="task")`.
4. `opc_flow_step_complete(step="task_analysis", analysis_result={...})` — `tags` include `["mobile", ...]`; `suggested_phases` must include `03-design` for mobile UI/UX.
5. `opc_flow_step_complete(step="task_decomposition", sub_pipelines=[...])` — split by platform when cross-platform (shared core + platform-specific adapters).
6. `opc_flow_step_complete(step="brief_generation", brief_content=<markdown>)` — include platform targets, offline strategy, push notification provider, and store compliance notes.
7. `opc_pipeline_create(...)` — emits `flow_next.tool="opc_phase_start"`.
8. For each phase: `opc_phase_start` → for each node: `opc_node_start` / `opc_node_complete` → `opc_phase_complete`.
9. On pipeline completion: `opc_reflect_record_interventions` to mine corrections.

## Reflection touchpoints

- After `task_analysis` and `task_decomposition`: invoke `opc_reflect_plan` → `opc_reflect_critique` → `opc_reflect_critique_complete` → `opc_flow_reflect`.
- `03-design` phase: extra `debate` round for platform-specific UX patterns (iOS HIG vs Material Design).
- After `brief_generation`: verify offline-first data flow and push notification lifecycle are addressed.

## Suggested phases

`00-ideation` → `01-validation` → `03-design` → `04-implement-design` → `05-implement` → `06-testing` → `07-release`

- `03-design`: mobile UI/UX, navigation architecture, offline/error/empty states.
- `04-implement-design`: API contract with mobile-friendly pagination, GraphQL or tRPC endpoints, local storage schema.
- `05-implement`: scaffold → auth (biometric + OAuth) → core features → push notifications → offline queue.
- `06-testing`: device lab matrix, network condition simulation, store review checklist.
- `07-release`: App Store Connect / Google Play Console metadata, staged rollout, crash monitoring.

## Anti-patterns

- Designing desktop-first then "adapting" to mobile — leads to information density mismatches; start mobile-first in `03-design`.
- Ignoring offline and partial-connectivity states until `06-testing` — these are architectural, not QA concerns.
- Hard-coding platform-specific logic in shared modules — use dependency injection or platform adapters from `04-implement-design`.
