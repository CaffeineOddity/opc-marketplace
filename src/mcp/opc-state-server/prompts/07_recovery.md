# Recovery Method

> Methodology for `opc_flow_query` (orphan surface) and
> `opc_flow_lifecycle({action:"recover"})` (the merged
> `opc_flow_recover` post-consolidation). Loaded as a docs
> reference when `opc_flow_query` returns `orphan: true` OR
> `_warnings[].code = KIT_PROBABLY_NOT_LOADED`. Spec sources:
> [02_flow-tools-entry-lifecycle.md §opc_flow_recover](../../../../doc/feature/02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md),
> [doc/feature/06-host-contract/00_overview.md §2.1–2.8](../../../../doc/feature/06-host-contract/00_overview.md),
> [doc/feature/04-e2e/02-test/08_recovery.md](../../../../doc/feature/04-e2e/02-test/08_recovery.md).

## 1. Purpose

Detect and recover from session crashes (orphan flow state),
stale `in_progress` nodes (heartbeat timeout), and kit-loading
drift (kit installed after session start). All three are surfaced
by `opc_flow_query`; the response shape tells Claude exactly
which recovery path to take.

## 2. Trigger surface — what `opc_flow_query` returns

### 2.1 Healthy active session

```json
{ "active": true, "orphan": false, "snapshot": { ... }, "next": { ... } }
```

Continue as normal — no recovery action.

### 2.2 Orphan session (C1: previous Claude crashed)

```json
{
  "active": true,
  "orphan": true,
  "session_id": "sess-12345-1717840000",
  "owner": { "pid": 12345, "alive": false },
  "snapshot": { "current_step": "phase_execution", "pipeline_id": "...", "current_pipeline_pointer": {...} },
  "step_instruction": "上次 session crash 残留的流程。建议恢复或放弃。",
  "methodology": { "docs": ["prompts/07_recovery.md"] },
  "suggested_actions": [
    {"intent": "恢复流程", "next": {"tool": "opc_flow_lifecycle", "args": {"action":"recover"}}},
    {"intent": "放弃并开新流程", "next": {"tools": ["opc_flow_lifecycle({action:'abort'})", "opc_flow_lifecycle({action:'start'})"]}}
  ],
  "orphan_pipelines": [
    { "id": "pipeline-…", "last_active": "…", "suggest": "opc_flow_lifecycle({action:'recover'}) cascades" }
  ]
}
```

Action: ask the user "恢复 or 放弃?". Pick the matching tool from
`suggested_actions[]`.

### 2.3 Multiple orphan candidates (C1 scan)

When the current process has its own healthy session but the
session directory contains other crashed sessions:

```json
{
  "active": true,
  "orphan": false,
  "orphan_candidates": [
    { "session_id": "sess-8000-…", "owner": { "pid": 8000, "alive": false } }
  ]
}
```

Action: surface to user as "发现 N 条无主流程，要恢复哪一条 / 全部
放弃?". Recover one at a time via
`opc_flow_lifecycle({action:"recover", session_id:"<orphan>"})`.

Per C1 alive-check guarantee: only **dead** pids surface in
`orphan_candidates`. A `session_id` whose owner pid is still
alive is treated as another live Claude Code instance — NEVER
take it over (attempting to do so raises `OwnerStillAliveError`).

### 2.4 Kit-loading drift (A4)

```json
{
  "active": true,
  "_warnings": [{
    "code": "KIT_PROBABLY_NOT_LOADED",
    "kit": "backend-pro",
    "affected_agents": ["backend-engineer", "api-designer"],
    "affected_mcp_servers": ["postgres"],
    "installed_at": "2026-06-10T05:00:00Z",
    "session_started_at": "2026-06-10T00:00:00Z"
  }],
  "suggested_actions": [
    { "action": "restart_session", "reason": "kit_not_loaded", "details": {...} }
  ]
}
```

Per host-contract §C4 推论: `.claude/agents/*.md` + `.mcp.json`
are scanned ONLY at Claude Code session start. Kits installed
after start are invisible to the running process.

Action: tell the user "kit `<name>` installed after this session
started; exit + re-run `claude` to load it". Do NOT attempt to
work around it — the affected agents/servers literally do not
exist in this process.

If the user proceeds anyway and the pipeline plan declares
`required_agents` overlapping `_warnings[].affected_agents`,
`opc_pipeline_create` will reject with
`KIT_NOT_LOADED_PRE_FLIGHT` (hard gate). That error is
non-bypassable — restart is the only fix.

## 3. opc_flow_lifecycle({action:"recover"}) behaviour

```
opc_flow_lifecycle({action: "recover", session_id?: "<orphan>"})
  ① validate target session.owner.pid is dead (kill(pid, 0) → ESRCH)
     → if alive → reject with OwnerStillAliveError
  ② transfer owner: target.owner.pid = current process pid
     refresh last_heartbeat_at
     session_id field is PRESERVED (history continuity)
  ③ if snapshot.current_pipeline_pointer is non-null:
     → internally cascade pipeline_recover:
       · for each in_progress node with no heartbeat in 30 min
         → mark failed (error.type: "timeout")
         → cascade-reset downstream nodes (same rules as opc_node_finish status=retry)
  ④ return resume_step + resume_pointer + recoverable_nodes[]
```

Response shape:

```json
{
  "recovered": true,
  "resume_step": "phase_execution",
  "resume_pointer": { "sub_pipeline_id": "sub-1", "phase": "05-implement", "node": "tdd-implementation" },
  "next": { "tool": "opc_node_finish", "args": { "status": "retry", "node_name": "tdd-implementation" } },
  "recoverable_nodes": [
    { "name": "tdd-implementation", "status": "failed", "suggested_action": "opc_node_finish({status:'retry'})" }
  ]
}
```

`next` tells Claude exactly which tool to call to resume. For a
timeout-marked failed node, that is usually
`opc_node_finish({status:"retry"})` to re-run from the start of
the failed node.

## 4. Why recovery does NOT create a new session_id

Per host-contract §2.2:

- Recovery = take over the existing directory's `owner`. The
  directory name (= original `session_id`) is preserved.
- `reflection_log`, `user_interventions`, `history[]` all stay
  intact — distiller (L1→L2 lesson sink) needs them.
- New `session_id` would orphan the old data permanently.

If the user explicitly wants a fresh start (not a resume), they
should pick `opc_flow_lifecycle({action:"abort"})` then
`opc_flow_lifecycle({action:"start"})` from the suggested_actions
list — that path discards the old session.

## 5. Pre-conditions and failure modes

| Pre-condition | Failure mode |
|---|---|
| target owner.pid is dead | `OwnerStillAliveError` if alive (live Claude has not crashed) |
| caller is NOT already inside another active session | start a new session first via `opc_flow_lifecycle({action:"start"})` |
| HTTP/SSE mode: caller supplies `claude_pid` | C2 hard gate — stdio mode rejects explicit `claude_pid`; HTTP/SSE mode rejects missing `claude_pid` |
| current session has `pending_reflections[]` non-empty | registry-guard rejects; resolve via `opc_flow_reflect` first |

## 6. Recovery vs other rollback layers

| Layer | Trigger | Tool | Effect |
|---|---|---|---|
| L0 Adjust nodes (pre-confirm) | user wants different nodes | `opc_phase_confirm` | rewrite node list |
| L1 Redo single output | node failed mid-execution | `opc_node_finish({status:"retry"})` | per-node retry, cascade downstream |
| L2 Discard phase knowledge | phase output is wrong | `opc_phase_reset` | git checkout anchor → v+1 rewrite |
| L3 Full git rollback | user wants source revert | plain git | OPC does NOT wrap |
| **Recovery** | session crashed | `opc_flow_lifecycle({action:"recover"})` | adopt orphan, mark stale in_progress as failed, point at next resume step |

Recovery is the only one that **changes ownership**. L0–L3
operate within a healthy session.

## 7. User-phrase recognition

| User phrase | Action |
|---|---|
| "恢复" / "继续上次" | `opc_flow_lifecycle({action:"recover"})` for the orphan in the query response |
| "全部放弃" / "重新开始" | For each orphan: `opc_flow_lifecycle({action:"abort", session_id:"<orphan>"})`, then start fresh |
| "先看看状态" | Re-call `opc_flow_query` and show `snapshot` to the user |
| "好烦，再试一次" (after timeout-failed node) | follow `recoverable_nodes[].suggested_action` (typically `opc_node_finish({status:"retry"})`) |
| "kit 重启提示出来了，先重启 claude" | Do NOT call any recovery tool; tell user to exit + re-launch `claude`. Recovery will surface naturally on next `opc_flow_query`. |

## 8. Heartbeat & timeout (background invariant)

- Every state-server write touches `last_heartbeat_at`.
- `opc_pipeline_recover` (called internally by lifecycle.recover)
  considers any `in_progress` node with no heartbeat update in
  30 minutes as timeout → auto-fail.
- The 30-min default is fixed at this layer; no per-node override.
  Long-running nodes MUST emit periodic `opc_node_heartbeat` to
  avoid false-positive timeout. (Node spec.)
