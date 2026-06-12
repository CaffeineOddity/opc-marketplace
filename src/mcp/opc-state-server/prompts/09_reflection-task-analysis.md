# Reflection Method — Task Analysis & Brief (P2 / P4)

> Methodology for the P2 (`opc_task_analysis_complete`) and P4
> (`opc_brief_complete`) reflection loops. Loaded as docs reference
> when Claude is at `current_step ∈ {task_analysis, brief_generation}`.
> Spec sources:
> [02-state-server/01-intent-analysis/06_task-analysis.md §6](../../../../doc/feature/02-opc-state-server/01-intent-analysis/06_task-analysis.md),
> [02-state-server/01-intent-analysis/08_brief-generation.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/08_brief-generation.md),
> [05-opc-reflection-server/01-method-theory/00_overview.md §五](../../../../doc/feature/05-opc-reflection-server/01-method-theory/00_overview.md),
> [05-opc-reflection-server/02-server-design/00_overview.md §evidence + V1–V5 + meta](../../../../doc/feature/05-opc-reflection-server/02-server-design/00_overview.md).
>
> Companions:
> [02_task-analysis.md](./02_task-analysis.md) — P2 content rules
> [04_brief-generation.md](./04_brief-generation.md) — P4 assembly rules
> [08_reflection-node-selection.md](./08_reflection-node-selection.md) — P5 (M4-primary) reflection
>
> P2 and P4 share one file because both are **class-B completeness
> failures** (per method-theory §四) and both use the **M3 CoVe primary
> + M2 Reflexion secondary** combination. P5 is in a separate file
> because it is a class-D decision failure with a different method
> profile.

## 1. Purpose

Verify two assemblies before they enter the pipeline:

| Step | What is assembled | What can go wrong | This file's role |
|---|---|---|---|
| P2 task_analysis | description + tags + complexity + suggested_phases + knowledge_unit + scenario + knowledge_plan | Missed requirement, missing dependency, wrong complexity, scenario mismatch | Validate `task_analysis_evidence` |
| P4 brief | 7-section markdown brief | Brief drifted from analysis, invented constraint, missing knowledge row | Validate `brief_evidence` (OPTIONAL but recommended for high) |

Both use the same reflection mechanism — only the evidence payload
and rounds budget differ.

## 2. Why M3 CoVe primary (vs M4 critic)

P2 and P4 produce **fact assemblies**, not picks. The failure mode
is "did I list everything?" not "did I pick the right thing?".
CoVe's pattern fits exactly:

```
M3 CoVe = decompose into atomic assertions
        → generate a verification question per assertion
        → verify each (knowledge lookup / source quote)
        → rewrite assembly with verified-only claims
```

M4 Critique (external critic) gets the wrong leverage here — it can
only object to what's there, not surface what's missing. M2
Reflexion (historical-correction injection) is the secondary so
that prior user corrections on similar tasks bias the verification
questions toward known-weak spots.

Cross-reference: [08_reflection-node-selection.md §13](./08_reflection-node-selection.md#13-why-p5-uses-m4-primary-not-m3-cove-vs-p2p4)
covers the inverse rationale.

## 3. P2 — task_analysis_evidence schema (REQUIRED)

```json
{
  "task_analysis_evidence": {
    "requirements": [
      {"id": "req-1", "text": "支持邮箱密码登录", "source_quote": "实现登录页面，支持邮箱密码"},
      {"id": "req-2", "text": "签发 JWT", "source_quote": "用 jwt 认证"}
    ],
    "dependencies": [
      {"requires": "user-auth", "type": "knowledge_unit", "evidence": "existing unit in opc-knowledge/"},
      {"requires": "jsonwebtoken", "type": "library", "evidence": "implied by 'jwt 认证'"}
    ],
    "risks": [
      {"area": "security", "risk": "token 存储位置未指定", "mitigation": "in brief 约束 section 询问"}
    ],
    "knowledge_plan": [
      {"path": "user-auth/login", "operation": "create", "current_status": "missing"}
    ],
    "complexity_signals": {
      "verdict": "medium",
      "needs_planning": true,
      "single_round_solvable": true,
      "rationale": "新增功能，需规划但一轮可完成"
    },
    "phase_selection_rationale": "登录是 add-feature 场景，走 04→05→06 三阶段"
  }
}
```

Field → validator mapping:

| Field | V1–V5 hook |
|---|---|
| `requirements[]` | **V3 evidence-presence** — non-empty; each `source_quote` MUST be a verbatim substring of `state.user_message_history`. **V4 coverage** — count ≥ floor implied by `description` length (coverage-guard threshold). |
| `dependencies[]` | **V2 referential** — `type: "knowledge_unit"` entries' `requires` MUST exist in `opc_knowledge_list()` OR be marked `current_status: missing` in `knowledge_plan`. |
| `risks[]` | Soft — empty allowed for low/medium; missing on high triggers V5 discrimination warning. |
| `knowledge_plan[]` | **V2** — every `path` MUST trace back to a `requirements[].id` (no orphan knowledge operations). |
| `complexity_signals.verdict` | **V1 schema** — `verdict ∈ {low, medium, high}`. Cross-check: signals MUST match verdict per the two-question matrix (low ⇔ `needs_planning: false`; medium ⇔ both true; high ⇔ `needs_planning: true` AND `single_round_solvable: false`). |
| `phase_selection_rationale` | **V2** — phases mentioned MUST be subset of `state.json.phase_plan.available`. |

Hard rule: missing any of the 6 keys → `evidence_coverage_failure`
before V1–V5 runs.

## 4. P4 — brief_evidence schema (OPTIONAL but recommended for high)

```json
{
  "brief_evidence": {
    "coverage_check": [
      {"section": "问题描述", "source_ref": "analysis_evidence_ref:r-…", "covered": true},
      {"section": "阶段计划", "source_ref": "analysis_evidence_ref:r-…", "covered": true},
      {"section": "关联知识", "source_ref": "analysis_evidence_ref:r-…", "covered": true}
    ],
    "constraint_completeness": {
      "user_quotes_scanned": ["实现登录页面", "用 jwt 认证"],
      "missing_constraint_signals": []
    }
  }
}
```

Validator behaviour:

| Field | V1–V5 hook |
|---|---|
| `coverage_check[]` | **V4 coverage** — every section in the 7-section template must have a row OR be explicitly marked `covered: false` with a `reason`. |
| `coverage_check[].source_ref` | **V2 referential** — MUST resolve to an existing artifact under `opc-logs/reflection/<session_id>/`. No fabricated refs. |
| `constraint_completeness.user_quotes_scanned[]` | **V3 evidence-presence** — each quote MUST be a verbatim substring of `state.user_message_history`. |
| `missing_constraint_signals[]` non-empty | Soft warning only — Claude SHOULD short-confirm with user before `opc_pipeline_create`. NOT a hard fail. |

Brief is an assembly, not a decision. The validator is intentionally
lenient — drift in markdown structure is caught by
`opc_brief_complete`'s 4 hard schema checks (covered in
[04_brief-generation.md §7](./04_brief-generation.md#7-output-contract)),
not by V1–V5.

## 5. Rounds budget

| Step | Complexity | `max_rounds` default | Rationale |
|---|---|---|---|
| P2 | low | 1 | quick_dispatch path; mistakes are cheap to redo |
| P2 | medium | 2 | One CoVe pass + one Reflexion-augmented pass |
| P2 | high | 3 | Heavier requirement surface, more dependencies |
| P4 | medium | 1 | Brief is assembly — single pass usually suffices |
| P4 | high | 2 | Coverage gaps on high-complexity briefs justify a second pass |

`opc_reflect_plan` reads this from the rounds-guard config; Claude
sees the chosen number in `reflection_budget_hint.max_rounds`.

## 6. The reflection loop iteration (shared P2 / P4)

```
round r (1 ≤ r ≤ max_rounds):
  ① Claude submits evidence via opc_<step>_complete
  ② opc_reflect_validate (V1–V5 + meta)
     · pass + no severe → done
     · pass + medium    → done (reasoning_trace shown)
     · fail / severe    → opc_flow_reflect({step_id, evidence_ref})

  ③ opc_flow_reflect dispatches the primary method:
     primary = M3 CoVe (always)
     secondary = M2 Reflexion (ONLY if primary returns objections AND corrections-store has ≥ 1 hit for this step+keywords)
     → pending_reflections[] gets one entry (registry-guard arms)

  ④ M3 CoVe returns:
     {
       atomic_assertions: [{id, text}],
       verification_questions: [{assertion_id, q, evidence_lookup_result}],
       revised_evidence: { ...patches to apply },
       unresolved_assertions: [{id, reason}]
     }

  ⑤ Claude applies revised_evidence to produce evidence_{r+1}
     · resubmit opc_<step>_complete

  ⑥ if r == max_rounds AND still failing:
     → verdict: "rounds_exceeded"
     → flow_next: ask_user with kept_objections + unresolved_assertions
     → DO NOT call opc_<step>_complete — registry-guard rejects
```

## 7. Primary method — M3 CoVe details

The CoVe sub-agent runs with whitelist
`tools: [opc_knowledge_get, opc_knowledge_search, opc_corrections_query, Read, Grep]`.
Its turn-script:

```
1. Receive: { evidence, source_messages: user_message_history }
2. Decompose evidence into atomic assertions:
   - P2: each requirement / dependency / risk / knowledge_plan row = one assertion
   - P4: each brief section coverage_check row = one assertion
3. For each assertion, generate a verification question:
   - "Is the source_quote actually in user_message_history?" (P2 requirements)
   - "Does opc_knowledge_list show this unit?" (P2 dependencies)
   - "Does analysis_evidence_ref resolve to a real artifact?" (P4 coverage)
4. Execute verification per question (whitelisted tools only).
5. Emit revised_evidence with verified-only claims + unresolved list.
```

Hard rule: CoVe MUST NOT invent new requirements. If a verification
fails, the assertion is dropped or flagged — never replaced by a
fabricated stand-in. Meta-validator catches fabrication via
`source_quote` non-existence in `user_message_history`.

## 8. Secondary method — M2 Reflexion (corrections injection)

Triggered ONLY when:
- M3 CoVe returned `objections_remain`, AND
- `opc_corrections_query({step, keywords})` returns ≥ 1 entry

The Reflexion-augmented prompt prepends historical corrections to
the next CoVe round:

```
"以下是同类历史教训，请逐条对照检查 evidence：
 - [correction-1] 上次遗漏 risks.area=performance（高频 keyword: 'login'）
 - [correction-2] 用户更正过 phase_selection 漏选 03-design
 现在请重新做 CoVe verification ..."
```

This is NOT "let the LLM remember" — corrections are stored
deterministically in `opc_corrections_record` (distiller in P8 or
direct user intervention) and injected by string concatenation.
The LLM only consumes the injected hints during its CoVe turn.

If no corrections hit, the loop falls back to a second M3 CoVe
round on the new evidence — Reflexion adds no value without
historical signal.

## 9. Meta-Validator hallucination guards (P2 / P4 specific)

| Check | P2 trigger | P4 trigger | Effect |
|---|---|---|---|
| Phantom requirement | `requirements[].source_quote` not in `user_message_history` | — | Drop requirement; mark assertion `unresolved: fabricated_quote` |
| Phantom dependency | `dependencies[].requires` of type `knowledge_unit` not in `opc_knowledge_list()` AND not in `knowledge_plan` | — | Drop dependency |
| Phantom section ref | — | `brief_evidence.coverage_check[].source_ref` doesn't resolve | Drop row; mark unresolved |
| Stale knowledge | Any cited knowledge file has `mtime > dispatch_time` | Same | Surface as `warning` (not auto-drop) — let Claude decide if change invalidates the analysis |
| Verdict-signal mismatch | `complexity_signals.verdict` doesn't match the two-question matrix | — | Hard fail — `complexity_signal_drift` |

## 10. Persistence

```
flow-state.json:
  current_step:               "task_analysis" | "brief_generation"
  pending_reflections[]:      [{reflection_id, step_id, expires_at}]

state.json.intent_analysis:
  task_analysis_evidence_final:  the artifact that passed V1–V5
  task_analysis_reflection_log:  [{reflection_id, round, verdict, evidence_artifact_ref, ts}]
  brief_evidence_final:          (optional)
  brief_reflection_log:          [{...}]
```

`evidence_artifact_ref` resolves to
`opc-logs/reflection/<session_id>/<reflection_id>.json`. The
log keeps refs only — never inline copies of evidence.

After `opc_pipeline_create`, both `_final` records become read-only.
`opc_flow_restart({from_step:"task_analysis"})` or
`from_step:"brief_generation"` discards the relevant `_final` and
its log, allowing a fresh evidence collection from round 1.

## 11. Worked example — P2 requirement coverage

User input: "实现登录页面，支持邮箱密码，用 jwt 认证"

Round 1 — Claude submits:
```json
"task_analysis_evidence": {
  "requirements": [
    {"id":"req-1","text":"实现登录页","source_quote":"实现登录页面"}
  ],
  "complexity_signals": {"verdict":"medium","needs_planning":true,"single_round_solvable":true},
  ...
}
```

Validator: V4 coverage soft-fails (input mentions 3 distinct things;
only 1 requirement extracted). → `opc_flow_reflect` dispatches M3 CoVe.

CoVe atomic-assertion decomposition surfaces:
- "实现登录页面" → req-1 ✓
- "支持邮箱密码" → not in requirements ✗
- "用 jwt 认证" → not in requirements ✗

Verification questions confirm the latter two ARE in
user_message_history. `revised_evidence`:
```json
{
  "requirements": [
    {"id":"req-1","text":"实现登录页","source_quote":"实现登录页面"},
    {"id":"req-2","text":"邮箱密码登录","source_quote":"支持邮箱密码"},
    {"id":"req-3","text":"JWT 鉴权","source_quote":"用 jwt 认证"}
  ]
}
```

Round 2 — Claude resubmits. V1–V5 all pass. Meta-validator emits no
severe objection. Route to P3 / P4.

## 12. Failure modes and how to read them

| Failure | Cause | Fix |
|---|---|---|
| `evidence_coverage_failure` | Missing required key | Add the key (even as `[]` with `reasoning_trace` note for genuine N/A) |
| `complexity_signal_drift` | verdict ↔ signals don't match the two-question matrix | Re-derive verdict from signals OR fix signals — pick one and resubmit |
| `phantom_quote` (P2) | `source_quote` not in user_message_history | Quote was paraphrased; either find the verbatim or drop the requirement |
| `phantom_section_ref` (P4) | `coverage_check[].source_ref` doesn't resolve | Use the correct upstream P2/P3 evidence_ref (visible in `state.json.intent_analysis.*_evidence_final`) |
| `corrections_no_hit_fallback` | M2 Reflexion attempted but corrections-store empty | Informational only; loop continues with second M3 round |
| `rounds_exceeded` | `max_rounds` hit, V1–V5 still failing | `flow_next: ask_user` mandatory. Surface kept_objections + unresolved_assertions verbatim. |
| `pending_reflection_expired` | More than 30 min between reflect dispatch and next evidence submit | Re-call `opc_flow_reflect` for a fresh reflection_id |

## 13. User-phrase recognition

| User phrase | Intent | Action (P2 / P4) |
|---|---|---|
| "再想想需求" / "再分析一下" | Manual round trigger | `opc_flow_reflect({step_id:"task_analysis", force_round:true})` |
| "重新分析" | Discard and restart | `opc_flow_restart({from_step:"task_analysis"})` — wipes `_final` + log |
| "重写 brief" | Same for P4 | `opc_flow_restart({from_step:"brief_generation"})` |
| "加约束: X" | Inject constraint | `opc_flow_revise({field:"constraints", append:["X"]})` then re-enter brief_generation |
| "复杂度判错了，是 high" | Override verdict | `opc_flow_revise({field:"complexity", value:"high"})` — bumps max_rounds, triggers re-validation |
| "就这样" / "继续" | Accept current evidence | Honor previous `flow_next` (typically `opc_pipeline_create` or `opc_brief_generation_complete`) |
| "评估卡住了" (rounds_exceeded) | Stuck loop | Show `kept_objections` + `unresolved_assertions` verbatim; offer 3 options — (a) accept-as-is (records user_override), (b) edit evidence manually via `opc_flow_revise`, (c) restart via `opc_flow_restart` |

## 14. P2 ↔ P4 sequencing

```
opc_task_analysis_complete (P2)
  → pass V1–V5
  → modify count ≤ 1: skip to P4 brief_generation
  → modify count ≥ 2: route to P3 task_decomposition first, then P4
                       (see 03_task-decomposition.md for P3 M6+M5 reflection)

opc_brief_complete (P4)
  → pass V1–V5
  → opc_pipeline_create
```

P2 evidence is referenced by P3 `decomposition_evidence` AND P4
`brief_evidence`. Restarting P2 invalidates downstream `_final`
records — `opc_flow_restart` cascades the wipe.

## 15. Why this file does NOT cover P3

P3 (`opc_decomposition_complete`) is **class-D meta-decision** (per
method-theory §四) with primary M6 ToT + secondary M5 Debate — a
different method profile entirely. P3's runtime methodology is in
[03_task-decomposition.md](./03_task-decomposition.md); its
reflection mechanics share the registry-guard + pending_reflection
infrastructure from this file but use ToT search + Debate, not
CoVe. A dedicated `prompts/10_reflection-decomposition.md` file is
NOT planned — P3 is rare enough (only fires on modify count ≥ 2)
that its routing live in the step doc instead of a separate
reflection methodology.
