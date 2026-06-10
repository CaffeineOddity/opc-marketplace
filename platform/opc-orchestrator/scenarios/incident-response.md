# Scenario: incident-response

> Emergency recipe for production incidents and outages.
> Minimal process, maximum speed. Bypasses normal pipeline phases
> in favour of direct diagnosis → hotfix → verify.

## Trigger phrases

- "宕机 / 事故 / 紧急 / 线上故障 / 挂了 / 崩了 / P0 / 火灾 / 报警"
- "incident / outage / down / broken / emergency / SEV1 / SEV0 / critical"
- "用户不能登录了 / 支付失败了 / 数据库挂了 / 服务全挂了"

## Tool sequence

1. `opc_flow_query` — check whether a pipeline already covers the affected service; if yes, note the pipeline state for post-incident follow-up.
2. `opc_flow_lifecycle(action="start", initial_message=<user text>)`.
3. `opc_flow_step_complete(step="intent_analysis", intent="task")`.
4. `opc_flow_step_complete(step="task_analysis", analysis_result={...})` — `complexity` is always at least `"medium"` (urgency raises risk); `tags: ["incident", ...]`; `suggested_phases: ["05-implement", "06-testing"]`.
5. If the incident is a known pattern with an existing correction: `opc_corrections(action="query", keywords=[...])` to retrieve the fix recipe before acting.
6. **Skip decomposition and brief** — go directly to diagnosis and hotfix. Use `opc_flow_correct(action="revise", ...)` to record findings as they emerge.
7. `opc_pipeline_create(...)` — minimal pipeline, `05-implement` (hotfix) → `06-testing` (verify).
8. `opc_phase_start(phase="05-implement")` → diagnose root cause → `opc_node_start` / `opc_node_complete` for the hotfix → `opc_phase_complete`.
9. `opc_phase_start(phase="06-testing")` → verify the fix resolves the incident → smoke test critical paths.
10. **Post-incident**: `opc_reflect_record_interventions` with `trigger: "incident"` — mine a correction so the same incident is caught faster next time.

## Reflection touchpoints

- Before applying the hotfix: one rapid `critique` round — "will this fix cause a worse outage?" (blast-radius check).
- After verification: `opc_reflect_critique` on the root cause — was the diagnosis correct, or did we fix a symptom?
- Post-incident (not blocking recovery): full `opc_reflect_plan` → `opc_reflect_critique` to produce an incident postmortem correction.

## Suggested phases

`05-implement` → `06-testing`

- `05-implement`: root-cause diagnosis, hotfix implementation (feature flag off, config rollback, code patch, DB intervention).
- `06-testing`: verify the fix restores service, smoke test critical paths, monitor for 15+ minutes of stability.
- Skip all other phases — this is triage, not construction.

## Anti-patterns

- Running full task decomposition during an outage — diagnosis first, documentation after the service is back up.
- Applying a hotfix without understanding root cause — "restart the server and hope" masks the underlying issue. At minimum, capture logs and metrics before restarting.
- Not recording a correction post-incident — the same incident WILL recur if the lesson is not persisted. Always call `opc_corrections(action="record", ...)` with `trigger: "incident"` after resolution.
- Letting the pipeline auto-advance block on user confirmations — incident response should use `auto_advance` where safe, or Claude should explain any blocking step tersely.
