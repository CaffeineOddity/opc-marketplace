# Scenario: launch-product

> Recipe for product launch / go-live preparation.
> Assumes the product is built and tested; focuses on release readiness,
> monitoring, and post-launch growth.

## Trigger phrases

- "上线 / 发布 / 投产 / 正式环境 / 灰度 / 全量 / go live"
- "launch / release / deploy to production / ship / rollout / GA"
- "准备上线 / 发布检查 / launch checklist / release candidate"

## Tool sequence

1. `opc_flow_query` — if an active pipeline exists, check whether all phases through `06-testing` are complete; resume if paused.
2. If no active flow: `opc_flow_lifecycle(action="start", initial_message=<user text>)`.
3. `opc_flow_step_complete(step="intent_analysis", intent="task")`.
4. `opc_flow_step_complete(step="task_analysis", analysis_result={...})` — `complexity` is typically `"medium"`; `tags: ["launch", "infra", ...]`; `suggested_phases: ["06-testing", "07-release", "08-growth"]`.
5. `opc_flow_step_complete(step="task_decomposition", sub_pipelines=[...])` — split by: pre-flight checks, deployment runbook, monitoring setup, post-launch observation.
6. `opc_flow_step_complete(step="brief_generation", brief_content=<markdown>)` — MUST include: launch date/time, rollout strategy (canary/blue-green/percentage), rollback trigger conditions, on-call schedule.
7. `opc_pipeline_create(...)`.
8. `opc_phase_start(phase="06-testing")` — run smoke tests, security scan, load test sign-off.
9. `opc_phase_start(phase="07-release")` — execute deployment runbook nodes (migration run, feature flag enablement, DNS cutover, announcement).
10. `opc_phase_start(phase="08-growth")` — post-launch monitoring, user feedback triage, analytics instrumentation verification.

## Reflection touchpoints

- After `task_analysis`: `critique` round to stress-test the rollback plan — "what is the worst-case failure and can we recover in < 5 min?"
- After `07-release`: `opc_reflect_critique` on deployment execution — any surprises that should become runbook amendments.
- `validator` gates `07-release` phase start on: all `06-testing` nodes green + rollback plan documented + on-call acknowledged.

## Suggested phases

`06-testing` → `07-release` → `08-growth`

- `06-testing`: smoke tests (production-like staging), security sign-off, load test pass, accessibility compliance check.
- `07-release`: DB migrations (with rollback), feature flag enablement, canary deployment → monitor → full rollout, release notes publication.
- `08-growth`: analytics funnel verification, user feedback collection pipeline, SEO/ASO audit, announcement distribution.

## Anti-patterns

- Launching on a Friday or before a holiday — the brief step should flag timing risks; if unavoidable, ensure the on-call roster is confirmed.
- Skipping the rollback runbook — every launch brief must answer "how do we undo this in under 5 minutes?"
- Treating launch as the finish line — `08-growth` post-launch observation is part of the scenario; close the loop with monitoring data.
