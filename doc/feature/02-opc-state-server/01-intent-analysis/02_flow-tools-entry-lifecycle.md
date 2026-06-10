# 流程工具 · 入口与生命周期

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 流程工具总览（M17.g 后 7 工具）

按 [07-tool-consolidation §2.1](../../07-tool-consolidation/00_overview.md#21-合并映射表54--28) 的 discriminator 模式，原 14 个 `opc_flow_*` / `opc_*_complete` 已合并为 **7 个工具**——本系列是工具规范的唯一真相源，其他文档只通过锚点链接引用。

| 工具 | discriminator | 一句话职责 | 详见 |
|---|---|---|---|
| `opc_flow_query` | —（保留） | hook 引导的统一入口；返回快照 + methodology + 9 种 suggested_actions | [本篇](#opc_flow_query) |
| `opc_flow_lifecycle` | `action: "start"\|"abort"\|"recover"` | 流程生命周期（启动/终结/恢复孤儿），自动级联 pipeline | [本篇](#opc_flow_lifecycle) |
| `opc_flow_step_complete` | `step: "intent_analysis"\|"task_analysis"\|"task_decomposition"\|"brief_generation"` | 提交分析步骤产出，按 V1-V5 + meta-validator 路由 | [步骤路由篇](03_flow-tools-step-routing.md#opc_flow_step_complete) |
| `opc_flow_reflect` | —（保留，registry-guard 锚点） | 登记 reflection artifact，按 verdict 决定 flow_next | [步骤路由篇](03_flow-tools-step-routing.md#opc_flow_reflect) |
| `opc_flow_user_reply` | —（保留，A3 闭环锚点） | ask_user 回灌唯一登记口 | [步骤路由篇](03_flow-tools-step-routing.md#opc_flow_user_reply) |
| `opc_quick_dispatch` | —（保留，low 通道独立语义） | low 复杂度快速通道：agent_hint + knowledge_context | [步骤路由篇](03_flow-tools-step-routing.md#opc_quick_dispatch) |
| `opc_flow_correct` | `action: "revise"\|"restart"\|"phase_reset"` | 用户主动纠错通道（豁免所有 guard，含吸收的 phase_reset） | [修订与纠错篇](04_flow-tools-revise-restart.md#opc_flow_correct) |

> Deprecated 别名（旧工具名 → 新 `(tool, discriminator)` 对）由 M19 wire 层透明转发，期间 server 同时响应新旧两套调用并 warn 一次。映射表见 [07-tool-consolidation §2.1](../../07-tool-consolidation/00_overview.md#21-合并映射表54--28)；运行期数据见 [`@opc/tool-aliases`](../../../shared/tool-aliases)。

本篇覆盖 **入口（`opc_flow_query`）+ 生命周期（`opc_flow_lifecycle`）** 2 个工具。

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
  "step_instruction": "判断用户最近一条消息的意图。若是开发任务 → opc_flow_lifecycle({action:'start'})；若是项目问答 → opc_knowledge_read({mode:'search'})；若是闲聊/纯知识 → 直接回答。",
  "methodology": {
    "docs": ["platform/mcp/opc-state-server/prompts/01_intent-analysis-overview.md"],
    "ref": "三 意图分类 + 3.1 task 信号 + 3.2 project vs general 信号",
    "summary": "4 种意图：task/project_question/general_question/chat。动作动词+0.3、明确交付物+0.2、!task 前缀+1.0、疑问词-0.3"
  },
  "suggested_actions": [
    {"intent": "task", "next": {"tool": "opc_flow_lifecycle", "args": {"action": "start", "user_message": "<最近一条用户消息原文>"}}},
    {"intent": "project_question", "next": {"tool": "opc_knowledge_read", "args": {"mode": "search"}}},
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
    "ref": "一 九种延续模式 + 二 各模式触发信号 + 四 多重意图处理",
    "summary": "延续/纠正/补充/回退/废弃阶段/放弃/暂停/无关/恢复"
  },
  "suggested_actions": [
    {"intent": "继续推进", "signals": ["继续", "嗯", "就这样"], "next": {"action": "按上次 flow_next 推进"}},
    {"intent": "修改累积参数", "signals": ["complexity 应该是 high", "加 03-design 阶段"], "next": {"tool": "opc_flow_correct", "args": {"action": "revise"}}},
    {"intent": "补充任务范围", "signals": ["还要加 X 功能", "再加上 Y"], "next": {"tool": "opc_flow_correct", "args": {"action": "restart", "from_step": "task_analysis"}}},
    {"intent": "管线内增删节点/阶段", "signals": ["记得加上安全审计", "加个 X 节点"], "next": {"tool": "opc_pipeline_lifecycle", "args": {"action": "replan"}}},
    {"intent": "重做某分析步骤", "signals": ["重新分析", "重做拆分"], "next": {"tool": "opc_flow_correct", "args": {"action": "restart"}}},
    {"intent": "废弃某阶段产出", "signals": ["api 设计有问题，回到 04 重新规划"], "next": {"tool": "opc_flow_correct", "args": {"action": "phase_reset"}}},
    {"intent": "彻底放弃换任务", "signals": ["算了，先做别的"], "next": {"tools": [{"tool": "opc_flow_lifecycle", "args": {"action": "abort"}}, {"tool": "opc_flow_lifecycle", "args": {"action": "start"}}]}},
    {"intent": "暂停等待", "signals": ["等一下", "先停一下"], "next": {"action": "不调任何工具，等用户进一步指令"}},
    {"intent": "流程外问答", "signals": ["现在几点", "刚才设计了几个端点", "现在在哪一步", "顺便问一下…"], "next": {"action": "respond_outside_flow", "preserve_state": true}}
  ],
  "orphan_pipelines": []
}
```

#### `respond_outside_flow` 语义说明

**触发场景**：管线正在执行（`active=true`），但用户随手问了一个与当前任务无关的问题（闲聊、问当前进度、问知识库内容、问时间等）。Hook 每次都注入"先调 `opc_flow_query`"，所以即便这种问题也会进入 `opc_flow_query`，需要一条明确的"什么都不做"出口。

**Claude 行为**：
- **不调任何 `opc_flow_*` / `opc_pipeline_*` 推进类工具**（不写 flow-state.json，不改 pipeline 状态）
- 如果是项目知识问答 → 允许调 `opc_knowledge_read({mode:"search"})` / `opc_knowledge_read({mode:"single"})`（只读）后回答
- 如果是纯闲聊或与项目无关 → 直接回复
- 回复完即可，**`current_step` / `current_pipeline_pointer` 保持不变**，下次用户继续推进时仍能从原位接上

**与其他 action 的区别**：

| Action | 是否动 flow-state | 是否动 pipeline | 用途 |
|---|---|---|---|
| `respond_normally`（形态 A） | 否 | 否（无 active 流程） | **无活跃流程**下的闲聊/纯知识问答 |
| `respond_outside_flow`（形态 B） | 否（preserve_state=true） | 否 | **有活跃流程**时的题外话，不打断流程 |
| 暂停等待 | 否 | 否 | 用户明确要求停一下，下一次输入再决定 |
| 修改累积参数 | 是（`opc_flow_correct({action: "revise"})`） | 视情况 | 用户在修正之前的分析结果 |

**判定指引**：Claude 在 `opc_flow_query` 返回 `active=true` 后，**先把新消息与 `snapshot.user_message_history` / `current_step` 做语义关联**：
- 关联度高（延续/纠正/补充/回退当前任务） → 走对应推进/纠错 action
- 关联度低（题外话/打断/无关问答） → 走 `respond_outside_flow`
- 完全无法判断 → 走"暂停等待"，不动状态，反问用户

> **设计原则**：宁可让 Claude 在题外话时多花一次 `opc_flow_query` 调用，也不在 Hook 里做意图判断。`respond_outside_flow` 是 Hook 极简化的必要补丁。

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
    "ref": "二 恢复策略 + 三 超时检测",
    "summary": "in_progress + 超时 → 自动标记 failed；恢复后可调 node_retry 重跑"
  },
  "suggested_actions": [
    {"intent": "恢复流程", "next": {"tool": "opc_flow_lifecycle", "args": {"action": "recover"}}},
    {"intent": "放弃并开新流程", "next": {"tools": [{"tool": "opc_flow_lifecycle", "args": {"action": "abort"}}, {"tool": "opc_flow_lifecycle", "args": {"action": "start"}}]}}
  ],
  "orphan_pipelines": [
    {"id": "pipeline-20260608-001", "last_active": "...", "suggest": {"tool": "opc_flow_lifecycle", "args": {"action": "recover"}}}
  ]
}
```

---

### opc_flow_lifecycle

**职责**：流程生命周期合并工具（start / abort / recover），通过 `action` discriminator 分流。原 `opc_flow_lifecycle({action:"start"})` / `opc_flow_lifecycle({action:"abort"})` / `opc_flow_lifecycle({action:"recover"})` / `opc_flow_lifecycle({action:"recover"})` 全部并入本工具。

**Schema**：

```typescript
{
  name: "opc_flow_lifecycle",
  description: "流程生命周期。action=start 启动新流程（user_message 必填，可 force 抢占活跃 owner）；action=abort 终结当前流程并自动级联 pipeline_abort；action=recover 接管 owner.pid 已死的孤儿流程，超时 in_progress node 自动标记 failed。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: { action: { enum: ["start", "abort", "recover"] } },
    oneOf: [
      { properties: { action: {const: "start"}, user_message: {type: "string"}, force: {type: "boolean"} }, required: ["user_message"] },
      { properties: { action: {const: "abort"}, reason: {type: "string"} } },
      { properties: { action: {const: "recover"} } }
    ]
  }
}
```

#### action=start

**输入**：`{action: "start", user_message: string, force?: boolean}`

**行为**：

```
读 .opc/sessions/<id>/flow-state.json
  ├── 不存在 / status != in_progress → 正常启动：
  │     · 写 owner = {pid: <当前 pid>, started_at, last_heartbeat_at}
  │     · 写 status = in_progress
  │     · 返回 intent_analysis 指令 + methodology
  ├── status = in_progress + owner.pid 已死（孤儿）→ 自动接管，正常启动
  ├── status = in_progress + owner.pid 还活着 + force=true → 内部先 lifecycle(abort)，再启动
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
  "step_instruction": "判断用户意图，输出 {intent, intent_evidence, reasoning}（intent_evidence 收集 task_criteria_hits / chat_signals / user_quotes 供 P1 V1-V5 验证）。",
  "methodology": {
    "docs": ["prompts/01_intent-analysis-overview.md"],
    "ref": "三 意图分类 + 3.1 task 信号 + 3.2 project vs general 信号 + 05-opc-reflection-server 二 intent_evidence schema",
    "summary": "4 种意图：task/project_question/general_question/chat"
  },
  "schema": {
    "intent": {"enum": ["task", "project_question", "general_question", "chat"]},
    "intent_evidence": {"task_criteria_hits": "string[]", "chat_signals": "string[]", "user_quotes": "string[]"},
    "reasoning": "string"
  },
  "next": {"tool": "opc_flow_step_complete", "args": {"step": "intent_analysis"}},
  "flow_state_path": ".opc/sessions/sess-abc/flow-state.json"
}
```

#### action=abort

**输入**：`{action: "abort", reason?: string}`

**行为**：

```
opc_flow_lifecycle({action: "abort", reason?})
  → 写 flow-state.json.status = aborted + aborted_at + reason
  → 若 pipeline_id 已创建 → 自动级联 opc_pipeline_lifecycle({action: "abort"})（含 kill 正在跑的 sub-agent）
  → 释放 owner（pid 清零）
  → 返回 { aborted: true, freed_pipeline_id?: "..." }
```

#### action=recover

**输入**：`{action: "recover"}`

**行为**：

```
opc_flow_lifecycle({action: "recover"})
  → 读 flow-state.json
  → 校验 owner.pid 已死（否则拒绝）
  → 更新 owner.pid = <当前 pid>，刷新 last_heartbeat_at
  → 若 current_pipeline_pointer 非空 → 内部级联 pipeline 恢复逻辑（无需 Claude 再调一次）
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

> **`opc_flow_lifecycle({action:"recover"})` 已删除**：原 `opc_flow_lifecycle({action:"recover"})` 的语义被 `action: "recover"` 内部级联吸收。Claude 只需调一次 `opc_flow_lifecycle({action: "recover"})` 即可同时恢复 flow + pipeline 状态。豁免清单同 [§4.4](../../07-tool-consolidation/00_overview.md#44-豁免清单更新)：`action: "abort"` 全豁免（用户中断通道），`action: "start"` / `"recover"` 走标准 guard。

---

## 相关文档

- [03_flow-tools-step-routing.md](03_flow-tools-step-routing.md) — 步骤路由类工具（`opc_flow_step_complete` / `opc_flow_reflect` / `opc_flow_user_reply` / `opc_quick_dispatch`）
- [04_flow-tools-revise-restart.md](04_flow-tools-revise-restart.md) — `opc_flow_correct`（revise / restart / phase_reset）+ 前置校验
- [10_flow-state-schema.md](10_flow-state-schema.md) — flow-state.json 完整字段定义
- [07-tool-consolidation/00_overview.md](../../07-tool-consolidation/00_overview.md) — 54 → 28 工具合并规范（本文件遵循 §2.1 flow 段）
