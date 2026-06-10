# Task Analysis Method (P2)

> Methodology for `opc_task_analysis_complete`. Loaded as a docs
> reference when Claude is at `current_step = task_analysis`. Spec
> source:
> [doc/feature/02-opc-state-server/01-intent-analysis/06_task-analysis.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/06_task-analysis.md).

## 1. Purpose

Convert a `task`-classified user request into a structured analysis
that downstream `opc_task_decomposition_complete` /
`opc_pipeline_create` can consume. Emit `task_analysis_evidence` (NOT
a confidence number) so the P2 reflection layer can validate via
V1–V5 + meta-validator.

## 2. Prerequisite

Before authoring analysis, call `opc_knowledge_list()` once to
inventory existing units. Pass the result into step ⑤/⑦ so the plan
references real paths instead of invented ones — V3 (knowledge-reuse
check) fails synthetic paths.

## 3. The seven steps

| # | Step | Output field |
|---|---|---|
| ① | Distill description | `description` |
| ② | Tag (2–4 tags) | `tags[]` |
| ③ | Judge complexity (two-question method) | `complexity` |
| ④ | Recommend phases | `suggested_phases[]`, `phase_selection_rationale` |
| ⑤ | Extract knowledge units | `knowledge_unit[]` |
| ⑥ | Match scenario (1–2) | `scenario` |
| ⑦ | Knowledge operation plan | `knowledge_plan[]` |

### 3.1 ① Distill description

One precise sentence. Fill in implicit nouns, drop greetings/modifiers.

### 3.2 ② Tag pool

| Category | Allowed tags |
|---|---|
| Stack | backend, frontend, fullstack, mobile, desktop, infra |
| Domain | auth, database, api, ui, payment, storage, security, messaging |
| Operation | add-feature, fix-bug, refactor, optimize, migrate, configure |

Pick 2–4. Tags outside this pool fail V1.

### 3.3 ③ Complexity — two-question method

```
Needs design / planning?
  no  → low
  yes → Solvable in one round and not complex?
          yes → medium
          no  → high
```

| Verdict | Definition | Typical |
|---|---|---|
| `low` | No planning, trivial edit. | Styles, copy, log, config. |
| `medium` | Planning needed, one round suffices. | New feature, third-party integration. |
| `high` | Planning + multi-round or complex. | Core refactor, DB migration, API protocol change. |

`complexity_signals` MUST record both answers and the verdict — V2
(complexity-justification) verifies the chain.

### 3.4 ④ Recommend phases

`suggested_phases[]` MUST be a subset of phase ids that physically
exist under `phases/` (state-server cross-checks `available`). Order
MUST satisfy each phase.md's `order.prev/next` partial order
(e.g. `06-testing` cannot precede `04-implement-design`).

| Task kind | Recommended phases |
|---|---|
| New feature / bug-fix / refactor | `04-implement-design` → `05-implement` → `06-testing` |
| Security audit | `06-testing` (security scan node only) |
| Greenfield project | `00-ideation` → `03-design` → `04-implement-design` → `05-implement` → `06-testing` |

`phase_selection_rationale` is one sentence: WHY these phases AND
why others were skipped. Replan + reflection consume this.

### 3.5 ⑤ Extract knowledge units

Domain concepts → unit names. Examples:

```
"实现用户认证系统"            → ["user-auth"]
"实现支付和订阅功能"          → ["payment", "subscription"]
"修复角色权限检查"            → ["authorization"]
```

Cross-check against `opc_knowledge_list` output: if a unit already
exists, reuse the canonical name verbatim. V3 fails close-but-not-
matching variants ("auth" vs existing "user-auth").

### 3.6 ⑥ Match scenario

Scan `scenarios/`, pick 1–2 closest:

`add-feature` · `fix-bug` · `build-saas` · `build-mobile-app`
· `redesign-product` · `performance-optimize` · `security-audit`
· `launch-product` · `incident-response`

### 3.7 ⑦ Knowledge operation plan

Each entry: `{path, operation: read|update|create, current_status?}`.
`path` MUST resolve against existing units OR be a plausible
`unit/sub-path` for a `create` entry.

## 4. Evidence schema (REQUIRED — replaces `confidence: number`)

```json
{
  "task_analysis_evidence": {
    "requirements": [
      {"text": "邮箱注册登录", "source_quote": "实现用户认证系统"}
    ],
    "dependencies": ["database", "email-service"],
    "risks": [
      {"text": "若需 SSO 集成则升级 high", "trigger": "user_mentions=oauth|sso"}
    ],
    "knowledge_plan": [
      {"path": "user-auth/login", "operation": "create"}
    ],
    "phase_selection_rationale": "add-feature + medium：跳过 00/01/03，从实现设计起步至测试收尾",
    "complexity_signals": {
      "needs_design": true,
      "one_round_solvable": true,
      "verdict": "medium"
    }
  }
}
```

- `requirements[].source_quote` MUST be a verbatim substring of
  `state.user_message_history` — synthetic quotes fail V1.
- `risks[]` SHOULD list the conditions that would force a complexity
  upgrade; meta-validator inspects this when verdict ≠ `high`.
- `complexity_signals` MUST match the verdict — answering
  `needs_design=false` while emitting `verdict: "high"` is a V2 hard
  fail.

## 5. complexity branching (after V1–V5 pass)

| Dimension | low | medium | high |
|---|---|---|---|
| Path | quick_dispatch (no pipeline / no phases / no state) | full pipeline | full pipeline |
| Reflection budget | — | 2–3 rounds | 3–5 rounds |
| Phase advance | — | auto (V1–V5 gate) | per-phase user confirm |
| Brief | not generated | standard | detailed |
| Node selection | — | tag + semantic filter | matched nodes non-skippable |
| Knowledge read | agent discretion | per node `input` | + `_refs` expansion |
| Knowledge write | usually none | normal | stricter audit |

## 6. Routing by validator result

Spec [§6.4](../../../../doc/feature/02-opc-state-server/01-intent-analysis/06_task-analysis.md):

| V1–V5 + meta result | Effect |
|---|---|
| All pass + no severe objection | Branch by `complexity` + `modify_unit_count` (no P2 reflection) |
| Pass + medium objection | Route through; `step_instruction` attaches `reasoning_trace` and asks for short user confirm |
| Fail or severe objection | Enter P2 reflection: primary=M3 (CoVe), secondary=M2 (Reflexion). Rounds-guard bounded; exhausted → `ask_user` |

Definitions: [05-opc-reflection-server/01-method-theory/00_overview.md](../../../../doc/feature/05-opc-reflection-server/01-method-theory/00_overview.md).

## 7. Output contract

```json
{
  "description": "...",
  "tags": ["backend", "auth"],
  "complexity": "medium",
  "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
  "phase_selection_rationale": "...",
  "knowledge_unit": ["user-auth"],
  "scenario": "add-feature",
  "knowledge_plan": [
    {"path": "user-auth/login", "operation": "create"}
  ],
  "task_analysis_evidence": { ... },
  "next": { "tool": "opc_task_decomposition_complete" }
}
```

`opc_task_analysis_complete` cross-checks `phase_selection_rationale`
appears in BOTH the top-level field and inside
`task_analysis_evidence` — mismatch is a hard validation error.

## 8. Correction commands (post-analysis)

| User phrase | Tool to call |
|---|---|
| "复杂度应该是 high" | `opc_flow_revise({field:"complexity", value:"high"})` — clears `phase_selection_rationale` + `analysis_evidence_ref`, returns to `task_analysis` |
| "加上 03-design 阶段" | `opc_flow_revise({field:"suggested_phases", value:[...]})` |
| "重新分析" / "重新评估" | `opc_flow_restart({from_step:"task_analysis"})` |
| "就这样" / "继续" | Honor previous `flow_next`; no flow tool needed |

## 9. Comparison — P2 vs P5 reflection

| | P2 (task_analysis) | P5 (node_selection) |
|---|---|---|
| Trigger | `opc_task_analysis_complete` → `opc_flow_reflect` | between `opc_phase_start` and `opc_phase_confirm` |
| Persistence | `flow-state.json.reflection_log` | `state.json.phases[].reflection_log` |
| Primary | M3 CoVe | M4 Critique |
| Secondary | M2 Reflexion | M5 Debate (≥ medium) |
| Adjustment | revise analysis fields (e.g. upgrade complexity) | `opc_phase_adjust` add/remove nodes |
