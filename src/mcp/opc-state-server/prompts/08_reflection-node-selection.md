# Reflection Method — Node Selection (P5)

> Methodology for the P5 reflection loop (`opc_phase_confirm`
> pre-flight). Loaded as docs reference when Claude is at
> `current_step ∈ {phase_execution, phase_confirmed}` and is about
> to commit a node list. Spec sources:
> [04_phase-start.md §三–§六](../../../../doc/feature/02-opc-state-server/03-phase/04_phase-start.md),
> [05-opc-reflection-server/01-method-theory/00_overview.md §五](../../../../doc/feature/05-opc-reflection-server/01-method-theory/00_overview.md),
> [05-opc-reflection-server/02-server-design/00_overview.md §evidence + V1–V5 + meta](../../../../doc/feature/05-opc-reflection-server/02-server-design/00_overview.md).
>
> Companion: [05_phase-execution.md](./05_phase-execution.md) covers
> the surrounding control loop (start / confirm / complete / reset).
> This file covers ONLY the node-selection decision + reflection.

## 1. Purpose

Before locking node selection via `opc_phase_confirm`, prove that
the chosen nodes cover the phase's tagged surface, do not violate
file-domain disjointness, and form a sound dependency graph. The
proof is `selection_evidence` — a structured artifact validated by
TS V1–V5 + meta-validator, never an LLM-emitted confidence number.

## 2. Where this fires in the phase loop

```
opc_phase_start
  ↓ available_nodes[] + reflection_budget_hint
  ↓
Claude: rank nodes + collect selection_evidence
  ↓
opc_reflect_validate({step:"node_selection", evidence:{...}})  ← V1–V5 + meta
  ├── all pass + no severe objection           → opc_phase_confirm (auto)
  ├── pass + medium objection                  → opc_phase_confirm (quick_confirm, show reasoning_trace)
  └── fail OR severe objection                 → opc_flow_reflect({step_id:"node_selection"})
                                                  └── iterate ≤ max_rounds; exhausted → ask_user
```

`max_rounds` default = 2 (per
`opc_phase_start.reflection_budget_hint`). High complexity may lift
to 3; simple complexity is clamped to 1.

## 3. selection_evidence schema (REQUIRED)

```json
{
  "selection_evidence": {
    "matched_tags": [
      {"node": "api-design", "tags_matched": ["backend", "api"], "task_tags_covered": ["backend", "api"]},
      {"node": "database-schema", "tags_matched": ["database"], "task_tags_covered": ["database"]}
    ],
    "scenario_hits": [
      {"node": "api-design", "scenario": "add-feature", "recommended_in_phase_scan": true}
    ],
    "file_domain_conflicts": [
      {"node_pair": ["api-design", "database-schema"], "overlap_paths": [], "conflict": false}
    ],
    "blocked_by_graph": [
      {"node": "api-design", "blocked_by": []},
      {"node": "database-schema", "blocked_by": []},
      {"node": "tdd-implementation", "blocked_by": ["api-design", "database-schema"]}
    ],
    "coverage_gaps": []
  }
}
```

Field-by-field meaning (V1–V5 maps onto these directly):

| Field | What it asserts | Validated by |
|---|---|---|
| `matched_tags[]` | Each picked node carries at least one tag from `task_tags`. `task_tags_covered[]` is the subset of phase's `task_tags` this node accounts for. | **V1 coverage** — UNION of `task_tags_covered` across nodes MUST cover every entry in `task_tags`. Missing tags surface as `coverage_gaps[]`. |
| `scenario_hits[]` | For each node whose `recommended` flag was true in `opc_phase_start.available_nodes[]`, record whether the scenario actually triggered the recommendation. | **V2 scenario alignment** — a node claiming `recommended_in_phase_scan: true` MUST appear in `opc_phase_start`'s `available_nodes[]` with `recommended: true`. Drift = fabrication. |
| `file_domain_conflicts[]` | Pairwise overlap of `output.path` patterns across picked nodes. | **V3 disjointness** — `conflict: true` pairs MUST be either resolved (drop a node) or serialized via `blocked_by`. Concurrent group with `conflict: true` fails V3. |
| `blocked_by_graph[]` | Topological dependency derived from `input/output` chains and explicit `blocked_by` hints. | **V4 topology** — graph MUST be acyclic; every `blocked_by` ref MUST exist in the picked node list. |
| `coverage_gaps[]` | Tags in `task_tags` not covered by any picked node. SHOULD be empty. | **V5 discrimination** — non-empty triggers a soft warning unless the user explicitly accepted scope reduction; coverage_gaps + no user-stated narrowing = fail. |

Hard rule: a `selection_evidence` missing any of the 5 keys is
rejected by the evidence-coverage guard before V1–V5 even runs.

## 4. Three advance paths (per phase-start §四)

| Validator outcome | Meta-Validator | Path | Claude's next call |
|---|---|---|---|
| V1–V5 all pass | no objection | **auto_confirm** | `opc_phase_confirm` directly |
| V1–V5 all pass | medium objection (e.g. ToT optimism noted) | **quick_confirm** | `opc_phase_confirm`; surface `reasoning_trace` to user in `step_instruction` |
| Any V fail OR severe objection | — | **reflection loop** | `opc_flow_reflect({step_id:"node_selection"})` |

`auto_confirm` and `quick_confirm` are deterministic outcomes from
validator results — Claude MUST NOT downgrade auto to quick or
escalate quick to reflection based on "feel". The validator verdict
governs.

## 5. The reflection loop iteration

```
round r (1 ≤ r ≤ max_rounds):
  ① opc_flow_reflect({step_id:"node_selection", evidence: selection_evidence_r})
     → reflection-server picks method per §五 of method-theory:
       primary = M4 Critique (read-only critic sub-agent)
       secondary = M5 Debate (only if complexity ≥ medium AND primary triggered objection)
     → returns reflection_id, objections[], suggested_adjustments[]
     → pending_reflections[] gets one entry (registry-guard arms)

  ② Claude reviews objections[]:
     · "node X missing → add" → adjust node list
     · "node Y redundant → drop"
     · "blocked_by graph wrong → re-thread"
     → produces selection_evidence_{r+1}

  ③ opc_reflect_validate again
     · pass → opc_phase_confirm (registry-guard auto-clears the resolved pending_reflection)
     · fail → round r+1

  ④ if r == max_rounds AND still failing:
     → verdict: "rounds_exceeded"
     → flow_next: ask_user with the latest objections[]
     → DO NOT call opc_phase_confirm — registry-guard would reject it anyway (pending_reflections[] non-empty)
```

Per-round invariants:

- Each round's `selection_evidence` MUST be a fresh artifact — do
  NOT re-submit the previous round's evidence with the same hash.
  Meta-validator catches no-op iterations and forces `ask_user`.
- The pending_reflection from round r expires 30 minutes after
  creation. If Claude is still iterating past expiry, registry-guard
  rejects with `pending_reflection_expired`; resolve by calling
  `opc_flow_reflect` again to get a fresh reflection_id.

## 6. Primary method — M4 Critique

`opc_flow_reflect` dispatches a **read-only critic sub-agent** with
the whitelist `tools: [opc_knowledge_get, opc_knowledge_search,
opc_corrections_query, Read, Grep]`. The critic:

1. Reads the picked nodes + their `input/output` declarations.
2. Reads the phase's `task_tags` and the active knowledge_unit's
   relevant `.md` files via `opc_knowledge_get`.
3. Queries `opc_corrections_query({step:"node_selection"})` for past
   user-corrected mistakes on similar phases.
4. Emits `objections[]` with `severity ∈ {low, medium, high}`,
   `category ∈ {missing_coverage, redundant_node, wrong_dependency,
   scenario_mismatch}`, and `suggested_fix`.

The critic CANNOT write. Any attempted state-server write tool
returns `tool_not_in_whitelist` (host-contract C4). This is the
guarantee that critic output is "external view" and not the same
process the validator is asked to second-guess.

## 7. Secondary method — M5 Debate (complexity ≥ medium only)

Triggered when M4 Critique emits a `severity: high` objection. Two
sub-agents (`opc_critic_pro`, `opc_critic_con`) each get the same
read-only whitelist. They alternate up to 3 turns; a third
synthesizer sub-agent (also read-only) summarizes into a single
`debate_resolution`.

Meta-validator's **fake-debate detection**: if pro/con turn texts
overlap above the configured threshold (token-Jaccard ≥ 0.7 on
3-grams), the debate is flagged `fake_debate: true` and downgraded
to "no signal" — does NOT count as evidence for or against
confirmation.

Debate is NEVER used for `complexity = low/simple` (per method-theory
禁用矩阵 §六). At low complexity the loop terminates with M4
Critique only.

## 8. Meta-Validator hallucination guards

Three checks run after every primary/secondary method, before
results reach Claude:

| Check | Trigger | Effect |
|---|---|---|
| Phantom objection | Objection references a `node_name` not in the current picked list | Drop objection (don't surface) |
| Optimism bias (M6 ToT) | Not applicable to P5 — ToT not used here | — |
| Stale evidence | Any `selection_evidence` field references a knowledge `.md` whose `mtime > dispatch_time` | Surface as `warning`, not auto-drop; let Claude decide if the change invalidates the selection |

Meta-validator never WRITES corrections (that's the distiller's
job in P8). It only filters and tags.

## 9. Persistence

```
flow-state.json:
  current_step:               "phase_execution" | "phase_confirmed"
  pending_reflections[]:      [{reflection_id, step_id:"node_selection", expires_at}]
  current_pipeline_pointer:   {sub_pipeline_id, phase, ...}

state.json.phases[<phase>]:
  reflection_log[]:           [{reflection_id, round, verdict, evidence_artifact_ref, ts}]
  selection_evidence_final:   the artifact that ultimately passed V1–V5
  selection_method_trace:     [{round, primary:"M4", secondary:"M5"?, verdict}]
```

`evidence_artifact_ref` resolves to
`opc-logs/reflection/<session_id>/<reflection_id>.json` — the
canonical artifact the validator scored. Inline copies inside
`reflection_log[]` are forbidden (size + drift); always store
ref + read on demand.

After `opc_phase_confirm` commits, `selection_evidence_final` is
read-only. Subsequent `opc_phase_reset` discards it together with
the phase's confirm anchor; the next `opc_phase_confirm` writes a
fresh evidence record (new round counter from 1).

## 10. Worked example — V4 coverage_gaps → add node

Phase: `04-implement-design`. `task_tags = ["backend", "auth", "database"]`.

Round 1 — Claude submits:
```json
"selection_evidence": {
  "matched_tags": [
    {"node": "api-design", "tags_matched": ["backend", "auth"], "task_tags_covered": ["backend", "auth"]}
  ],
  "coverage_gaps": ["database"]
}
```

Validator: V1 fails (`coverage_gaps` non-empty AND user did not
narrow scope). `opc_flow_reflect` dispatches M4 critic.

Critic returns:
```json
{"objections":[
  {"severity":"high","category":"missing_coverage",
   "suggested_fix":"add 'database-schema' node — its tags include 'database' and the phase has database in task_tags"}
]}
```

Round 2 — Claude adds `database-schema`:
```json
"selection_evidence": {
  "matched_tags": [
    {"node": "api-design",       "tags_matched": ["backend","auth"], "task_tags_covered": ["backend","auth"]},
    {"node": "database-schema",  "tags_matched": ["database"],       "task_tags_covered": ["database"]}
  ],
  "blocked_by_graph": [
    {"node": "api-design",      "blocked_by": []},
    {"node": "database-schema", "blocked_by": []}
  ],
  "coverage_gaps": []
}
```

Validator: V1–V4 pass. V5 emits a discrimination warning
("api-design and database-schema have no explicit dependency — is
this intentional?"). Meta-validator marks warning as `medium`, no
severe. → **quick_confirm**. Claude calls `opc_phase_confirm`;
`step_instruction` surfaces the V5 warning so the user can override
the parallel scheduling if needed.

## 11. Failure modes and how to read them

| Failure | Cause | Fix |
|---|---|---|
| `pending_reflection_unregistered` | Calling `opc_phase_confirm` while `pending_reflections[]` has an unresolved entry | Submit the failing reflection's resolution via the next `opc_flow_reflect → opc_reflect_validate` round before retrying confirm |
| `evidence_coverage_failure` | `selection_evidence` missing one of the 5 required keys | Emit the missing key (even as empty array if truly N/A — but justify N/A in `reasoning_trace`) |
| `selection_evidence_drift` | A `matched_tags[].node` not in `opc_phase_start.available_nodes[]` | Cannot pick a node not surfaced by phase-start; either re-run phase-start (if knowledge files changed) or drop the node |
| `rounds_exceeded` | Max-rounds hit with V1–V5 still failing | `flow_next: ask_user` is mandatory; do NOT silently retry. Quote the latest objections to user verbatim. |
| `fake_debate` (M5 only) | Pro/con turns too similar | Result downgraded to no-signal; loop falls back to M4-only verdict |
| `pending_reflection_expired` | More than 30 min between `opc_flow_reflect` and submitting next evidence | Re-call `opc_flow_reflect` for a fresh reflection_id; previous one is dead |

## 12. User-phrase recognition

| User phrase | Intent | Action |
|---|---|---|
| "节点选得不对" / "重选节点" (pre-confirm) | Manual override before confirm | `opc_phase_confirm({nodes:[...]})` — bypasses P5 evidence; user has explicitly taken responsibility |
| "为什么选这些节点" | Show reasoning | Read `state.json.phases[].selection_method_trace` + latest `evidence_artifact_ref`, summarize objections-resolved |
| "再反思一轮" | Force an extra round | `opc_flow_reflect({step_id:"node_selection", force_round:true})` — only honored if `max_rounds` not yet hit |
| "就这些节点了，别反思了" | Skip reflection | NOT allowed if V1–V5 currently failing (registry-guard rejects confirm). User must either accept ask_user path or change node selection so V1–V5 pass. |
| "评估卡住了" (rounds_exceeded) | Stuck loop | Honor `ask_user`: show latest objections + 3 options — (a) accept current selection (records user_override), (b) adjust nodes manually, (c) abort phase via `opc_phase_reset` |

## 13. Why P5 uses M4-primary, not M3 CoVe (vs P2/P4)

P5 is a **decision** failure mode (class D per method-theory §四),
not a completeness failure mode (class B). The risk is "picked the
wrong set" not "missed listing assertions". An independent
external view (M4 critic with knowledge access) catches wrong-set
errors that CoVe's self-assertion-checking cannot. P2/P4 reverse
this — they assemble facts, so CoVe's "list claims, verify claims"
is the better primary there.

Cross-reference: [09_reflection-task-analysis.md](./09_reflection-task-analysis.md)
covers the P2/P4 M3-primary methodology.
