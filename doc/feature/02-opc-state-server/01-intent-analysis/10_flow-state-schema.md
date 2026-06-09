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

  "pending_reflections": [
    {
      "reflection_id": "rfl-P5-r2-01HXYZ",
      "artifact_path": "opc-logs/reflection/sess-abc/rfl-P5-r2-01HXYZ.json",
      "step_id": "node_selection",
      "issued_by": "opc_reflect_critique_complete",
      "issued_at": "2026-06-09T10:30:00Z",
      "expires_at": "2026-06-09T11:00:00Z",
      "must_be_registered_by": "opc_flow_reflect",
      "pipeline_pointer_ref": {
        "pipeline_id": "pipeline-20260608-001",
        "sub_pipeline_id": "sub-1",
        "phase": "05-implement"
      }
    }
  ],

  "pending_user_question": {
    "question_id": "uq-P2-r3-01HXY9",
    "step_id": "task_analysis",
    "round": 2,
    "asked_at": "2026-06-09T10:45:00Z",
    "expires_at": "2026-06-09T11:15:00Z",
    "must_be_resolved_by": "opc_flow_user_reply",
    "reasoning_trace": [
      "2 轮反思发现 complexity 评估偏低（schema 变更未列入 dependencies）",
      "knowledge_plan 缺 user-auth/audit unit"
    ],
    "kept_objections": [
      {"id": "obj-1", "text": "complexity 应升级 medium → high", "evidence_ref": "..."},
      {"id": "obj-2", "text": "knowledge_plan 缺 audit unit", "evidence_ref": "..."}
    ],
    "context_artifacts": [
      "opc-logs/reflection/sess-abc/rfl-P2-r1-01HXY7.json",
      "opc-logs/reflection/sess-abc/rfl-P2-r2-01HXY8.json"
    ],
    "pipeline_pointer_ref": null
  },

  "user_interventions": [
    {
      "intervention_id": "intv-01HXY9",
      "trigger": "ask_user_rounds_exceeded",
      "step_id": "task_analysis",
      "question_id": "uq-P2-r3-01HXY9",
      "user_reply": "complexity 改 high，加 audit unit",
      "resolution": {
        "accumulated_patch": {"complexity": "high", "knowledge_unit": ["user-auth", "audit"]},
        "objections_resolved": ["obj-1", "obj-2"],
        "objections_dismissed": [],
        "notes": null
      },
      "linked_reflection_artifacts": [
        "opc-logs/reflection/sess-abc/rfl-P2-r1-01HXY7.json",
        "opc-logs/reflection/sess-abc/rfl-P2-r2-01HXY8.json"
      ],
      "at": "2026-06-09T10:46:00Z"
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
| `pending_reflections` | opc_flow_reflect (登记/移除)；reflection-server 通过 `opc_reflect_*_complete` 返回值带入后由 state-server 写入 | 所有受 reflection-registry-guard 保护的写工具（[完整清单见 06_call-sequence-contract.md 七 防御 3](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#受-reflection-registry-guard-保护的工具清单唯一真相源)）；opc_flow_query（清理过期） |
| `pending_user_question` | opc_flow_reflect (rounds_exceeded 时写入)；opc_flow_user_reply (回灌后清空 null)；opc_flow_query (清理过期) | 所有受 pending-question-guard 保护的写工具（与 reflection-registry-guard 同清单，详见 06 八·补）|
| `user_interventions` | opc_flow_user_reply（A3 闭环写入，trigger=ask_user_rounds_exceeded）；opc_flow_revise / opc_flow_restart / opc_phase_reset（用户主动纠错时写入对应 trigger） | opc_reflect_record_interventions（pipeline_complete 时 distiller 读取提炼到 L2 corrections） |
| `pipeline_id` | opc_brief_complete (调 opc_pipeline_create 后)、阶段层工具 | opc_flow_query, opc_flow_abort/opc_flow_recover |
| `current_pipeline_pointer` | `opc_phase_start` / `opc_phase_confirm` / `opc_node_start` / `opc_node_complete` / `opc_phase_complete` | opc_flow_query, opc_flow_recover |

阶段/节点层工具不属于流程层，但每次调用都会更新 `current_pipeline_pointer` + `last_heartbeat_at`，确保 crash 后 opc_flow_recover 能从精确位置恢复。

> **evidence_ref vs confidence**：本 schema 不存 `confidence: number` 字段。所有 step 的「质量判定」由 reflection-server 的 evidence artifact + V1-V5 validator 决定，flow-state.json 仅保留指向 `opc-logs/reflection/<pipeline_id>/<step>.jsonl` 的引用（`*_evidence_ref`）。reflection_log[].evidence_diff 记录每轮反思后 artifact 的字段变化，供 `opc_reflect_explain` 还原 reasoning_trace。详见 [05-opc-reflection-server/02-server-design/00_overview.md 二 Evidence Schema](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)。

> **pending_reflections 说明**：本字段记录 reflection-server 已写盘但未登记的反思记录。`opc_reflect_*_complete` 内部写盘 artifact 后返回 `pending_reflection { reflection_id, artifact_path, ... }`，state-server 将其写入 `pending_reflections[]`。`opc_flow_reflect({reflection_id})` 成功登记后移除。受 reflection-registry-guard 保护的写工具调用时检测到 `pending_reflections` 非空则拒绝执行——**完整命名约定 / 不变量 / 清单 / 契约见** [05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md)（特别注意 hard invariant：`pending_reflections.length ≤ 1`）。

> **pending_user_question 说明**（A3 闭环）：本字段记录 state-server 在反思 rounds 耗尽时主动向用户发起的提问。`opc_flow_reflect` 检测到 `verdict=rounds_exceeded` 时写入 `pending_user_question` 并返回 `flow_next: ask_user`。Claude 把 `reasoning_trace + kept_objections` 渲染给用户、收集答复、转译为 `resolution`，调用 `opc_flow_user_reply({question_id, user_reply, resolution})` 登记。受 pending-question-guard 保护的写工具调用时检测到 `pending_user_question` 非空则拒绝执行。**完整命名 / 5 步闭环 / 不变量 / 路由表见** [06_call-sequence-contract.md 八·补 ask_user 回灌闭环](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#八补-ask_user-回灌闭环a3-契约)（特别注意 hard invariant：`pending_user_question` 任何时刻最多 1 个）。

> **user_interventions 说明**：用户对流程的所有显式介入流水（L1 层），pipeline_complete 时由 `opc_reflect_record_interventions` 派 distiller sub-agent 提炼到 L2 corrections。两类 trigger：`ask_user_rounds_exceeded`（state-server 主动询问后用户回灌，带 `linked_reflection_artifacts` 上下文）/ `user_initiated`（用户主动调 revise / restart / replan / phase_reset 纠错）。distiller 优先处理前者——上下文更丰富，提炼成 corrections 后命中率更高。

---

