# 流程工具

> 本文档是 [02-1 意图分析总览](../02-1_intent-analysis.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [意图识别](03_intent-recognition.md) · [任务分析](04_task-analysis.md) · [任务拆分](05_task-decomposition.md) · [工作单生成](06_brief-generation.md) · [管线创建与阶段执行](07_pipeline-creation.md) · [flow-state schema](08_flow-state-schema.md) · [完整流程示例](09_complete-example.md)

---

## 三、流程工具

13 个流程层工具。本节是工具规范的**唯一真相源**——其他文档只通过锚点链接引用，不再复述。

**工具速览**（按职责分组，详细规范见下方各小节锚点）：

| 类别 | 工具 | 一句话职责 |
|------|------|----------|
| 入口 | [`opc_flow_query`](#opc_flow_query) | 流程入口：返回快照 + methodology + 9 种 suggested_actions |
| 启动 | [`opc_flow_start`](#opc_flow_start) | 启动新流程；含 pid + status 防御 |
| 推进 | [`opc_intent_complete`](#opc_intent_complete) | 按 intent 路由：task → 分析；question/chat → 流程内部自动 complete |
| 推进 | [`opc_task_analysis_complete`](#opc_task_analysis_complete) | 按 confidence + complexity + modify_unit_count 三路分流 |
| 推进 | [`opc_decomposition_complete`](#opc_decomposition_complete) | 按 decomposition_confidence 路由：高 → 简报；低 → 反思 |
| 推进 | [`opc_brief_complete`](#opc_brief_complete) | 从 accumulated 推导 args，返回 next: opc_pipeline_create |
| 反思 | [`opc_flow_reflect`](#opc_flow_reflect) | 持久化反思日志（按 step_id 分流到会话级或管线级） |
| 纠错 | [`opc_flow_revise`](#opc_flow_revise) | 局部修订 accumulated 字段，自动判定是否回溯 |
| 纠错 | [`opc_flow_restart`](#opc_flow_restart) | 从指定步骤重做，保留前置 accumulated，可附补充输入 |
| 终结 | [`opc_flow_abort`](#opc_flow_abort) | 终止流程；已创建 pipeline 时级联 opc_pipeline_abort |
| 恢复 | [`opc_flow_recover`](#opc_flow_recover) | 恢复孤儿流程：pid 接管 + 超时 in_progress node 标记 failed |
| 快速 | [`opc_quick_dispatch`](#opc_quick_dispatch) | low 复杂度快速通道：返回 agent_hint + knowledge_context，流程自动 complete |

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
    "docs": ["platform/mcp/opc-state-server/prompts/intent-analysis.md"],
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
    "docs": ["prompts/intent-analysis.md"],
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

### opc_intent_complete

**职责**：按 intent + confidence 路由到下一步；question/chat 时内部自动标记流程终结。

**输入**：`{intent, confidence, reasoning}`

**路由表**：

| 入参 intent | confidence | 返回的 next | 流程终结 |
|------------|-----------|------------|---------|
| `task` | ≥ 0.5 | `{tool: "opc_task_analysis_complete"}` + prerequisites:[opc_knowledge_list] | 否 |
| `task` | < 0.5 | `{action: "ask_user"}` + step_instruction: "向用户确认意图" | 否 |
| `project_question` | ≥ 0.5 | `{action: "respond_with_knowledge"}` + prerequisites:[opc_knowledge_search] | **是**（内部自动标记 flow-state.status=completed） |
| `general_question` / `chat` | 任意 | `{done: true, action: "respond_normally"}` | **是**（同上） |

---

### opc_task_analysis_complete

**职责**：按 confidence + complexity + modify_unit_count 三路分流到反思 / 拆分 / 简报 / 快速通道。

**输入**：`{analysis_result, analysis_confidence, confidence_detail}`，其中 `analysis_result.knowledge_plan: [{path, operation: "create"|"update"|"read"}]`。

**路由逻辑**：

```
输入: analysis_result + analysis_confidence + confidence_detail
  ↓
计算 modify_unit_count = count(distinct unit) where:
    unit = knowledge_plan[i].path.split("/")[0]
    knowledge_plan[i].operation ∈ ["create", "update"]
  (按 unit 去重，多个 subsection 在同一 unit 只算 1)
  ↓
分支 1: 置信度判定
  ├── ≥ 0.8 → 跳过反思 → 进入分支 2
  ├── 0.5-0.8 → 返回 opc_flow_reflect 指令（最多 2 轮）
  └── < 0.5 → 返回 opc_flow_reflect 指令（最多 3 轮）

分支 2: 复杂度/拆分判定（仅高置信度或反思后到达）
  ├── complexity = low → 返回 opc_quick_dispatch 指令（处理后流程自动 complete）
  ├── modify_unit_count ≥ 2 → 返回 task_decomposition 指令
  └── modify_unit_count ≤ 1 → 返回 brief_generation 指令
```

---

### opc_decomposition_complete

**职责**：按 decomposition_confidence 路由：高置信度 → 简报；低 → 反思。

**输入**：`{sub_pipelines, execution_order, decomposition_confidence, confidence_detail}`

**路由表**：

| decomposition_confidence | 返回的 next | step_instruction |
|------|--------|--------|
| ≥ 0.8 | brief_generation | "拆分结果已自动确认，开始生成 brief" |
| 0.5-0.8 | brief_generation | "拆分结果置信度中等，展示方案后开始生成 brief" |
| < 0.5 | ask_user 或 reflect | "拆分置信度低，请用户确认或进入反思" |

---

### opc_brief_complete

**职责**：从 `flow-state.json.accumulated` 推导 `opc_pipeline_create` 全部参数，返回预填的下一步指令。

**输入**：`{brief_content: string}`

**推导规则**：

```
· description, tags, complexity, knowledge_unit, suggested_phases, scenario
    ← 取自 accumulated.analysis_result
· brief_content
    ← 当前调用入参
· sub_pipelines:
    有 decomposition_result → 用 decomposition.sub_pipelines
    无 → [{id: "sub-1", title: <description 截短>,
            knowledge_unit: analysis.knowledge_unit, blocked_by: []}]
· execution_order:
    有 decomposition → 用 decomposition.execution_order
    无 → [{group: 1, parallel: ["sub-1"]}]
```

**返回示例**：

```json
{
  "step": "brief_completed",
  "step_instruction": "Brief 已生成。下一步创建管线，参数已预填，直接调用 next.tool。",
  "next": {
    "tool": "opc_pipeline_create",
    "args": {
      "description": "实现用户认证系统",
      "complexity": "medium",
      "knowledge_unit": ["user-auth"],
      "sub_pipelines": [{"id": "sub-1", "knowledge_unit": ["user-auth"], "blocked_by": []}],
      "execution_order": [{"group": 1, "parallel": ["sub-1"]}],
      "brief_content": "<上一步收到的 brief 全文>"
    }
  },
  "flow_state_path": ".opc/sessions/sess-abc/flow-state.json"
}
```

---

### opc_flow_reflect

**职责**：持久化反思日志，按 step_id 分流到会话级或管线级存储。

**输入**：`{step_id, round, revised_result, new_confidence, notes, pipeline_id?, sub_pipeline_id?, phase?}`

**行为**：

```
按 step_id 分流持久化:
  ├── step_id = "task_analysis"  → 写入 flow-state.json.reflection_log[]
  │     · round 字段忽略入参，按 reflection_log.length 推导（幂等：重复提交同 round 覆盖最后一条）
  │     · 不需要 pipeline_id / sub_pipeline_id / phase
  └── step_id = "node_selection" → 必须带 pipeline_id + sub_pipeline_id + phase
        · 写入 state.json.phases[].reflection_log[]
        · 同时在 flow-state.json 留指针 { pipeline_id, sub, phase, log_entry_id }
  ↓
判定:
  ├── new_confidence ≥ 阈值（task 用 0.8；node 用 phase.min_confidence_for_auto）→ 跳出反思
  ├── round 达上限 → 强制确认（返回 ask_user）
  └── 继续反思 → 返回下一轮反思指令（按视角切换）
```

**反思日志位置分流原因**：
- 任务分析反思是会话级一次性事件，存 flow-state.json
- 节点选择反思可发生在多个 phase，存 state.json 才能随 phase_reset 回退

---

### opc_flow_revise

**职责**：局部修订 accumulated 字段，自动判定是否需要回溯到对应步骤重做。

**输入**：`{field, value}`

**行为**：

```
opc_flow_revise({field, value})
  → 校验 active=true 且 current_step ∈ [可修订步骤]
  → 修改 flow-state.json.accumulated[field] = value
  → 判定是否需要回溯：
      · complexity / suggested_phases 改动 → 自动重新进入 brief_generation 步骤
      · scenario / tags 改动 → 仅记录，不回溯（影响后续 phase_start 的 scenario 推荐）
      · knowledge_unit 改动 → 强制回到 task_analysis 重做（影响 unit modify_count）
  → 返回 { revised_field, retroactive_step?: <要回到的步骤>, next: {...} }
```

---

### opc_flow_restart

**职责**：从指定步骤重做，保留前置 accumulated 字段，可附加补充输入。

**输入**：`{from_step, additional_input?: string}`

**行为**：

```
opc_flow_restart({from_step, additional_input?})
  → 校验 active=true 且 from_step ∈ ["intent_analysis", "task_analysis",
                                      "task_decomposition", "brief_generation"]
  → 回退 flow-state.json:
      · current_step = from_step
      · accumulated 中保留 < from_step 的字段，清除 ≥ from_step 的字段
      · 把 additional_input（如有）追加到 user_message_history
  → 返回该步骤的指令（含 methodology + schema + next）
  → 反思日志保留作为审计（不清除）
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

### opc_quick_dispatch

**职责**：low 复杂度快速通道：返回 agent_hint + knowledge_context，流程自动 complete。

**输入**：`{description, tags, knowledge_unit}`

**行为**：

```
opc_quick_dispatch({description, tags, knowledge_unit})
  → 扫描已安装 kit 的 plugin.json capabilities → tags 匹配最佳 agent
  → 读 opc-knowledge/<unit>/ 结构 → 拼 knowledge_context（仅结构 + version，不读 .md 内容）
  → 写 .opc/quick-history.jsonl 追加一条 {timestamp, description, agent, units}
  → 写 flow-state.json.status = completed（low 流程不创建 pipeline 直接终结）
  → 返回:
    {
      step: "quick_dispatch",
      agent_hint: "frontend-engineer",
      knowledge_context: { units: {"user-auth": {login: {ui: {version: 1}}}} },
      step_instruction: "Task spawn 该 agent，传入 description + knowledge_context；agent 自行决定读哪些知识 + 直接改文件",
      dispatch_context: {
        instruction_template: "你是 <agent>，执行轻量任务：<description>。已有知识结构：<knowledge_context>。直接修改文件，无需调任何 opc_* 工具。"
      }
    }
```

---

### 工具调用前置校验

每个流程工具调用前都强制校验 `flow-state.json.current_step` 是否匹配预期，避免 Claude 乱序调用：

```
任意流程工具调用:
  → 读 flow-state.json
  → 校验 owner.pid == 当前 pid（防跨 session 误操作）
  → 校验 current_step ∈ expected_steps（该工具允许的前置步骤集）
    若否 → 返回:
      {
        error: "flow_state_mismatch",
        expected_step: ["..."],
        actual_step: "...",
        suggested_action: "调 opc_flow_query 查看当前位置"
      }
  → 更新 last_heartbeat_at
  → 正常处理
```

每个工具的 `expected_steps` 见 `prompts/state-machine.md`（路由表实现规范）。
