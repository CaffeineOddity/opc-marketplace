# Phase Execution Method

> Methodology for `opc_phase_start` / `opc_phase_confirm` /
> `opc_phase_complete` / `opc_phase_reset`. Loaded as docs reference
> when Claude is at `current_step ∈ {phase_execution,
> phase_confirmed}`. Spec sources:
> [04_phase-start.md](../../../../doc/feature/02-opc-state-server/03-phase/04_phase-start.md),
> [05_phase-confirm-execute.md](../../../../doc/feature/02-opc-state-server/03-phase/05_phase-confirm-execute.md),
> [06_phase-complete-reset.md](../../../../doc/feature/02-opc-state-server/03-phase/06_phase-complete-reset.md).
>
> P5 node-selection methodology (selection_evidence + reflection
> loop) lives in
> [reflection-node-selection.md](./reflection-node-selection.md).
> This file covers the execution control loop only.

## 1. Purpose

Drive the phase execution loop for one sub_pipeline:

```
opc_phase_start
  → (Claude selects nodes; see reflection-node-selection.md for P5)
  → opc_phase_confirm
  → opc_node_start … opc_node_complete (per node)
  → opc_phase_complete
  → recurse on next phase, OR move to next sub_pipeline, OR call opc_pipeline_complete
```

## 2. opc_phase_start — node scan

Pure deterministic, no LLM. State-server:

- Validates: `pipeline` exists, `sub_pipeline` exists, `prev phase
  completed`, `phase ∈ state.json.phase_plan.selected`.
- Scans `.opc/phases/<phase>/nodes/*.md`.
- Filters by tag intersection (`task_tags ∩ node.tags`).
- Marks `recommended: true` for nodes matched by the scenario.
- Sets `phase.status = in_progress`, updates `flow-state.json`
  (`current_step = "phase_execution"`, pointer, heartbeat).

Returns:

```json
{
  "phase": "04-implement-design",
  "task_tags": ["backend", "auth", "database"],
  "scenario": "add-feature",
  "available_nodes": [
    {
      "name": "api-design",
      "tags": ["api", "backend"],
      "agents": { "primary": ["backend-engineer"] },
      "input": [...],
      "output": [...],
      "recommended": true
    }
  ],
  "reflection_budget_hint": {
    "max_rounds": 2,
    "primary_method": "M4-Critique",
    "secondary_method": "M5-Debate"
  },
  "methodology": {
    "docs": ["prompts/05_phase-execution.md", "prompts/08_reflection-node-selection.md"]
  },
  "flow_next": {
    "suggestion": "rank + collect selection_evidence; validator pass → opc_phase_confirm; fail → opc_flow_reflect"
  }
}
```

Claude's job between `phase_start` and `phase_confirm`:
1. Rank `available_nodes[]` by semantic + scenario match.
2. Collect `selection_evidence` per
   [reflection-node-selection.md §3](./reflection-node-selection.md).
3. If V1–V5 pass → proceed to `opc_phase_confirm`.
4. If V1–V5 fail or severe objection → `opc_flow_reflect` with
   `step_id="node_selection"` and iterate.

## 3. opc_phase_confirm — lock the execution plan

⚠️ **reflection-registry-guard pre-check**: rejected with
`pending_reflection_unregistered` if `flow-state.json.pending_reflections[]`
is non-empty. Resolve via `opc_flow_reflect` first.

```
parameters: pipeline_id, sub_pipeline_id, phase, nodes: [{name, blocked_by?}]
```

State-server behaviour:
1. Registry-guard pre-check (see above).
2. `node-resolver` resolves dependencies. Even if caller supplied
   `blocked_by`, it is re-validated and corrected.
3. File-domain conflict check (artifacts + knowledge path overlap →
   degrade to serial within the same group).
4. Write `state.json.phases[phase].nodes[]` + `blocked_by`.
5. **Git commit anchor**:
   ```
   git add .opc/knowledge/
   git commit -m "opc: phase confirm <pipeline_id>/<sub>/<phase>" --allow-empty
   ```
   Commit hash is written to
   `state.json.phases[phase].confirm_commit_ref`. This is the
   anchor used by `opc_phase_reset` (§6).
6. Once confirmed, `opc_phase_confirm` is rejected for this phase —
   adjustments must roll forward via `opc_node_retry` or
   `opc_phase_reset`.
7. Updates `flow-state.json`: `current_step = "phase_confirmed"`.

Returns `groups: [{group, nodes, parallel}]` + `flow_next.tool =
"opc_node_start"`.

## 4. Node execution loop

Per group, in order:

| Rule | Behaviour |
|---|---|
| Within a group with `parallel: true` | Nodes may `opc_node_start` concurrently. |
| Across groups | Strictly serial — group N+1 starts ONLY after every node in group N reaches `completed`. |
| Any node `failed` | Blocks downstream nodes in the same group; surface to user before continuing. |
| Retry / timeout | Detected lazily by state-manager. Use `opc_node_retry` for L1 redo (cascades reset of downstream nodes). |

Each node walks the full `opc_node_start → Agent execution →
opc_node_complete / opc_node_fail` flow defined in node spec.

## 5. opc_phase_complete — phase done + advance decision

⚠️ Registry-guard pre-check applies (same as `opc_phase_confirm`).

State-server behaviour:
1. Validates every node in the phase reached `completed`.
2. Writes `state.json.phases[phase].status = completed`.
3. Computes `next_phase` from `state.json.phase_plan.selected`
   (NOT `available` — skipped phases stay skipped).
4. Computes `auto_advance` per §5.1.
5. Computes `pipeline_progress` (current sub, next sub, pending subs).
6. Updates `flow-state.json` pointer:
   - `next_phase != null` + `auto_advance` → advance phase.
   - `next_phase == null` + `next_sub_pipeline != null` → switch sub.
   - All complete → leave pointer; expect `opc_pipeline_complete`.

### 5.1 auto_advance rules

```
auto_advance = (
    task.complexity != "high"
  AND every node in phase is 100% completed (no retry-fallback completion)
  AND phase's P5 selection_evidence passed V1–V5
      AND meta-validator kept no severe objections
  AND next_phase exists in state.json.phase_plan.selected
      (lookup follows selected order, not available)
)
```

Any condition false → `auto_advance = false`, user confirms before
the next phase starts.

### 5.2 Routing matrix

| `next_phase` | `auto_advance` | `next_sub_pipeline` | Claude's next call |
|---|---|---|---|
| set | true | — | `opc_phase_start({phase: next_phase})` |
| set | false | — | tell user, wait for "继续", then `opc_phase_start` |
| null | — | set | `opc_phase_start({sub_pipeline_id: next_sub, phase: first_of_plan})` |
| null | — | null (all sub done) | `opc_pipeline_complete` |

## 6. opc_phase_reset — phase redo via git anchor

L2 rollback. Per memory `project_phase_reset_and_insert`: phase_reset
goes through `git checkout` + `v+1` writes (version always forward,
NO snapshot backstep).

```
parameters: pipeline_id, sub_pipeline_id, phase

flow:
  → read state.json.phases[phase].confirm_commit_ref
    └── missing → error "phase never confirmed"
  → for each output.knowledge path on this phase:
      ① base    = git show <commit>:.opc/knowledge/<path>
      ② current = current .opc/knowledge/<path>; current_version
      ③ if base == current → skip (no rewrite needed)
      ④ else opc_knowledge_write({
            content: base,
            base_version: current_version,   // standard optimistic lock
            metadata: { reset_from_commit, reset_phase }
         })
      ⑤ resulting v = current_version + 1
  → phase → pending (all nodes reset)
  → downstream phases → pending
  → no new snapshot stored; next opc_phase_confirm writes a fresh confirm_commit_ref
```

Returns `{ reverted_paths, skipped_paths, conflict_paths,
next_phase_status: "pending" }`.

Restrictions:

- Only acts on `.opc/knowledge/` `.md` files; does NOT touch `src/`.
- Aborted pipelines cannot be reset (state machine closed).
- Merge conflict during write (user edited the `.md` to overlap
  with base) → returned in `conflict_paths`; resolve via
  `suggested_actions` (knowledge-server 3-way diff-and-merge
  contract).

## 7. Layered rollback overview

| Layer | Scope | Tool | Mechanism |
|---|---|---|---|
| L0 | Adjust node selection (pre-confirm only) | `opc_phase_confirm` | rewrite `state.json` node list |
| L1 | Redo a single output | `opc_node_retry` | per-node retry, cascade downstream reset |
| L2 | Discard knowledge of one phase | `opc_phase_reset` | git checkout anchor → v+1 rewrite |
| L3 | Full rollback (knowledge + code) | git checkout/revert | OPC does NOT wrap |

L0–L2 are OPC-built-in. L3 is left to plain git.

## 8. Correction commands (during phase execution)

| User phrase | Tool to call |
|---|---|
| "改节点" / "加节点 X" (pre-confirm) | `opc_phase_confirm({nodes:[...]})` |
| "重做 phase" | `opc_phase_reset({phase})` |
| "重做节点 X" | `opc_node_retry({node_name:"X"})` |
| "插队做 Y" | `opc_pipeline_replan({add_sub_pipeline:[{...,execution_priority:"immediate"}]})` — see [in-flow-decision.md](./06_in-flow-decision.md) |
| "暂停" | `opc_pipeline_lifecycle({action:"replan"})` |
| "继续" (after auto_advance=false) | Honor previous `flow_next` (`opc_phase_start`) |
