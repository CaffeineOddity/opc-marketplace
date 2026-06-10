# State Machine — flow-state.json Lifecycle

> Reference document for the flow-state.json state machine. Loaded
> as docs reference when Claude needs to reason about session
> transitions, pending-* guards, or which tools may legally fire at
> a given `current_step`. Spec source:
> [02-state-server/01-intent-analysis/10_flow-state-schema.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/10_flow-state-schema.md),
> [02_flow-tools-entry-lifecycle.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md),
> [03_flow-tools-step-routing.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md),
> [05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md §七·防御3 + §八·补](../../../../doc/feature/05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md).
>
> Companions: every other file in this directory describes ONE step's
> methodology. This file describes the **transitions between steps**
> and the **guards** that block illegal transitions.

## 1. Purpose

One source of truth for: which `current_step` values exist, which
tool legally transitions which step, which fields gate writes
(pending-guards), and what happens on the boundary cases (orphan
recovery, restart, abort, completion).

## 2. The `current_step` enum

```
intent_analysis
  → task_analysis            (intent=task)
  → quick_dispatch_complete  (intent=task + complexity=low) [terminal]
  → chat_dispatched          (intent=chat)                  [terminal]
task_analysis
  → task_decomposition       (modify_count ≥ 2)
  → brief_generation         (modify_count ≤ 1)
task_decomposition
  → brief_generation
brief_generation
  → pipeline_created
pipeline_created
  → phase_execution
phase_execution
  → phase_confirmed
phase_confirmed
  → phase_execution          (next phase)
  → pipeline_completed       [terminal]
```

Terminal steps freeze the session — only `opc_flow_query` / abort /
`opc_flow_recover` are legal calls.

## 3. The `status` enum

```
in_progress    — default for any live session
completed      — opc_pipeline_complete fired
aborted        — opc_flow_lifecycle({action:"abort"}) fired
```

`status` is independent of `current_step`. A session can be `status:
in_progress` at terminal step `chat_dispatched` (waiting for next
user message); a session can be `status: completed` while
`current_step` remains `pipeline_completed` (read-only).

## 4. Transition matrix (tool → step-after-success)

| Caller `current_step` | Tool | Next `current_step` | Notes |
|---|---|---|---|
| (no session) | `opc_flow_lifecycle({action:"start"})` | `intent_analysis` | Creates session_id per host-contract C1 |
| `intent_analysis` | `opc_intent_complete(intent:"task")` | `task_analysis` | |
| `intent_analysis` | `opc_intent_complete(intent:"chat")` | `chat_dispatched` | Terminal — no pipeline |
| `intent_analysis` | `opc_quick_dispatch` | `quick_dispatch_complete` | Low-complexity fast path; terminal |
| `task_analysis` | `opc_task_analysis_complete` (modify=1) | `brief_generation` | |
| `task_analysis` | `opc_task_analysis_complete` (modify≥2) | `task_decomposition` | |
| `task_decomposition` | `opc_decomposition_complete` | `brief_generation` | |
| `brief_generation` | `opc_brief_complete` | `pipeline_created` | Writes `accumulated.brief_content` |
| `pipeline_created` | `opc_pipeline_create` | `phase_execution` | Writes `pipeline_id`, initial `current_pipeline_pointer` |
| `phase_execution` | `opc_phase_start` | `phase_execution` | Sets pointer.phase |
| `phase_execution` | `opc_phase_confirm` | `phase_confirmed` | Writes `confirm_commit_ref`; registry-guarded |
| `phase_confirmed` | `opc_node_start` → `opc_node_complete` (×N) → `opc_phase_complete` | back to `phase_execution` (next phase) OR `pipeline_completed` | Per [05_phase-execution.md §5.2](./05_phase-execution.md#52-routing-matrix) |
| any non-terminal | `opc_flow_lifecycle({action:"abort"})` | `status: aborted` | Cascade-aborts active pipelines |
| any | `opc_flow_revise` | unchanged | Writes `accumulated.*` partial fields |
| any non-terminal | `opc_flow_restart({from_step})` | from_step | Wipes downstream `accumulated.*` + `_reflection_log` |

## 5. The 3 pending-guards

Three mutex fields guard against state divergence. Each is a
**single-slot** mutex (hard invariant: at most 1 active entry).

### 5.1 `pending_reflections[]` (reflection-registry-guard)

```
populated by:  opc_reflect_*_complete returns pending_reflection
cleared by:    opc_flow_reflect({reflection_id}) registers it
expires:       now + 30 min
hard invariant: pending_reflections.length ≤ 1
```

**Guarded tools** (reject if `pending_reflections[]` non-empty):

| Tool | Why |
|---|---|
| `opc_phase_confirm` | Cannot lock node plan with an unresolved reflection |
| `opc_phase_complete` | Same — phase finalization needs validator buy-in |
| `opc_task_analysis_complete` | Resubmitting evidence requires registering the prior round first |
| `opc_decomposition_complete` | Same |
| `opc_brief_complete` | Same |
| `opc_pipeline_create` | Cannot kick off pipeline with dangling reflection |

**Not guarded** (always allowed):

- `opc_flow_query` (must work to surface the pending entry)
- `opc_flow_reflect` (the resolver)
- `opc_flow_revise` / `opc_flow_restart` (escape hatches)
- `opc_flow_lifecycle({action:"abort"})` (escape hatch)

Failure code: `pending_reflection_unregistered`. Fix: call
`opc_flow_reflect({reflection_id})` to register, OR let the entry
expire (next `opc_flow_query` auto-clears expired entries with
`pending_reflection_expired` warning).

### 5.2 `pending_user_question` (pending-question-guard, A3)

```
populated by:  opc_flow_reflect when verdict=rounds_exceeded
cleared by:    opc_flow_user_reply({question_id, user_reply, resolution})
expires:       now + 30 min
hard invariant: pending_user_question is null OR a single object
```

**Guarded tools**: identical list to §5.1. The two guards run in
parallel; either non-empty blocks the same write set.

Failure code: `pending_user_question_unanswered`. Fix: render
`reasoning_trace + kept_objections` to the user verbatim, collect
their reply, transcribe to a structured `resolution` object, then
call `opc_flow_user_reply`. The `resolution` schema (per spec):

```json
{
  "accumulated_patch": { /* field overrides into accumulated.* */ },
  "objections_resolved": ["obj-1", "obj-2"],
  "objections_dismissed": [],
  "notes": null
}
```

The reply auto-emits a `user_interventions[]` entry with
`trigger: "ask_user_rounds_exceeded"` and
`linked_reflection_artifacts[]` pointing to the artifacts that
triggered the ask.

### 5.3 `current_pipeline_pointer` (heartbeat invariant)

Not a guard per se, but every state-server write touches
`owner.last_heartbeat_at` AND updates `current_pipeline_pointer`
when in the pipeline-execution range. This is what
`opc_pipeline_recover` (called internally by
`opc_flow_lifecycle({action:"recover"})`) uses to determine resume
position. See [07_recovery.md §3](./07_recovery.md#3-opc_flow_lifecycleactionrecover-behaviour).

## 6. The `accumulated.*` write-once-per-step rule

Each `accumulated.*` field is written exactly once per "live"
session by its terminator tool:

| Field | Written by | Restartable via |
|---|---|---|
| `intent` + `intent_evidence_ref` | `opc_intent_complete` | `opc_flow_restart({from_step:"intent_analysis"})` |
| `analysis_result` + `analysis_evidence_ref` | `opc_task_analysis_complete` | `opc_flow_restart({from_step:"task_analysis"})` |
| `decomposition_result` + `decomposition_evidence_ref` | `opc_decomposition_complete` | `opc_flow_restart({from_step:"task_decomposition"})` |
| `brief_content` + `brief_evidence_ref` | `opc_brief_complete` | `opc_flow_restart({from_step:"brief_generation"})` |

`opc_flow_restart({from_step})` cascades: wiping a field wipes all
downstream fields AND their `reflection_log` entries. After
restart, the relevant `current_step` is re-entered with empty
`accumulated.*` from that point forward.

`opc_flow_revise({field, ...})` is the **partial-update** path: it
overrides specific keys without wiping downstream evidence. Use
restart for "redo from scratch"; use revise for "tweak one detail".

## 7. History vs reflection_log vs user_interventions

Three append-only logs, each with a distinct purpose:

| Log | Granularity | Distiller (L1→L2) reads? | What it records |
|---|---|---|---|
| `history[]` | Every flow-tool call | No | input/output of each tool call (for `opc_flow_query` summary + audit) |
| `reflection_log[]` | Every reflection round | Indirectly (via evidence artifacts) | `step_id`, `round`, `method`, `evidence_diff`, `validator_result`, `objections_kept_by_meta` |
| `user_interventions[]` | Every user override | **Yes — primary input** | `trigger`, `step_id`, `user_reply`, `resolution`, `linked_reflection_artifacts[]` |

`opc_reflect_record_interventions` (called at `opc_pipeline_complete`)
dispatches a read-only distiller sub-agent that reads
`user_interventions[]`, especially entries with
`trigger: "ask_user_rounds_exceeded"` (richer context), and writes
proposed `corrections_store` entries via `opc_corrections_record`.
The distiller cannot mutate any other state.

## 8. Recovery vs restart vs abort (the 3 reset layers)

| Action | Tool | Ownership | accumulated.* | Use when |
|---|---|---|---|---|
| **Recovery** | `opc_flow_lifecycle({action:"recover"})` | Transfers to new pid | Preserved | Previous process crashed; session_id preserved for distiller continuity |
| **Restart** | `opc_flow_restart({from_step})` | Same owner | Wiped from from_step onward | Current process wants to redo a step with new evidence |
| **Abort** | `opc_flow_lifecycle({action:"abort"})` | Released | Frozen, status flips | Give up entirely; user wants fresh `opc_flow_lifecycle({action:"start"})` |

Recovery is the only one that changes owner.pid. Restart preserves
both pid AND session_id but wipes evidence forward. Abort freezes
everything — the session directory is kept (for L2 distiller) but
no further writes are allowed.

Spec cross-references:
- Recovery: [07_recovery.md](./07_recovery.md)
- Restart: [03_flow-tools-step-routing.md] (see spec)
- Abort: [02_flow-tools-entry-lifecycle.md] (see spec)

## 9. Heartbeat & timeout invariants

| Layer | Timeout | Effect |
|---|---|---|
| `owner.last_heartbeat_at` (whole session) | none — refreshed on every state-server write | If process dies, next `opc_flow_query` sees `owner.alive: false` → orphan surface |
| `pending_reflections[].expires_at` | 30 min | Next `opc_flow_query` clears expired entry with warning; guarded tools become legal again |
| `pending_user_question.expires_at` | 30 min | Same as above |
| `in_progress` node heartbeat (state.json layer) | 30 min | `opc_pipeline_recover` (internal to lifecycle.recover) marks the node `failed` with `error.type: "timeout"` |

The 30-min default is fixed at this layer; no per-step override.
Long-running operations (e.g. a `phase_execution` node taking >30
min) MUST emit periodic `opc_node_heartbeat` to keep the inner
heartbeat fresh. The OUTER pending-guards (`pending_reflections`,
`pending_user_question`) have no heartbeat refresh — they are
fire-and-respond contracts, not long-running operations.

## 10. The pipeline-execution sub-machine

Once `current_step = phase_execution`, an inner state machine takes
over the pipeline. `current_step` flips between `phase_execution`
and `phase_confirmed` per phase iteration; the pipeline-level state
lives in `state.json` (per pipeline_id):

```
state.json.phases[<phase>].status:
  pending → in_progress (opc_phase_confirm) → completed (opc_phase_complete)
  pending ← (opc_phase_reset cascades) ← completed

state.json.phases[<phase>].nodes[<node>].status:
  pending → in_progress (opc_node_start) → completed (opc_node_complete)
  pending → in_progress → failed (opc_node_finish status=failed OR heartbeat timeout)
  failed  → pending (opc_node_finish status=retry, cascades downstream)

sub_pipeline.status:
  pending → in_progress (first opc_phase_start of the sub)
  in_progress → paused (immediate insertion at node boundary, per 06_in-flow-decision.md)
  paused → in_progress (auto opc_pipeline_resume OR explicit)
  paused → aborted (opc_pipeline_abort)
  in_progress → completed (all phases.status = completed)
```

Cross-reference detail:
- Phase loop: [05_phase-execution.md](./05_phase-execution.md)
- In-flow insertion: [06_in-flow-decision.md](./06_in-flow-decision.md)
- Recovery semantics: [07_recovery.md](./07_recovery.md)

## 11. Orphan detection (C1 contract)

Per host-contract C1, a "session" is identified by `session_id =
sess-<pid>-<ts>`. `opc_flow_query` always runs an alive-check on
owner.pid:

```
opc_flow_query() →
  read .opc/sessions/<session_id>/flow-state.json
  kill(owner.pid, 0)
    → ESRCH  → owner.alive = false → response includes orphan: true
    → OK     → owner.alive = true  → response includes active: true
  scan sibling sessions/*/flow-state.json for dead-pid candidates
    → populate orphan_candidates[] if any
```

Only **dead** pids surface as orphans. A live pid is treated as
another Claude Code instance — attempting to recover it raises
`OwnerStillAliveError`. This invariant is what makes
`opc_flow_lifecycle({action:"recover"})` safe under concurrent
sessions.

## 12. State-machine guarantees Claude can rely on

1. **One step per session at a time** — `current_step` is single-valued. No "executing P2 and P3 in parallel".
2. **One pending-mutex at a time** — `pending_reflections.length ≤ 1` AND `pending_user_question` is single-slot. The two slots are independent (both can be active simultaneously, blocking the same write set).
3. **Evidence is referenced, not inlined** — `flow-state.json` stores `*_evidence_ref` strings only; the artifact lives in `opc-logs/reflection/<session_id>/`. Restart wipes the ref; the artifact file is left on disk for forensic purposes.
4. **Heartbeat is implicit on every write** — Claude does NOT call a separate heartbeat tool for the session level. (Inner node heartbeat IS explicit — see §9.)
5. **No silent expiry** — every expiry surfaces a `_warnings[]` entry on the next `opc_flow_query` with a code (`pending_reflection_expired`, `pending_question_expired`, `node_heartbeat_timeout`). Claude MUST relay these to the user; auto-suppression would hide divergence.
6. **Restart-cascade is monotonic** — restarting from `task_analysis` wipes analysis + decomposition + brief evidence. There is no way to "restart from task_analysis but keep decomposition".

## 13. Failure modes reference

| Failure | Surfaced by | Fix |
|---|---|---|
| `OwnerStillAliveError` | `opc_flow_lifecycle({action:"recover"})` | Target pid is alive — do NOT attempt takeover; user must investigate the other Claude instance |
| `pending_reflection_unregistered` | Any guarded write tool | Call `opc_flow_reflect({reflection_id})` first |
| `pending_user_question_unanswered` | Any guarded write tool | Render question to user, collect reply, call `opc_flow_user_reply` |
| `pending_reflection_expired` (warning) | `opc_flow_query` | Informational — guard is now clear; next write may proceed |
| `restart_from_terminal_step` | `opc_flow_restart` on aborted/completed | Cannot restart a closed session; start fresh via `opc_flow_lifecycle({action:"start"})` |
| `revise_invalid_field` | `opc_flow_revise` | `field` is not in the revisable allowlist; consult spec |
| `KIT_NOT_LOADED_PRE_FLIGHT` | `opc_pipeline_create` | Hard gate per host-contract A4; user must exit + re-run `claude`. See [07_recovery.md §2.4](./07_recovery.md#24-kit-loading-drift-a4) |
| `node_heartbeat_timeout` | `opc_pipeline_recover` (internal) | Internal recovery marks node failed; surface to user via `recoverable_nodes[]` for retry decision |

## 14. User-phrase recognition (state-machine layer)

| User phrase | Intent | Tool |
|---|---|---|
| "看一下状态" / "现在到哪一步了" | Show current state | `opc_flow_query` — render `current_step` + active pipeline_pointer + any `_warnings` |
| "重启流程" / "重来" | Full restart | `opc_flow_lifecycle({action:"abort"})` then `opc_flow_lifecycle({action:"start"})` |
| "回到 X 步重做" | Targeted restart | `opc_flow_restart({from_step:"<step>"})` (X mapped to enum from §2) |
| "改一下 Y 字段" | Partial revise | `opc_flow_revise({field:"Y", value:...})` |
| "上次崩了的怎么办" | Recovery | `opc_flow_query` first to surface orphans, then route per [07_recovery.md §7](./07_recovery.md#7-user-phrase-recognition) |
| "为什么这么判" (any step) | Explain reasoning | Read latest `reflection_log[].method` + `evidence_diff`; if user wants more, call `opc_reflect_explain({reflection_id})` for full reasoning_trace |

## 15. This file is the index, not the source of truth

When in doubt about a specific transition, defer to the spec:
- Schema authority: [10_flow-state-schema.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/10_flow-state-schema.md)
- Lifecycle authority: [02_flow-tools-entry-lifecycle.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md)
- Routing authority: [03_flow-tools-step-routing.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md)
- Pending-guard contract: [06_call-sequence-contract.md](../../../../doc/feature/05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md)
- Host-contract C1/C2/C4/A4: [00_overview.md](../../../../doc/feature/06-host-contract/00_overview.md)

If this file disagrees with any of those, those win — and this file
needs updating.
