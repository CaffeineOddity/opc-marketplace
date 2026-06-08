# 流程工具 · 入口与生命周期

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 流程工具总览

13 个 `opc_flow_*` 工具按职责分 3 篇，**本系列是工具规范的唯一真相源**——其他文档只通过锚点链接引用，不再复述。

| 类别 | 工具 | 详见 |
|------|------|------|
| 入口 | `opc_flow_query` | [本篇](#opc_flow_query) |
| 启动 | `opc_flow_start` | [本篇](#opc_flow_start) |
| 终结 | `opc_flow_abort` | [本篇](#opc_flow_abort) |
| 恢复 | `opc_flow_recover` | [本篇](#opc_flow_recover) |
| 推进 | `opc_intent_complete` | [步骤路由篇](03_flow-tools-step-routing.md#opc_intent_complete) |
| 推进 | `opc_task_analysis_complete` | [步骤路由篇](03_flow-tools-step-routing.md#opc_task_analysis_complete) |
| 推进 | `opc_decomposition_complete` | [步骤路由篇](03_flow-tools-step-routing.md#opc_decomposition_complete) |
| 推进 | `opc_brief_complete` | [步骤路由篇](03_flow-tools-step-routing.md#opc_brief_complete) |
| 反思 | `opc_flow_reflect` | [步骤路由篇](03_flow-tools-step-routing.md#opc_flow_reflect) |
| 快速 | `opc_quick_dispatch` | [步骤路由篇](03_flow-tools-step-routing.md#opc_quick_dispatch) |
| 纠错 | `opc_flow_revise` | [修订与重启篇](04_flow-tools-revise-restart.md#opc_flow_revise) |
| 纠错 | `opc_flow_restart` | [修订与重启篇](04_flow-tools-revise-restart.md#opc_flow_restart) |
| 校验 | 前置校验逻辑 | [修订与重启篇](04_flow-tools-revise-restart.md#工具调用前置校验) |

本篇覆盖 **入口（query）+ 生命周期（start / abort / recover）** 4 个工具。

---

### opc_flow_query

**职责**：hook 引导 Claude 调用的统一入口；返回当前流程状态快照（含 pid 校验）+ methodology + 9 种 suggested_actions。

**输入**：(无)

**返回**：三种形态。

**形态 A：无活跃流程**

```json
{
  "active": false,
  "session_id": "sess-abc-001",
  "step_instruction": "判断用户最近一条消息的意图。若是开发任务 → opc_flow_start；若是项目问答 → opc_knowledge_search；若是闲聊/纯知识 → 直接回答。",
  "methodology": {
    "docs": ["platform/mcp/opc-state-server/prompts/01_intent-analysis-overview.md"],
    "ref": "§三 意图分类 + §3.1 task 信号 + §3.2 project vs general 信号",
    "summary": "4 种意图：task/project_question/general_question/chat。动作动词+0.3、明确交付物+0.2、!task 前缀+1.0、疑问词-0.3"
  },
  "suggested_actions": [
    {"intent": "task", "next": {"tool": "opc_flow_start", "args": {"user_message": "<最近一条用户消息原文>"}}},
    {"intent": "project_question", "next": {"tool": "opc_knowledge_search"}},
    {"intent": "chat / general_question", "next": {"action": "respond_normally"}}
  ],
  "orphan_pipelines": []
}
```

**形态 B：有活跃流程**

```json
{
  "active": true,
  "session_id": "sess-abc-001",
  "owner": {"pid": 12345, "alive": true, "last_heartbeat_at": "..."},
  "snapshot": {
    "current_step": "phase_execution",
    "pipeline_id": "pipeline-20260608-001",
    "current_pipeline_pointer": {
      "sub_pipeline_id": "sub-1",
      "phase": "05-implement",
      "node": "tdd-implementation"
    },
    "user_message_history": ["实现用户认证系统"],
    "accumulated": {
      "complexity": "medium",
      "knowledge_unit": ["user-auth"],
      "suggested_phases": ["04-implement-design", "05-implement", "06-testing"]
    }
  },
  "step_instruction": "判断本次新消息是延续/纠正/补充/回退/废弃阶段/放弃/暂停/无关，选对应 suggested_action。多重意图按顺序处理（先 revise/restart，后推进）。",
  "methodology": {
    "docs": ["platform/mcp/opc-state-server/prompts/in-flow-decision.md"],
    "ref": "§一 九种延续模式 + §二 各模式触发信号 + §四 多重意图处理",
    "summary": "延续/纠正/补充/回退/废弃阶段/放弃/暂停/无关/恢复"
  },
  "suggested_actions": [
    {"intent": "继续推进", "signals": ["继续", "嗯", "就这样"], "next": {"action": "按上次 flow_next 推进"}},
    {"intent": "修改累积参数", "signals": ["complexity 应该是 high", "加 03-design 阶段"], "next": {"tool": "opc_flow_revise"}},
    {"intent": "补充任务范围", "signals": ["还要加 X 功能", "再加上 Y"], "next": {"tool": "opc_flow_restart", "args": {"from_step": "task_analysis"}}},
    {"intent": "管线内增删节点/阶段", "signals": ["记得加上安全审计", "加个 X 节点"], "next": {"tool": "opc_pipeline_replan"}},
    {"intent": "重做某分析步骤", "signals": ["重新分析", "重做拆分"], "next": {"tool": "opc_flow_restart"}},
    {"intent": "废弃某阶段产出", "signals": ["api 设计有问题，回到 04 重新规划"], "next": {"tool": "opc_phase_reset"}},
    {"intent": "彻底放弃换任务", "signals": ["算了，先做别的"], "next": {"tools": ["opc_flow_abort", "opc_flow_start"]}},
    {"intent": "暂停等待", "signals": ["等一下", "先停一下"], "next": {"action": "不调任何工具，等用户进一步指令"}},
    {"intent": "流程外问答", "signals": ["刚才设计了几个端点", "现在在哪一步"], "next": {"action": "直接回答，不动流程"}}
  ],
  "orphan_pipelines": []
}
```

**形态 C：有孤儿流程（owner.pid 已死）**

```json
{
  "active": true,
  "session_id": "sess-abc-001",
  "owner": {"pid": 12345, "alive": false},
  "orphan": true,
  "snapshot": {"current_step": "phase_execution", "...": "..."},
  "step_instruction": "上次 session crash 残留的流程。建议恢复或放弃。",
  "methodology": {
    "docs": ["platform/mcp/opc-state-server/prompts/recovery.md"],
    "ref": "§二 恢复策略 + §三 超时检测",
    "summary": "in_progress + 超时 → 自动标记 failed；恢复后可调 node_retry 重跑"
  },
  "suggested_actions": [
    {"intent": "恢复流程", "next": {"tool": "opc_flow_recover"}},
    {"intent": "放弃并开新流程", "next": {"tools": ["opc_flow_abort", "opc_flow_start"]}}
  ],
  "orphan_pipelines": [
    {"id": "pipeline-20260608-001", "last_active": "...", "suggest": "opc_pipeline_recover"}
  ]
}
```

---

### opc_flow_start

**职责**：启动新流程。内置 pid + status 防御，避免重复启动。

**输入**：`{user_message: string, force?: boolean}`

**行为**：

```
读 .opc/sessions/<id>/flow-state.json
  ├── 不存在 / status != in_progress → 正常启动：
  │     · 写 owner = {pid: <当前 pid>, started_at, last_heartbeat_at}
  │     · 写 status = in_progress
  │     · 返回 intent_analysis 指令 + methodology
  ├── status = in_progress + owner.pid 已死（孤儿）→ 自动接管，正常启动
  ├── status = in_progress + owner.pid 还活着 + force=true → 内部先 opc_flow_abort，再启动
  └── status = in_progress + owner.pid 还活着 + force≠true → 拒绝：
        {
          error: "active_flow_exists",
          owner_pid: 12345,
          current_step: "...",
          suggested: "调 opc_flow_query 查看快照；如确定要放弃当前流程，传 force:true"
        }
```

**正常启动返回**：

```json
{
  "step": "intent_analysis",
  "step_instruction": "判断用户意图，输出 {intent, confidence, reasoning}。",
  "methodology": {
    "docs": ["prompts/01_intent-analysis-overview.md"],
    "ref": "§三 意图分类 + §3.1 task 信号 + §3.2 project vs general 信号",
    "summary": "4 种意图：task/project_question/general_question/chat"
  },
  "schema": {
    "intent": {"enum": ["task", "project_question", "general_question", "chat"]},
    "confidence": "number 0-1",
    "reasoning": "string"
  },
  "next": {"tool": "opc_intent_complete"},
  "flow_state_path": ".opc/sessions/sess-abc/flow-state.json"
}
```

---

### opc_flow_abort

**职责**：终止当前流程；若已创建 pipeline 则自动级联 opc_pipeline_abort。

**输入**：`{reason?: string}`

**行为**：

```
opc_flow_abort({reason?})
  → 写 flow-state.json.status = aborted + aborted_at + reason
  → 若 pipeline_id 已创建 → 自动级联 opc_pipeline_abort（含 kill 正在跑的 sub-agent）
  → 释放 owner（pid 清零）
  → 返回 { aborted: true, freed_pipeline_id?: "..." }
```

---

### opc_flow_recover

**职责**：恢复孤儿流程：pid 接管 + 超时 in_progress node 自动标记 failed。

**输入**：(无)

**行为**：

```
opc_flow_recover()
  → 读 flow-state.json
  → 校验 owner.pid 已死（否则拒绝）
  → 更新 owner.pid = <当前 pid>，刷新 last_heartbeat_at
  → 若 current_pipeline_pointer 非空 → 调 opc_pipeline_recover(pipeline_id) 接管管线
      · 检测 in_progress node 超时（默认 30 min 无心跳）→ 自动标记 failed (error.type: timeout)
  → 返回:
    {
      recovered: true,
      resume_step: current_step,
      resume_pointer: current_pipeline_pointer,
      next: <按 current_step 给出续传指令>,
      recoverable_nodes: [{name, status, suggested_action}]
    }
```

---

## 相关文档

- [03_flow-tools-step-routing.md](03_flow-tools-step-routing.md) — 步骤路由类工具（intent / task_analysis / decomposition / brief / reflect / quick_dispatch）
- [04_flow-tools-revise-restart.md](04_flow-tools-revise-restart.md) — 修订/重启类工具 + 前置校验
- [10_flow-state-schema.md](10_flow-state-schema.md) — flow-state.json 完整字段定义
