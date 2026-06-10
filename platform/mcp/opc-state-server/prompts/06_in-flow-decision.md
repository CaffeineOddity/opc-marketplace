# In-Flow Decision Method (insert / pause / resume)

> Methodology for `opc_pipeline_replan` (with `execution_priority:
> "immediate"`) and `opc_pipeline_resume`. Loaded as docs reference
> when the user injects a side-task while a sub_pipeline is
> `in_progress`. Spec source:
> [doc/feature/02-opc-state-server/02-pipeline/11_insert-resume.md](../../../../doc/feature/02-opc-state-server/02-pipeline/11_insert-resume.md).
> Per memory `project_phase_reset_and_insert`: 插队走
> `add_sub_pipeline(immediate)` + node 边界挂起 + 自动
> `opc_pipeline_resume`.

## 1. Purpose

Handle "do X before continuing" without killing the running
sub-agent. The mechanism is **scheduling, not interruption**:

- `opc_pipeline_replan` enqueues the new sub with
  `execution_priority: "immediate"`.
- The actual status flip (current sub → `paused`, new sub →
  `in_progress`) happens later, at the next **node boundary**,
  inside `opc_node_complete` via state-manager.
- After the inserted sub finishes, `opc_pipeline_resume` is
  triggered automatically (no user action needed).

## 2. Why node boundary (not sub-agent interrupt, not phase boundary)

| Alternative | Why rejected |
|---|---|
| SIGTERM current sub-agent | Loses agent context; partial knowledge writes leave half-baked state; retry cannot continue. |
| Wait for current phase to finish | medium/high phases run 30 min ~ hours — insertion loses its meaning. |
| **Node boundary (chosen)** | Node is the smallest unit (typically 1–10 min). At node-complete, evidence is persisted and knowledge is committed — minimal cost to pause. |

## 3. The 6-step sequence

```
① opc_pipeline_replan({changes:{add_sub_pipeline:[{
       id: "sub-insert-1",
       knowledge_unit: ["logging"],
       execution_priority: "immediate",
       phase_plan: {...}
   }]}})
   → state-server validates: knowledge_unit MUST NOT overlap with
     any active sub (active = in_progress | paused)
   → writes pipeline-plan.json (new sub: status=pending, inserted_at=ts)
   → returns applied — current sub stays in_progress (no flip yet)

② current node continues to completion
   → Claude calls opc_node_complete(evidence) as usual

③ inside opc_node_complete, state-manager scans pipeline-plan.json:
   → finds execution_priority=immediate + status=pending sub
   → flips: current_sub.status → paused
            current_sub.paused_at = {at, node, phase}
            new_sub.status → in_progress
            flow-state.active_sub_pipeline_id = new_sub.id
   → opc_node_complete returns flow_next: opc_phase_start({sub: new_sub})

④ Claude drives the inserted sub through ITS full phase sequence

⑤ when the inserted sub reaches its final opc_phase_complete:
   → state-manager scans pipeline-plan.json
   → finds status=paused sub
   → automatically invokes opc_pipeline_resume({sub_pipeline_id: paused})

⑥ opc_pipeline_resume:
   → consistency probe (git show confirm_ref vs current) → dirty_paths
   → paused_sub.status → in_progress; clear paused_at (push into history.paused_events)
   → returns resume_pointer: {phase, node: next unblocked} + flow_next: opc_node_start
```

## 4. sub_pipeline.status machine

```
pending ─── replan add_sub ───────────────────────> in_progress (first entry)
in_progress ── immediate sub inserted ──(node boundary)──> paused
paused ──── insert sub completes ──(auto resume)──> in_progress
paused ──── user opc_pipeline_resume ───────────> in_progress
paused ──── opc_pipeline_abort ─────────────────> aborted
```

Constraints:

- `paused` counts as an **active** state for pipeline aggregate
  status (owner is NOT released, orphan detection still applies).
- At most ONE sub may be `in_progress` simultaneously; `paused`
  does not count toward that cap.
- Insertions stack: `sub-A(paused) → sub-B(paused) → sub-C(in_progress)`.
  C completes → resume B; B completes → resume A.

## 5. Pre-conditions enforced by opc_pipeline_replan

`add_sub_pipeline` with `execution_priority: "immediate"` rejected
unless:

| Pre-condition | Why |
|---|---|
| An `in_progress` sub exists | Otherwise there is nothing to pause; use normal `add_sub_pipeline` instead. |
| New sub's `knowledge_unit` ∩ in_progress sub's `knowledge_unit` = ∅ | Concurrent edits on the same units would race the 3-way diff-and-merge layer on resume. |
| `blocked_by` references existing sub ids only | TopologyError otherwise. |

Failure returns `rejected_changes[{spec, reason}]` rather than
throwing — caller can retry with a tweaked spec.

## 6. Interaction with diff-and-merge

Per pre-condition §5, inserted and paused subs cannot touch the
same knowledge units **through the OPC pipeline**. But the user
may manually edit knowledge files (L3 git operations) while a sub
is paused. `opc_pipeline_resume` step ④ probes this:

| Probe result | Action | Downstream |
|---|---|---|
| All clean | No `dirty_paths` | Continue sub-2, knowledge unchanged from pause point. |
| `dirty_paths` non-empty | Returned as hint; does NOT block resume | Next `opc_knowledge_write({base_version})` inside resumed sub will hit a conflict and trigger the standard 3-way diff-and-merge contract (knowledge-server §2.10). |

**Key invariant**: `opc_pipeline_resume` NEVER overwrites files.
The `base_version` optimistic-lock probe is the only conflict
defense — consistent with memory
`project_knowledge_write_conflict` (write side does 3-way diff
+ merge; input.min_version stays a reject precondition).

## 7. Tool boundaries — what does NOT belong here

| Tool | Scope | Why not used for insertion |
|---|---|---|
| `opc_phase_reset` | Single sub's phase rollback | No status flip; does not affect other subs. |
| `opc_flow_revise` | accumulated fields only | Does NOT touch `sub_pipelines[]`. |
| `opc_flow_restart(from_step)` | Rewind to a flow analysis step | Different layer (flow-level, not pipeline-level). |
| `opc_pipeline_abort` | Cascade-terminate ALL subs | Used to ABANDON, not to insert. |
| **`opc_pipeline_replan` + `add_sub_pipeline(immediate)`** | THE insertion entry point | |
| **`opc_pipeline_resume`** | THE explicit resume entry point | Usually auto-invoked by state-manager; user may also call directly. |

## 8. Output contract — opc_pipeline_replan immediate insertion

```json
{
  "applied_changes": {
    "add_sub_pipeline": [{
      "id": "sub-insert-1",
      "title": "logging middleware",
      "knowledge_unit": ["logging"],
      "execution_priority": "immediate",
      "inserted_at": "2026-06-10T07:15:00Z"
    }]
  },
  "rejected_changes": [],
  "replan_history_id": "rp-…",
  "plan": { /* full updated PipelinePlan */ },
  "note": "active sub remains in_progress; flip occurs at next opc_node_complete"
}
```

The `note` field is important — Claude MUST NOT call
`opc_phase_start` for the inserted sub directly. Wait for the
next `opc_node_complete` to surface `flow_next` pointing at the
inserted sub.

## 9. Output contract — opc_pipeline_resume

```json
{
  "resumed_sub_pipeline_id": "sub-2",
  "resume_pointer": {
    "phase": "05-implement",
    "node": "backend-endpoint-2"
  },
  "dirty_paths": ["opc-knowledge/logging/middleware.md"],
  "flow_next": {
    "tool": "opc_node_start",
    "args": { "pipeline_id": "...", "sub_pipeline_id": "sub-2", "node_name": "backend-endpoint-2" }
  }
}
```

`dirty_paths` is informational only. The pipeline keeps moving;
conflicts surface on the next write through the standard
optimistic-lock + 3-way merge path.

## 10. User-phrase recognition

| User phrase | Intent | Tool to call |
|---|---|---|
| "在继续之前，先做 X" | Side-task insertion | `opc_pipeline_replan({changes:{add_sub_pipeline:[{...,execution_priority:"immediate"}]}})` |
| "插队做 X" / "插一个 X" | Same | Same |
| "暂停" | Explicit pause without insertion | `opc_pipeline_pause` (different tool) |
| "继续刚才挂起的" | Manual resume override | `opc_pipeline_resume({sub_pipeline_id:"<paused-id>"})` |
| "算了不插了" | Cancel insertion | If `pending` and not yet flipped → call `opc_pipeline_replan` with `remove_sub_pipeline: ["<id>"]` (caller-supplied id). |
