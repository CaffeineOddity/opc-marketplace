# flow-state.json schema

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [完整流程示例](11_complete-example.md)

---

## 十四、flow-state.json schema

每个 session 一个文件：`.opc/sessions/<session_id>/flow-state.json`。

```json
{
  "session_id": "sess-abc-001",
  "status": "in_progress | completed | aborted",
  "owner": {
    "pid": 12345,
    "started_at": "2026-06-08T10:00:00Z",
    "last_heartbeat_at": "2026-06-08T10:30:00Z"
  },
  "created_at": "2026-06-08T10:00:00Z",
  "last_active_at": "2026-06-08T10:30:00Z",
  "aborted_at": null,
  "abort_reason": null,
  "completed_at": null,

  "current_step": "phase_execution",
  "current_step_round": null,

  "user_message_history": [
    "实现用户认证系统",
    "对了，还要加手机号登录"
  ],

  "accumulated": {
    "intent": "task",
    "intent_evidence_ref": "opc-logs/reflection/<pipeline_id>/P1.jsonl#L<line>",
    "analysis_result": {
      "description": "...",
      "tags": ["..."],
      "complexity": "medium",
      "suggested_phases": ["..."],
      "phase_selection_rationale": "add-feature + medium：跳过 00/01/03，从实现设计起步至测试",
      "knowledge_unit": ["..."],
      "scenario": "add-feature",
      "knowledge_plan": [
        {"path": "user-auth/login/api", "operation": "create"},
        {"path": "user-auth/session/api", "operation": "create"}
      ]
    },
    "analysis_evidence_ref": "opc-logs/reflection/<pipeline_id>/P2.jsonl#L<line>",
    "decomposition_result": null,
    "decomposition_evidence_ref": null,
    "brief_content": "...",
    "brief_evidence_ref": null
  },

  "history": [
    {
      "step": "intent_analysis",
      "tool": "opc_intent_complete",
      "input": {"intent": "task", "intent_evidence": {"task_criteria_hits": [...]}},
      "output": {"next": {"tool": "opc_task_analysis_complete"}},
      "at": "2026-06-08T10:01:00Z"
    }
  ],

  "reflection_log": [
    {
      "step_id": "task_analysis",
      "round": 1,
      "method": "M3-CoVe",
      "evidence_diff": {
        "added": ["requirements[+2]", "risks[+1]"],
        "modified": ["complexity: medium → high"],
        "removed": []
      },
      "validator_result": {"V1": "ok", "V2": "ok", "V3": "ok", "V4": "ok", "V5": "ok"},
      "objections_kept_by_meta": 2,
      "notes": "M3 拆解断言后发现 schema 变更未列入 dependencies",
      "at": "..."
    },
    {
      "step_id": "node_selection",
      "pipeline_pointer_ref": {"pipeline_id": "...", "sub_pipeline_id": "sub-1", "phase": "05-implement"},
      "log_entry_id": "state.json#phases[1].reflection_log[0]",
      "at": "..."
    }
  ],

  "pipeline_id": "pipeline-20260608-001",
  "current_pipeline_pointer": {
    "sub_pipeline_id": "sub-1",
    "phase": "05-implement",
    "node": "tdd-implementation"
  }
}
```

**字段读写分配**：

| 字段 | 写入工具 | 读取工具 |
|------|---------|---------|
| `status` | opc_flow_start/opc_flow_abort/opc_quick_dispatch/opc_intent_complete(终结分支) | opc_flow_query, 所有流程工具的前置校验 |
| `owner` | opc_flow_start/opc_flow_recover | opc_flow_query, 所有流程工具的 pid 校验 |
| `current_step` | 所有非入口流程工具 + 阶段层工具 | opc_flow_query, 所有流程工具的 expected_steps 校验 |
| `user_message_history` | opc_flow_start/opc_flow_restart (additional_input) | opc_flow_query, opc_task_analysis_complete |
| `accumulated.intent` | opc_intent_complete | 推进类工具, opc_flow_revise |
| `accumulated.analysis_result` | opc_task_analysis_complete | opc_decomposition_complete, opc_brief_complete, opc_flow_revise, opc_flow_restart |
| `accumulated.*_evidence_ref` | 对应 `opc_*_complete` 工具，指向 reflection-server 日志行 | opc_flow_query, opc_reflect_explain |
| `accumulated.decomposition_result` | opc_decomposition_complete | opc_brief_complete |
| `accumulated.brief_content` | opc_brief_complete | opc_brief_complete (推导 pipeline_create args) |
| `history` | 所有流程工具（追加） | opc_flow_query (摘要展示) |
| `reflection_log` | opc_flow_reflect / opc_reflect_*_complete（写入 evidence_diff + validator_result） | opc_flow_query, opc_task_analysis_complete, opc_reflect_explain |
| `pipeline_id` | opc_brief_complete (调 opc_pipeline_create 后)、阶段层工具 | opc_flow_query, opc_flow_abort/opc_flow_recover |
| `current_pipeline_pointer` | `opc_phase_start` / `opc_phase_confirm` / `opc_node_start` / `opc_node_complete` / `opc_phase_complete` | opc_flow_query, opc_flow_recover |

阶段/节点层工具不属于流程层，但每次调用都会更新 `current_pipeline_pointer` + `last_heartbeat_at`，确保 crash 后 opc_flow_recover 能从精确位置恢复。

> **evidence_ref vs confidence**：本 schema 不存 `confidence: number` 字段。所有 step 的「质量判定」由 reflection-server 的 evidence artifact + V1-V5 validator 决定，flow-state.json 仅保留指向 `opc-logs/reflection/<pipeline_id>/<step>.jsonl` 的引用（`*_evidence_ref`）。reflection_log[].evidence_diff 记录每轮反思后 artifact 的字段变化，供 `opc_reflect_explain` 还原 reasoning_trace。详见 [05-opc-reflection-server/02-server-design/00_overview.md §二 Evidence Schema](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)。

---

