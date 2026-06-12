# Scenario: build-saas

> Recipe for greenfield SaaS / multi-tenant product builds from zero to launch.
> Method docs live under `prompts/`; this file sequences the OPC tool calls.

## Trigger phrases

- "SaaS /  SaaS 产品 / 从零搭建 / 创业 / 新项目 / 做一个平台"
- "build a SaaS / startup / greenfield / from scratch / multi-tenant"
- Any phrase describing a brand-new product with user accounts, billing, and tenant isolation

## Tool sequence

1. `opc_flow_query` — confirm no active flow blocks the request.
2. `opc_flow_lifecycle(action="start", initial_message=<user text>)`.
3. `opc_flow_step_complete(step="intent_analysis", intent="task")`.
4. `opc_flow_step_complete(step="task_analysis", analysis_result={...})` — complexity is typically `"high"`; `knowledge_unit` includes at minimum `["tenant", "user-auth", "billing"]`.
5. `opc_flow_step_complete(step="task_decomposition", sub_pipelines=[...], execution_order=[[...]])` — split by domain boundary (auth, core product, billing, admin panel).
6. `opc_flow_step_complete(step="brief_generation", brief_content=<markdown>)` — include tenant isolation strategy, tech stack rationale, and MVP scope carve-out.
7. `opc_pipeline_create(...)` — emits `flow_next.tool="opc_phase_start"`.
8. For each phase: `opc_phase_start` → for each node: `opc_node_start` / `opc_node_complete` → `opc_phase_complete`.
9. On pipeline completion: `opc_reflect_record_interventions` to mine corrections.

## Reflection touchpoints

- After `task_analysis`, `task_decomposition`, `brief_generation`: invoke `opc_reflect_plan` → `opc_reflect_critique` → `opc_reflect_critique_complete` → `opc_flow_reflect`.
- Greenfield projects benefit from an extra `cove` round after `task_decomposition` to catch over-engineering early.
- `complexity="high"` → rounds-guard relaxed (3–5 rounds per phase), user confirmation required at each phase boundary.

## Suggested phases

`00-ideation` → `01-validation` → `03-design` → `04-implement-design` → `05-implement` → `06-testing` → `07-release`

- `00-ideation`: product concept, competitive analysis, MVP scope definition.
- `01-validation`: user personas, PRD, market-fit hypothesis.
- `03-design`: UI/UX for multi-tenant dashboard, onboarding flow.
- `04-implement-design`: API design with tenant context propagation, database schema with tenant-id column convention.
- `05-implement`: scaffold → tenant-aware middleware → core features → billing integration.
- `06-testing`: integration tests with tenant isolation assertions, security scan.
- `07-release`: staged rollout, tenant provisioning automation.

## Anti-patterns

- Skipping `00-ideation` / `01-validation` — SaaS without validated personas burns budget on unused features.
- Modelling tenant isolation as an afterthought — retrofit costs are high; bake tenant-id into the data model from `04-implement-design` onward.
- Treating billing as "Phase 2" — a SaaS without monetisation is a demo; include it in the MVP decomposition.
