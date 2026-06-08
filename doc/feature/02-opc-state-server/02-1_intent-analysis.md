# 02-1 意图识别与任务分析

不设 `/opc` 入口命令。自然语言就是入口。UserPromptSubmit hook 注入一条极简指令，引导 Claude 调用 `opc_flow_start` 启动**流程状态机**。后续每一步都由 MCP 工具返回 `next` 字段驱动，pipeline 文档作为**方法论参考**按需读取。

---

## 一、触发机制

opc-orchestrator 插件通过 `UserPromptSubmit` hook 注入一行**事实查询**指令——hook 不做语义判断，只让 Claude 知道"先查流程状态再决策"。所有判断逻辑由 Claude 完成，所有事实查询由 `opc_flow_query` 工具完成（含 pid 存活校验）。

```json
// opc-orchestrator/.claude-plugin/plugin.json
{
  "name": "opc-orchestrator",
  "depends": ["mcp"],
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "echo 'OPC: 先调 mcp__opc-state__opc_flow_query() 了解当前流程状态，再按返回的 suggested_actions 决定下一步（启动/延续/纠正/补充/回退/放弃/暂停/无关）。'"
        }]
      }
    ]
  }
}
```

### 1.1 设计原则

- **Hook 极简化**：永远只输出一行提示，不读文件、不拼快照、不做判断
- **事实查询统一入口**：`opc_flow_query` 是流程状态的唯一事实源，返回快照 + methodology + suggested_actions
- **决策权归 Claude**：query 提供候选清单，最终走哪条路由由 LLM 判断
- **工具内部强制校验**：`opc_flow_start` / `opc_flow_*` 都内置 pid + status 校验，即使 Claude 误判也能被工具拒绝
- **owner.pid 是真实状态判据**：与 `pipeline-plan.json` 的 owner 字段对齐，支持跨 session 孤儿检测

### 1.2 Session 启动

无需独立的 SessionStart hook。当用户首次发消息时，UserPromptSubmit hook 触发 `opc_flow_query`，query 会同时扫描 `.opc/pipelines/*/pipeline-plan.json` 找孤儿管线一并返回。

### 1.3 session_id 来源

`opc_flow_query` 与所有 flow 工具读写 `.opc/sessions/<session_id>/flow-state.json`，session_id 解析顺序：

1. 环境变量 `CLAUDE_SESSION_ID`（Claude Code 提供）
2. 否则用进程 PPID（在 Claude Code 内是 CLI 进程）
3. 都不可用 → 写入 `.opc/sessions/default/`

---

## 二、混合架构：MCP 流程状态机 + 文档方法论

### 2.1 双层职责

| 层 | 角色 | 内容 |
|----|------|------|
| **MCP 流程状态机** (opc-state-server) | 流程路由：告诉 Claude **当前做什么、下一步调什么工具** | 确定性 TS 代码，无 LLM |
| **Pipeline 文档** (`prompts/*.md`) | 方法论参考：解释**为什么这么分、阈值/维度/权重** | Markdown，AI 可解释性 |

Claude 在每一步：
- **必读**：MCP 工具返回里的 `step_instruction`（几十字，告诉做什么）+ `schema`（输出格式）
- **选读**：返回里的 `methodology.docs` + `methodology.ref` 指向的文档章节（复杂边界场景时查阅完整方法论）

### 2.2 工具返回值统一格式

```typescript
type FlowResponse = {
  step: string;                      // 当前所处步骤标识
  step_instruction: string;          // 一句话告诉 Claude 这一步做什么
  methodology?: {                    // 方法论参考（按需读取）
    docs: string[];                  //   文档路径
    ref: string;                     //   章节定位
    summary: string;                 //   一行摘要，足以应付简单场景
  };
  schema?: JSONSchema;               // Claude 输出的产出格式
  prerequisites?: Array<{            // 调 next 之前必须先调的工具
    tool: string;
    args?: object;
    why?: string;
  }>;
  next?: {                           // 下一步该调的工具
    tool: string;
    args?: object;                   //   预填参数
    when?: string;                   //   触发条件
  };
  done?: boolean;                    // 流程结束（chat / question 走这条）
  action?: string;                   // 终端动作（如 "respond_normally"）
  flow_state_path: string;           // 当前流程状态文件路径（可观测性）
};
```

### 2.3 文档归属

```
platform/mcp/opc-state-server/
├── server.ts
├── prompts/                        ← 方法论文档（MCP 在返回里引用路径，Claude 按需 Read）
│   ├── intent-analysis.md             无流程时的意图判断
│   ├── in-flow-decision.md            有活跃流程时的延续/纠正/补充判断
│   ├── task-analysis.md
│   ├── task-decomposition.md
│   ├── brief-generation.md
│   ├── phase-execution.md
│   ├── recovery.md                    孤儿流程恢复策略
│   ├── state-machine.md               每个 F 工具的 expected_steps 路由表
│   ├── reflection-task-analysis.md
│   └── reflection-node-selection.md
├── flow/                           ← 流程状态机
│   ├── flow-router.ts              ←   路由决策（按 confidence/intent/current_step 分支）
│   ├── flow-state-store.ts         ←   .opc/sessions/<id>/flow-state.json 读写 + pid 校验
│   └── owner-manager.ts            ←   owner pid 接管 + 心跳 + 孤儿检测
└── tools/
    ├── flow.ts                     ← 13 个流程工具
    ├── pipeline.ts
    ├── phase.ts
    └── node.ts
```

```
platform/opc-orchestrator/         ← 极简插件
├── .claude-plugin/plugin.json     ←   仅 UserPromptSubmit hook 配置
├── bin/opc-hook.sh                ←   hook 脚本（可选，简单场景直接用内联 echo）
└── scenarios/                     ←   场景配方（add-feature.md / fix-bug.md / ...）
```

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
## 四、意图识别（方法论：prompts/intent-analysis.md）

Claude 收到 opc_flow_query 返回后按方法论判断。四种意图：

| 意图 | 说明 | 行为 |
|------|------|------|
| `task` | 用户想完成具体的开发任务 | opc_intent_complete 路由到 task_analysis |
| `project_question` | 针对当前项目提问 | opc_intent_complete 路由到 knowledge_search + 回答 |
| `general_question` | 与项目无关的纯知识问答 | opc_flow_start done，Claude 直接回答 |
| `chat` | 闲聊 / 无技术内容 | opc_flow_start done |

### 4.1 task 信号（详见 prompts/intent-analysis.md §3.1）

| 信号 | 加权 |
|------|------|
| 包含动作动词（实现、修复、部署、重构） | +0.3 |
| 包含明确交付物（系统、功能、页面） | +0.2 |
| `!task` / `?` 显式前缀 | +1.0（直接确定） |
| 疑问词（怎么样、为什么、如何） | -0.3 |
| 简短无动词（"这个"、"帮忙"） | -0.2 |

### 4.2 project_question vs general_question

| 信号 | 偏向 |
|------|------|
| 提及项目中的具体文件、函数、模块名 | project_question |
| 使用"我们"、"这里的"、"这个项目"等指代词 | project_question |
| 引用 opc-knowledge/ 中的概念 | project_question |
| 通用技术概念，无项目指代 | general_question |
| 纯定义/解释类问题 | general_question |

---

## 五、置信度与纠错

### 5.1 置信度阈值（由 opc_intent_complete 路由层执行）

| 置信度 | 路由行为 |
|--------|---------|
| > 0.8 | 直接路由到对应分支 |
| 0.5 - 0.8 | 路由到对应分支，但 step_instruction 提示 Claude 向用户简短确认 |
| < 0.5 | opc_intent_complete 返回 `action: ask_user`，Claude 主动追问 |

### 5.2 纠错指令

| 纠错指令 | 效果 |
|----------|------|
| "不用启动管线" / "just answer" | Claude 调 `opc_flow_abort` → 普通问答 |
| "先不做了" / "cancel" | Claude 调 `opc_flow_abort`（已创建 pipeline 时自动级联 opc_pipeline_abort） |
| "这不是任务" / "not a task" | Claude 调 `opc_flow_abort({reason: "marked_as_question_sample"})` |
| "重新分析" | Claude 调 `opc_flow_restart({from_step: "task_analysis"})` |
| "改 complexity 为 high" | Claude 调 `opc_flow_revise({field: "complexity", value: "high"})` |
| "还要加 X 功能" | Claude 调 `opc_flow_restart({from_step: "task_analysis", additional_input: "X"})` |
| "回到分析重做拆分" | Claude 调 `opc_flow_restart({from_step: "task_decomposition"})` |
| "继续" / "嗯" | 按上次 flow_next 推进，不调任何 flow 工具 |

### 5.3 显式声明

| 前缀 | 效果 |
|------|------|
| `!task <描述>` | 强制作为任务执行（intent=task, confidence=1.0） |
| `? <问题>` | 强制作为问答处理（intent=question, confidence=1.0） |

---

## 六、任务分析（方法论：prompts/task-analysis.md）

仅 intent = task 时触发。opc_intent_complete 返回的 step_instruction 提示先调 `opc_knowledge_list`，然后按方法论执行 7 步分析，最后调 `opc_task_analysis_complete` 提交结果。

### 6.1 触发流程

```
opc_intent_complete opc_intent_complete({intent: "task", confidence: 0.85})
  ↓
返回:
{
  step: "task_analysis",
  step_instruction: "先调 opc_knowledge_list() 获取已有 unit，然后按方法论做 7 步分析。",
  methodology: {
    docs: ["prompts/task-analysis.md"],
    ref: "§6.2 分析步骤①-⑦ + §6.3 自省评估 5 维度",
    summary: "提炼描述→打标签→判复杂度→推荐阶段→提取知识→匹配 scenario→知识操作计划"
  },
  prerequisites: [
    {tool: "opc_knowledge_list", why: "获取已有 unit 上下文"}
  ],
  schema: { description, tags, complexity, suggested_phases, knowledge_unit,
            scenario, knowledge_plan, analysis_confidence, confidence_detail },
  next: {tool: "opc_task_analysis_complete"}
}
```

### 6.2 分析步骤（Claude 按方法论执行）

**① 提炼描述** — 将用户原始输入提炼为一句精确的任务描述。补全隐含信息，去掉无关修饰。

**② 打标签** — 从以下标签池中选择 2-4 个：

| 类别 | 可用标签 |
|------|---------|
| 技术栈 | backend, frontend, fullstack, mobile, desktop, infra |
| 领域 | auth, database, api, ui, payment, storage, security, messaging |
| 操作 | add-feature, fix-bug, refactor, optimize, migrate, configure |

**③ 判复杂度** — 两问法：

```
需要设计规划吗？
  → 不需要 → low
  → 需要 → 能一轮解决且不复杂吗？
    → 能 → medium
    → 不能 → high
```

| 复杂度 | 判定标准 | 典型场景 |
|--------|---------|---------|
| **low** | 不需要规划，简单修改即可完成 | 修样式、改文案、加日志、调配置 |
| **medium** | 需要规划，但一轮即可完成 | 新增功能、接入第三方服务 |
| **high** | 需要规划，且需多轮推进或复杂度高 | 重构核心模块、迁移数据库、改 API 协议 |

**④ 推荐阶段** — 根据任务性质选择必经阶段：

| 任务性质 | 推荐阶段 |
|---------|---------|
| 新功能 / Bug修复 / 重构 | 04-implement-design → 05-implement → 06-testing |
| 安全审计 | 06-testing（仅安全扫描节点） |
| 新项目 | 00-ideation → 03-design → 04-implement-design → 05-implement → 06-testing |

**⑤ 提取知识点** — 从任务描述中识别领域概念，输出为 unit 名称：

```
"实现用户认证系统"                           → ["user-auth"]
"实现支付和订阅功能"                         → ["payment", "subscription"]
"修复角色权限检查"                           → ["authorization"]
```

**⑥ 匹配 Scenario** — Claude 扫描 `scenarios/` 目录，选择最匹配的 1-2 个：

`add-feature` / `fix-bug` / `redesign-product` / `performance-optimize` / `security-audit` / `launch-product` / `incident-response`

**⑦ 生成知识操作计划** — 逐条知识路径标注操作类型（read / update / create）和当前状态。

### 6.3 complexity 分叉

| 维度 | low | medium | high |
|------|-----|--------|------|
| 执行路径 | 快速通道：opc_intent_complete 路由 `action: quick_dispatch`，无管线/无 phases/无 state | 完整管线 | 完整管线 |
| 反思轮次 | — | 2-3 | 3-5 |
| 阶段推进 | — | 高置信度自动 | 每阶段需确认 |
| brief | 不生成 | 标准版 | 详细版 |
| 节点选择 | — | 标准 tag+语义筛选 | 不可跳过匹配节点 |
| 知识读取 | Agent 自行决定 | 按 node input 加载 | 额外展开 _refs 关联 unit |
| 知识写入 | 通常不写 | 正常写入 | 更严格审查 |

### 6.4 自省评估

任务分析完成后，Claude **自省评估**分析质量，作为 `analysis_confidence` + `confidence_detail` 一并提交给 `opc_task_analysis_complete`。complexity 判断正确性尤其关键——它决定了后续管线的执行路径、反思轮次和推进策略。判错一级，整个流程行为全变。

**评估维度（Claude 自省打分）：**

| 维度 | 权重 | 0-0.4 (低) | 0.5-0.7 (中) | 0.8-1.0 (高) |
|------|------|-----------|-------------|------------|
| 描述精确度 | 0.25 | 描述与原始意图偏差大，遗漏关键信息 | 基本准确，个别隐含信息未补全 | 精确捕获用户意图，隐含信息已补全 |
| 复杂度确信度 | **0.30** | 两问法无清晰答案，边界模糊 | 倾向某个等级但存在摇摆 | 两问法答案明确，无争议 |
| 知识单元完整度 | 0.20 | 可能有遗漏或多余的 unit | 主要 unit 正确，个别存疑 | 全部 unit 准确，边界清晰 |
| 阶段推荐合理度 | 0.15 | 推荐阶段与任务性质不符 | 基本合理，个别阶段可增删 | 阶段选择完全匹配任务性质 |
| 场景匹配度 | 0.10 | scenario 与任务类型偏差大 | 匹配了近似 scenario | 最佳 scenario 命中 |

```
分析置信度 = 描述精确度×0.25 + 复杂度确信度×0.30
            + 知识单元完整度×0.20 + 阶段推荐合理度×0.15 + 场景匹配度×0.10
```

**复杂度确认为什么权重最高？** complexity 判错的影响：

```
用户说"重构 Session 模块，把 Cookie 改成 JWT"
  → 判为 medium → 标准管线，用户无感 → 阶段自动推进 → 做到一半发现影响面巨大
  → 判为 high   → 每阶段用户确认、更严格的知识读取、不可跳过节点
  → 判错一级 = 整条管线的反思深度和执行策略全错
```

**推进决策（由 opc_intent_complete + opc_brief_complete 协同执行）：**

```
Round 1: Claude 完成分析 → opc_task_analysis_complete(confidence)

if confidence ≥ 0.8:
    → opc_intent_complete 直接路由到 decomposition_or_brief（跳过反思）

elif confidence ≥ 0.5:
    → opc_intent_complete 返回反思指令（最多 2 轮，每轮换角度）
        Round 2: "反方视角" — 假设 complexity 判错一级会怎样？
        Round 3: "模式对照" — 与已知相似任务模式对比
      Claude 每轮调 opc_flow_reflect(round, new_confidence)
      opc_brief_complete 判定:
        new_confidence ≥ 0.8 → 路由到 decomposition_or_brief
        round 达上限 → 路由到 ask_user（快速确认）

else (confidence < 0.5):
    → opc_intent_complete 返回反思指令（最多 3 轮，深度审视）
        Round 2: "反方视角" — 逐项质疑 7 步分析每个结论
        Round 3: "缺口扫描" — 刻意寻找遗漏
        Round 4: 仍未改善则强制确认
      opc_brief_complete 判定同上，但低置信度走"详细确认"分支（ask_user 时附带逐维度低分原因）
```

| 初始置信度 | 反思轮次上限 | 反思后 ≥ 0.8 | 反思后 ≥ 0.5 | 反思后 < 0.5 |
|-----------|------------|-------------|-------------|-------------|
| ≥ 0.8 | 0 轮（跳过反思） | — | — | — |
| 0.5-0.8 | 最多 2 轮 | 自动推进 | 快速确认 | — |
| < 0.5 | 最多 3 轮 | 自动推进 | 快速确认 | 详细确认 |

**反思视角（每轮从不同角度审视，prompts/reflection-task-analysis.md 提供完整 prompt）：**

| 轮次 | 视角 | 核心问题 |
|------|------|---------|
| Round 1 | 常规分析 | 按 7 步标准流程分析 |
| Round 2 | 反方视角 | "如果我判错了会怎样？" — 假设 complexity 升/降一级、unit 多/少一个，结论是否仍然成立？ |
| Round 3 | 模式对照 | "这个任务像什么？" — 与 scenarios/ 中已知模式对比，与历史任务模式对比，验证一致性 |
| Round 4 | 最终裁决 | （仅初始 < 0.5 时触发）综合前三轮发现，给出最终判断并标注剩余不确定性 |

**反思收敛示例：**

```
任务: "优化数据库查询性能"
Round 1: complexity=medium, phases=[05,06], confidence=0.48
  → opc_task_analysis_complete(0.48) → opc_intent_complete 返回反思指令 round 1

Round 2 → 反方视角（Claude 收到 opc_intent_complete 的反思 prompt 后自行执行）:
  "假设 complexity 应该是 high，会怎样？"
  → 如果优化涉及索引重建 → 需要设计阶段(04) + 每阶段确认
  → 用户没说明范围，不能排除 high 的可能性
  → 复杂度确信度: 0.35 → 0.50（意识到不确定性后，更诚实的评分）
  → opc_flow_reflect(round=2, new_confidence=0.52)

Round 3 → 模式对照:
  → 阶段推荐: 缺 04 是风险点 → 0.45 → 0.55
  → opc_flow_reflect(round=3, new_confidence=0.55)
  → opc_brief_complete: round 达上限 → 路由到 ask_user（快速确认）

Claude 通知用户:
  "任务分析经 3 轮反思（置信度 0.48 → 0.55）:
   主要不确定点仍是复杂度——不确定是否涉及 schema 变更。
   当前按 medium 处理（05→06），如实际涉及 schema 变更请告知。"
```

**轮次上限配置：**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `max_analysis_reflection_rounds_normal` | 2 | 初始置信度 0.5-0.8 时的反思上限 |
| `max_analysis_reflection_rounds_low` | 3 | 初始置信度 < 0.5 时的反思上限 |
| 提前退出条件 | 置信度 ≥ 0.8 或 连续两轮无改善 | 避免无效循环，浪费 token |

**与节点选择反思的对比：**

| | 任务分析反思 | 节点选择反思 |
|---|---|---|
| 触发 | opc_task_analysis_complete 路由 → opc_flow_reflect 持久化 | opc_flow_reflect 持久化（在 phase_confirm 之前） |
| 轮次上限 | 2-3 轮 | 各 phase 不同（1-6 轮） |
| 反思内容 | 重新审视 7 步分析 | 自查缺漏/多余/合并拆分 |
| 调整方式 | 修正分析结论（如升级 complexity） | `opc_phase_adjust` 增删节点 |
| 为何轮次更少 | 7 个分析维度是离散决策 | 节点选择是组合优化，搜索空间更大 |

**自省报告格式（提交给 opc_task_analysis_complete）：**

```json
{
  "description": "实现用户认证系统（邮箱注册登录 + 会话管理）",
  "tags": ["backend", "auth", "database"],
  "complexity": "medium",
  "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
  "knowledge_unit": ["user-auth"],
  "scenario": "add-feature",
  "analysis_confidence": 0.88,
  "confidence_detail": {
    "description_precision": 0.9,
    "complexity_certainty": 0.85,
    "knowledge_unit_completeness": 0.9,
    "phase_recommendation": 0.85,
    "scenario_match": 0.9
  },
  "self_check_summary": "标准 add-feature 场景：新功能、单 domain、需要设计+实现+测试三阶段，复杂度无争议"
}
```

**低置信度示例（complexity 存疑）：**

```json
{
  "description": "优化数据库查询性能，可能涉及索引调整和查询重写",
  "complexity": "medium",
  "analysis_confidence": 0.52,
  "confidence_detail": {
    "description_precision": 0.7,
    "complexity_certainty": 0.35,
    "knowledge_unit_completeness": 0.6,
    "phase_recommendation": 0.45,
    "scenario_match": 0.6
  },
  "self_check_warning": "复杂度存疑：如果涉及 schema 变更或索引重建，应为 high；阶段推荐可能缺 04"
}
```

opc_intent_complete 收到后路由到反思（confidence < 0.8）→ Claude 进入反思循环。

**自动推进时（opc_intent_complete 路由不经过 ask_user）Claude 主动告知用户：**

> "任务分析完成（置信度 0.88）：
>  描述：实现用户认证系统（邮箱注册登录 + 会话管理）
>  复杂度：medium | 阶段：04→05→06 | 知识点：user-auth | 场景：add-feature
>  如需修正，回复'重新分析'或直接修改某项。"

**用户纠错指令：**

| 指令 | 效果 |
|------|------|
| "复杂度应该是 high" | Claude 调 `opc_flow_revise(field: "complexity", value: "high")` 重新推进 |
| "加上 03-design 阶段" | 同上，field: suggested_phases |
| "重新分析" / "重新评估" | Claude 调 `opc_flow_restart(from_step: "task_analysis")` |
| "就这样" / "继续" | Claude 推进到下一步（调用 opc_intent_complete 返回中的 next.tool） |

---

## 七、任务拆分（方法论：prompts/task-decomposition.md）

### 7.1 触发条件

opc_intent_complete `opc_task_analysis_complete` 检测到 analysis_result 中需要**修改**的 unit 数量 ≥ 2 时，路由返回拆分指令：

```json
{
  "step": "task_decomposition",
  "step_instruction": "按方法论执行拆分分析 + 自省评估，提交给 opc_decomposition_complete。",
  "methodology": {
    "docs": ["prompts/task-decomposition.md"],
    "ref": "§7.2 拆分原则 + §7.4 自省评估 4 维度",
    "summary": "按领域边界拆，独立的拆开，紧密耦合的合并，通过 _refs 推导依赖"
  },
  "schema": { sub_pipelines, execution_order, decomposition_confidence, confidence_detail },
  "next": {"tool": "opc_decomposition_complete"}
}
```

修改数 = 1 时跳过：opc_intent_complete 直接路由到 brief_generation。

```
修改数 = 1：跳过拆分
  → 例："给用户认证加个短信验证" → user-auth(update) + notification(read)
  → notification 只读 → 单管线

修改数 ≥ 2：opc_intent_complete 路由到 task_decomposition
  → 修改的 unit 之间互相 _refs → 合并为一条子管线
  → 修改的 unit 之间独立 → 拆分
```

### 7.2 拆分原则

**按领域边界拆分** — 每个 knowledge_unit 对应一个领域，一条子管线负责 1-2 个紧密耦合的 unit：

```
knowledge_unit: [product, cart, order, payment, user-center]
                    ↓
子管线-1: product          (商品管理)
子管线-2: user-center      (用户中心)
子管线-3: cart             (购物车，依赖 product + user-center)
子管线-4: order + payment  (下单支付，依赖 cart + user-center)
```

**独立可并行的拆开** — 两个 unit 之间没有 `_refs` → 拆成独立子管线，可并行执行。

**紧密耦合的合并** — 两个 unit 之间有强 `_refs` 引用 → 合并到同一子管线。

**依赖推导**（管线级 output → input）— 通过 `_refs` 关系自动推导 blocked_by：

```
cart._refs → [product, user-center]
  → cart 子管线 blocked_by: [product 子管线, user-center 子管线]

order._refs → [cart, user-center]
  → order+payment 子管线 blocked_by: [cart 子管线, user-center 子管线]
```

### 7.3 输出格式（提交给 opc_decomposition_complete）

```json
{
  "sub_pipelines": [
    { "id": "sub-1", "title": "商品管理", "knowledge_unit": ["product"], "blocked_by": [] },
    { "id": "sub-2", "title": "用户中心", "knowledge_unit": ["user-center"], "blocked_by": [] },
    { "id": "sub-3", "title": "购物车", "knowledge_unit": ["cart"], "blocked_by": ["sub-1", "sub-2"] },
    { "id": "sub-4", "title": "下单与支付", "knowledge_unit": ["order", "payment"], "blocked_by": ["sub-3", "sub-2"] }
  ],
  "execution_order": [
    {"group": 1, "parallel": ["sub-1", "sub-2"]},
    {"group": 2, "sequential": ["sub-3"]},
    {"group": 3, "sequential": ["sub-4"]}
  ],
  "decomposition_confidence": 0.87,
  "confidence_detail": {
    "boundary_clarity": 0.9,
    "coupling_clarity": 0.85,
    "intent_clarity": 0.8,
    "granularity": 0.9
  }
}
```

### 7.4 自省评估与推进

opc_task_analysis_complete `opc_decomposition_complete` 收到拆分方案 + 自省置信度后路由：

**评估维度（Claude 自省打分）：**

| 维度 | 权重 | 0-0.4 (低) | 0.5-0.7 (中) | 0.8-1.0 (高) |
|------|------|-----------|-------------|------------|
| 领域边界清晰度 | 0.35 | unit 边界模糊，多个概念混杂 | 边界基本清晰，少量重叠 | 每个 unit 职责单一，边界明确 |
| 耦合关系明确度 | 0.30 | _refs 关系不确定，依赖方向存疑 | _refs 可推导但存在歧义 | _refs 关系清晰，依赖方向无争议 |
| 任务意图明确度 | 0.20 | 用户描述模糊，需猜测范围 | 意图基本清楚，个别细节待澄清 | 用户明确指定了全部范围和边界 |
| 拆分粒度合理性 | 0.15 | 子管线过大或过碎 | 粒度基本合理 | 每条子管线 1-2 个紧密耦合的 unit |

```
拆分置信度 = 领域边界清晰度×0.35 + 耦合关系明确度×0.30
            + 任务意图明确度×0.20 + 拆分粒度合理性×0.15
```

**opc_task_analysis_complete 推进决策：**

| 置信度 | opc_task_analysis_complete 路由行为 | 典型场景 |
|--------|------------|---------|
| ≥ 0.8 | 路由到 brief_generation，附带 step_instruction "通知用户拆分结果后继续" | _refs 完整 + 边界清晰 |
| 0.5-0.8 | 路由到 brief_generation，附带 step_instruction "快速确认拆分方案后继续" | 大部分常规任务 |
| < 0.5 | 路由到 ask_user（详细确认）或 reflection（深度审视） | 全新领域、边界模糊 |

**自动推进时 Claude 主动告知：**

```
"已自动拆分为 4 条子管线（置信度 0.87）:
  sub-1: 商品管理      (独立，无依赖)
  sub-2: 用户中心      (独立，无依赖)
  sub-3: 购物车        (依赖 sub-1, sub-2)
  sub-4: 下单与支付    (依赖 sub-3, sub-2)
 
 如需调整，回复'调整拆分'。"
```

### 7.5 纠错指令

| 指令 | 效果 |
|------|------|
| "调整拆分" / "修改子管线" | Claude 调 `opc_flow_restart(from_step: "task_decomposition")` |
| "合并 sub-1 和 sub-2" | Claude 调 `opc_flow_revise(field: "sub_pipelines", merge: ["sub-1", "sub-2"])` |
| "不用拆分了" | Claude 调 `opc_flow_revise(field: "decomposition", value: null)` 降级单管线 |
| "就这样" / "继续" | Claude 推进到 brief（next.tool） |

---

## 八、工作单生成（方法论：prompts/brief-generation.md）

仅 medium / high 时生成。opc_intent_complete/opc_task_analysis_complete 路由到 brief_generation 时返回模板指令：

```json
{
  "step": "brief_generation",
  "step_instruction": "按 brief-generation.md 模板生成 brief markdown，提交给 opc_brief_complete。",
  "methodology": {
    "docs": ["prompts/brief-generation.md"],
    "ref": "§8.1 模板 + §8.2 生成规则",
    "summary": "8 个固定段落：描述/基本信息/范围/约束/阶段计划/关联知识/准入检查"
  },
  "schema": { "brief_content": "string (markdown)" },
  "next": {"tool": "opc_brief_complete"}
}
```

### 8.1 模板

```markdown
# 任务工作单

## 问题描述
[用户原始需求的一句话概括]

## 基本信息
| 属性 | 值 |
|------|-----|
| 管线 ID | pipeline-xxx |
| 复杂度 | medium / high |
| 涉及阶段 | 04-implement-design → 05-implement → 06-testing |
| 关联 Scenario | add-feature |

## 范围
### 包含
- [具体要做的内容]

### 不包含
- [明确不做的事情]

## 约束
[用户显式约束，无约束则写"无特殊约束"]

## 阶段计划
| 阶段 | 目标 | 关键节点 |
|------|------|---------|
| 04-implement-design | 实现设计 | api-design, database-schema |
| 05-implement | 编码实现 | tdd-implementation |
| 06-testing | 验证测试 | integration-test |

## 关联知识
| 知识路径 | 操作 | 当前状态 | 说明 |
|---------|------|---------|------|
| user-auth/login/api | update | v2 | 需补充新接口 |
| payment/ | create | — | 全新 domain |

## 准入检查
- [ ] 知识库 opc_knowledge_list 已执行
- [ ] 知识库 opc_knowledge_open 已执行
- [ ] 目标 unit 已创建
- [ ] 用户约束已确认
```

### 8.2 生成规则

- **问题描述**：从 task_analysis_result.description 取，一句话，不扩展
- **范围**：根据 tags 和 description 推导 in-scope；out-of-scope 宁可多列不遗漏
- **约束**：仅写入用户显式提出的约束，不臆造
- **阶段计划**：从 suggested_phases 按顺序列出
- **关联知识**：逐条列 knowledge_unit → 折叠为已有 subsection 路径，标注操作类型和当前状态
- **准入检查**：固定 4 条基础检查项
- **写入后不修改**：brief.md 生成后不随管线执行自动修改

---

## 九、管线创建（opc_decomposition_complete 路由触发 opc_pipeline_create）

opc_decomposition_complete `opc_brief_complete` 收到 brief 内容后，**不是 Claude 自由决定下一步**——而是 opc_decomposition_complete 路由返回里直接预填 `opc_pipeline_create` 的全部参数（从 flow-state.json 中累积的分析结果取出）：

```json
// opc_decomposition_complete 返回
{
  "step": "brief_completed",
  "step_instruction": "下一步创建管线，参数已预填，直接调用 next.tool 即可。",
  "next": {
    "tool": "opc_pipeline_create",
    "args": {
      "description": "...",
      "tags": [...],
      "complexity": "medium",
      "knowledge_unit": ["user-auth"],
      "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
      "scenario": "add-feature",
      "brief_content": "<刚提交的 brief markdown>",
      "sub_pipelines": [{
        "id": "sub-1",
        "title": "用户认证系统",
        "knowledge_unit": ["user-auth"],
        "blocked_by": []
      }],
      "execution_order": [{"group": 1, "parallel": ["sub-1"]}]
    }
  }
}
```

`opc_pipeline_create` 完成后返回里也带 `flow_next` 字段，指引 Claude 调 `opc_knowledge_open`：

```json
// opc_pipeline_create 返回
{
  "pipeline_id": "pipeline-20260608-001",
  "created_at": "...",
  "flow_next": {
    "tool": "opc_knowledge_open",
    "args": {"units": ["user-auth"]},
    "why": "管线已创建，下一步初始化知识单元（每条子管线的 knowledge_unit）"
  }
}
```

state-server 内部行为（纯确定性）：
- 生成 pipeline ID，创建 `.opc/pipelines/<id>/` 目录结构
- 写入 `pipeline-plan.json`
- 写入 `brief.md`（内容由 Claude 提供）
- 写入 `state.json`（初始空 phases）
- 更新 `.opc/sessions/<id>/flow-state.json`，标记 step: pipeline_created
- 返回 `{ pipeline_id, flow_next }`

---

## 十、知识初始化（flow_next 触发 opc_knowledge_open）

Claude 按 `pipeline_create` 返回的 flow_next 指引调用 `opc_knowledge_open`。`opc_knowledge_open` 完成后同样返回 flow_next，指引进入阶段执行：

```json
// opc_knowledge_open 返回（流程内调用）
{
  "units": { "user-auth": {} },
  "related": [],
  "flow_next": {
    "tool": "opc_phase_start",
    "args": {
      "pipeline_id": "pipeline-20260608-001",
      "sub_pipeline_id": "sub-1",
      "phase": "04-implement-design"
    },
    "why": "知识单元就绪，进入第一个阶段"
  },
  "methodology": {
    "docs": ["prompts/phase-execution.md"],
    "ref": "§十 阶段执行循环",
    "summary": "phase_start → 自省排序 → 反思 → phase_confirm → 逐 node 执行 → phase_complete"
  }
}
```

操作逻辑非常简单。完整工具规范见 [03-2 知识 MCP API](../03-opc-knowledge-server/03-2_knowledge-api.md) §2.1 `opc_knowledge_open`。

---

## 十一、阶段执行循环（方法论：prompts/phase-execution.md）

知识初始化完成后，Claude 进入阶段执行循环。详细规范见 [02-3 阶段](02-3_phase.md) 和 [02-4 节点](02-4_node.md)。阶段层工具也按相同模式返回 `flow_next` 指引下一步。

节点选择反思循环也通过 `opc_flow_reflect` 持久化（与任务分析反思共用 opc_brief_complete 工具），完整日志写入 `flow-state.json`。

---

## 十二、完整流程示例

```
用户: "实现用户认证系统"
  │
  ▼ UserPromptSubmit hook → "先调 opc_flow_query"
Claude → opc_flow_query()
  │
  ▼ opc_flow_query 返回 active=false + suggested_actions (含 opc_flow_start) + methodology
Claude 判断: 任务消息 → 按 suggested_actions[0] 调用
Claude → opc_flow_start({user_message: "..."})
  │
  ▼ opc_flow_start 返回 intent_analysis 指令 + methodology
Claude → 按方法论判断 → intent: task, confidence: 0.85
Claude → opc_intent_complete({intent: "task", confidence: 0.85})
  │
  ▼ opc_intent_complete 路由 task 分支，返回 task_analysis 指令 + prerequisites
Claude → opc_knowledge_list() → []
Claude → 按方法论 7 步分析 + 自省打分 → analysis_confidence: 0.88
Claude → opc_task_analysis_complete({..., analysis_confidence: 0.88})
  │
  ▼ opc_task_analysis_complete 判定：高置信度 + complexity=medium + modify_count=1 → 路由 brief_generation
Claude → 按模板生成 brief markdown
Claude → opc_brief_complete({brief_content: "..."})
  │
  ▼ opc_brief_complete 路由，返回 next: opc_pipeline_create（预填全部参数）
Claude → opc_pipeline_create({...预填...})
  │
  ▼ 返回 flow_next: opc_knowledge_open
Claude → opc_knowledge_open({units: ["user-auth"]})
  │
  ▼ 返回 flow_next: opc_phase_start
Claude → opc_phase_start({pipeline_id, sub_id: "sub-1", phase: "04-implement-design"})
  │
  ▼ 进入阶段执行循环（详见 02-3）
```

**流程中追加需求示例（用户半路说"还要加手机号登录"）：**

```
当前 step: phase_execution / pointer: sub-1 / 04-implement-design / api-design

用户新消息: "对了，还要加手机号登录"
  │
  ▼ UserPromptSubmit hook → "先调 opc_flow_query"
Claude → opc_flow_query()
  │
  ▼ 返回 active=true + snapshot（含当前位置）+ 9 种 suggested_actions
Claude 判断: 用户在补充任务范围 → 选 "补充任务范围" 分支
Claude → opc_flow_restart({from_step: "task_analysis",
                            additional_input: "对了，还要加手机号登录"})
  │
  ▼ opc_flow_restart 回退 flow-state.json 到 task_analysis 步骤，把追加输入并入 user_message_history
Claude → 重新做 7 步分析（user_message 已含两部分）
... 后续流程同上
```

**管线内增节点示例（用户说"加上安全审计"）：**

```
当前 step: phase_execution / pointer: sub-1 / 05-implement / tdd-implementation

用户新消息: "记得加上安全审计"
  │
  ▼ Claude → opc_flow_query() → 9 种 suggested_actions
Claude 判断: 管线内增节点 → 不影响当前 node 执行
Claude → opc_pipeline_replan({
  pipeline_id: "pipeline-xxx",
  changes: {add_phase_node: [{phase: "06-testing", node: "security-review"}]}
})
  │
  ▼ state.json 06-testing 加上 security-review 节点
Claude 继续按原 flow_next 推进当前 node（安全审计自然在 06 阶段执行）
```

---

## 十三、精确命令

| 命令 | 用途 |
|------|------|
| `/opc-status` | Claude 调 `opc_flow_query` + `opc_pipeline_status` 查看流程 + 管线状态 |
| `/opc-phase` | 手动跳转/重试某个阶段 |
| `/opc-nodes` | 查看当前阶段的节点选项 |
| `/opc-resume` | Claude 调 `opc_flow_recover` 手动触发流程恢复 |
| `/opc-abort` | Claude 调 `opc_flow_abort` 终止当前流程 |
| `/opc-revise <field> <value>` | Claude 调 `opc_flow_revise` 修改累积参数 |
| `/opc-restart <from_step>` | Claude 调 `opc_flow_restart` 从某步重做 |

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
    "intent_confidence": 0.85,
    "analysis_result": {
      "description": "...",
      "tags": ["..."],
      "complexity": "medium",
      "suggested_phases": ["..."],
      "knowledge_unit": ["..."],
      "scenario": "add-feature",
      "knowledge_plan": [
        {"path": "user-auth/login/api", "operation": "create"},
        {"path": "user-auth/session/api", "operation": "create"}
      ]
    },
    "analysis_confidence": 0.88,
    "decomposition_result": null,
    "decomposition_confidence": null,
    "brief_content": "..."
  },

  "history": [
    {
      "step": "intent_analysis",
      "tool": "opc_intent_complete",
      "input": {"intent": "task", "confidence": 0.85},
      "output": {"next": {"tool": "opc_task_analysis_complete"}},
      "at": "2026-06-08T10:01:00Z"
    }
  ],

  "reflection_log": [
    {
      "step_id": "task_analysis",
      "round": 1,
      "confidence_before": 0.65,
      "confidence_after": 0.72,
      "notes": "反方视角：complexity 应为 high",
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
| `accumulated.decomposition_result` | opc_decomposition_complete | opc_brief_complete |
| `accumulated.brief_content` | opc_brief_complete | opc_brief_complete (推导 pipeline_create args) |
| `history` | 所有流程工具（追加） | opc_flow_query (摘要展示) |
| `reflection_log` | opc_flow_reflect (task_analysis 分支) | opc_flow_query, opc_task_analysis_complete |
| `pipeline_id` | opc_brief_complete (调 opc_pipeline_create 后)、阶段层工具 | opc_flow_query, opc_flow_abort/opc_flow_recover |
| `current_pipeline_pointer` | `opc_phase_start` / `opc_phase_confirm` / `opc_node_start` / `opc_node_complete` / `opc_phase_complete` | opc_flow_query, opc_flow_recover |

阶段/节点层工具不属于流程层，但每次调用都会更新 `current_pipeline_pointer` + `last_heartbeat_at`，确保 crash 后 opc_flow_recover 能从精确位置恢复。

---

## 十五、Hook 脚本（可选高级形态）

简单场景直接用 `plugin.json` 里的内联 echo（见 §一）。如需在大型仓库或多 session 环境给 Claude 更多上下文（如展示 quick-history 最近记录），可改用 `bin/opc-hook.sh`：

```bash
#!/bin/bash
# platform/opc-orchestrator/bin/opc-hook.sh
# 极简版：仅做 slash 命令过滤 + 输出标准提示

# 用户 message 以 / 开头视为 slash 命令，跳过注入（避免干扰 /opc-status 等）
if echo "${CLAUDE_USER_MESSAGE:-}" | head -c 1 | grep -q '^/'; then
  exit 0
fi

cat <<'EOF'
OPC: 先调 mcp__opc-state__opc_flow_query() 了解当前流程状态，再按返回的 suggested_actions 决定下一步（启动/延续/纠正/补充/回退/放弃/暂停/无关）。
EOF
```

设计原则：**hook 永远不做语义判断，最多做工程过滤**（如 slash 前缀、超长消息截断）。所有事实查询和状态判断都由 `opc_flow_query` 工具 + Claude 完成。

---

## 十六、相关文档

- [02-2 管线](02-2_pipeline.md) — 管线创建与生命周期、flow 工具完整列表、`opc_pipeline_replan` 细粒度规范
- [02-3 阶段](02-3_phase.md) — 阶段执行与节点选择、节点选择反思
- [02-4 节点](02-4_node.md) — 节点定义与执行、Agent 委派模式
- [03-1 知识模型](../03-opc-knowledge-server/03-1_knowledge-model.md) — 知识结构与存储
