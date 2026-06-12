# Scenario: performance-optimize

> Recipe for systematic performance optimisation.
> Measurement-driven: baseline → profile → fix → verify.
> Focuses on `05-implement` (optimisation work) and `06-testing` (benchmark validation).

## Trigger phrases

- "性能优化 / 加速 / 变慢了 / 卡顿 / 延迟高 / 响应慢 / 内存占用大"
- "performance / optimise / speed up / slow / latency / bottleneck / profiling"
- "页面加载太慢 / API 超时 / 数据库查询慢 / 首屏时间"

## Tool sequence

1. `opc_flow_query` — confirm no active flow blocks the request.
2. `opc_flow_lifecycle(action="start", initial_message=<user text>)`.
3. `opc_flow_step_complete(step="intent_analysis", intent="task")`.
4. `opc_flow_step_complete(step="task_analysis", analysis_result={...})` — `complexity` depends on scope: `"low"` for a single query fix, `"medium"` for endpoint-level optimisation, `"high"` for systemic bottlenecks; `tags: ["performance", ...]`.
5. If `complexity="low"`: route to `opc_quick_dispatch` — profile, fix, verify in one shot.
6. `opc_flow_step_complete(step="task_decomposition", sub_pipelines=[...])` — each sub-pipeline targets one bottleneck (DB queries, serialisation, network payload, render cycle).
7. `opc_flow_step_complete(step="brief_generation", brief_content=<markdown>)` — MUST include baseline metrics (p50/p95/p99 latency, throughput, error rate) and target thresholds.
8. `opc_pipeline_create(...)`.
9. For each phase: `opc_phase_start` → for each node: `opc_node_start` / `opc_node_complete` → `opc_phase_complete`.

## Reflection touchpoints

- After `task_analysis`: `critique` round to validate that the bottleneck hypothesis is evidence-backed (flame graph, query plan, trace), not guessed.
- After each optimisation node: verify the metric moved toward the target; if not, `opc_reflect_critique` the approach before proceeding to the next bottleneck.
- `validator` checks that before/after benchmarks are included in the node completion artifact.

## Suggested phases

`05-implement` → `06-testing`

- `05-implement`: profiling → root-cause analysis → optimisation implementation (caching, query rewrite, lazy loading, code splitting, connection pooling).
- `06-testing`: load testing (k6, wrk, artillery), regression benchmark comparison, resource-usage profiling under load.
- Skip `04-implement-design` unless the optimisation requires API or schema changes (e.g. denormalization, materialized views).

## Anti-patterns

- Optimising without a baseline — you cannot prove improvement without before/after numbers. The `brief` step MUST capture the baseline.
- Micro-optimising non-bottlenecks — always profile first; intuition about "the slow part" is frequently wrong.
- Trading correctness for speed — every optimisation node must pass existing regression tests before the node is marked complete.
