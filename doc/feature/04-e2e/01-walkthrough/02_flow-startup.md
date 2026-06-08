# 02 第二步：Claude 启动流程状态机

> 本文档是 [walkthrough 总览](00_overview.md) 的子文档。其他子文档：
> [用户输入](01_user-input.md) · [brief → create](03_brief-to-create.md) · [phase 04](04_phase-04-implement-design.md) · [phase 05](05_phase-05-implement.md) · [phase 06](06_phase-06-testing.md) · [pipeline 完成](07_pipeline-complete.md)

---

UserPromptSubmit hook 注入一行指令："先调 opc_flow_query 了解当前流程状态"。

## 2.0 opc_flow_query → 确认无活跃流程

```
Claude → opc_flow_query()

返回:
{
  active: false,
  session_id: "sess-abc-001",
  step_instruction: "判断用户最近一条消息的意图。若是开发任务 → opc_flow_start；若是项目问答 → opc_knowledge_search；若是闲聊/纯知识 → 直接回答。",
  methodology: {
    docs: ["prompts/01_intent-analysis-overview.md"],
    ref: "§三 意图分类",
    summary: "4 种意图：task/project_question/general_question/chat"
  },
  suggested_actions: [
    {intent: "task", next: {tool: "opc_flow_start", args: {user_message: "实现用户认证系统，支持邮箱注册登录和会话管理"}}},
    {intent: "project_question", next: {tool: "opc_knowledge_search"}},
    {intent: "chat / general_question", next: {action: "respond_normally"}}
  ],
  orphan_pipelines: []
}

Claude 判断:
  消息"实现用户认证系统..." 含动作动词+交付物 → task
  → 选 suggested_actions[0] → 调 opc_flow_start
```

---

## 2.1 opc_flow_start → 收到 intent_analysis 指令

```
Claude → opc_flow_start({user_message: "实现用户认证系统，支持邮箱注册登录和会话管理"})

返回:
{
  step: "intent_analysis",
  step_instruction: "判断意图，输出 {intent, confidence, reasoning}",
  methodology: {
    docs: ["prompts/01_intent-analysis-overview.md"],
    ref: "§三 意图分类 + §3.1 task 信号",
    summary: "动作动词+0.3，明确交付物+0.2，!task+1.0，疑问词-0.3"
  },
  schema: { intent: [...], confidence: "0-1", reasoning: "string" },
  next: { tool: "opc_intent_complete" }
}

Claude 按 step_instruction（必读）判断:
  输入: "实现用户认证系统，支持邮箱注册登录和会话管理"
  → 包含动作动词"实现" +0.3
  → 包含明确交付物"系统" +0.2
  → 无否定/疑问信号
  → intent: task, confidence: 0.85

Claude → opc_intent_complete({intent: "task", confidence: 0.85, reasoning: "..."})
```

---

## 2.2 opc_intent_complete 路由 task 分支 → 收到 task_analysis 指令

```
返回:
{
  step: "task_analysis",
  step_instruction: "先调 opc_knowledge_list() 获取已有 unit，然后做 7 步分析 + 自省",
  methodology: {
    docs: ["prompts/task-analysis.md"],
    ref: "§6.2 分析步骤 + §6.4 自省评估 5 维度",
    summary: "提炼描述→打标签→判复杂度→推荐阶段→提取知识→匹配 scenario→知识操作计划"
  },
  prerequisites: [{tool: "opc_knowledge_list", why: "获取已有 unit 上下文"}],
  schema: { description, tags, complexity, suggested_phases, knowledge_unit,
            scenario, knowledge_plan, analysis_confidence, confidence_detail },
  next: { tool: "opc_task_analysis_complete" }
}

Claude → opc_knowledge_list()
  → readdir 遍历 opc-knowledge/ → 无 unit 子目录
  → 返回: units: []
```

---

## 2.3 Claude 按方法论做 7 步分析

```
Claude 自行分析:
  ① 提炼描述 → "实现用户认证系统（邮箱注册登录 + 会话管理）"
  ② 打标签 → [backend, auth, database]
  ③ 复杂度 → medium（需要规划，能一轮完成）
  ④ 推荐阶段 → [04-implement-design, 05-implement, 06-testing]
  ⑤ 知识点 → [user-auth]（新 unit）
  ⑥ 扫描 scenarios/ → add-feature
  ⑦ 知识操作计划 → 6 个 subsection 全部 create

自省打分:
  ① 描述精确度: 0.9
  ② 复杂度确信度: 0.85
  ③ 知识单元完整度: 0.9
  ④ 阶段推荐合理度: 0.85
  ⑤ 场景匹配度: 0.9
  → 分析置信度 = 0.88

Claude → opc_task_analysis_complete({
  description: "实现用户认证系统（邮箱注册登录 + 会话管理）",
  tags: ["backend", "auth", "database"],
  complexity: "medium",
  suggested_phases: ["04-implement-design", "05-implement", "06-testing"],
  knowledge_unit: ["user-auth"],
  scenario: "add-feature",
  knowledge_plan: [
    {path: "user-auth/register/api", operation: "create"},
    {path: "user-auth/login/api", operation: "create"},
    {path: "user-auth/session/api", operation: "create"},
    {path: "user-auth/session/model", operation: "create"},
    {path: "user-auth/login/architecture", operation: "create"},
    {path: "user-auth/register/architecture", operation: "create"}
  ],
  analysis_confidence: 0.88,
  confidence_detail: {...}
})
```

---

## 2.4 opc_task_analysis_complete 路由判定 → 直接路由 brief_generation

```
opc_task_analysis_complete 判定:
  → 0.88 ≥ 0.8 → 跳过反思
  → complexity = medium → 不走 quick_dispatch
  → modify_unit_count = 1（6 个 subsection 全在 user-auth unit 下，按 unit 去重）
  → 路由 brief_generation

返回:
{
  step: "brief_generation",
  step_instruction: "按 brief-generation.md 模板生成 brief markdown",
  methodology: {
    docs: ["prompts/brief-generation.md"],
    ref: "§8.1 模板 + §8.2 生成规则",
    summary: "8 个固定段落"
  },
  schema: { brief_content: "string (markdown)" },
  next: { tool: "opc_brief_complete" }
}

Claude 通知用户:
  "任务分析完成（置信度 0.88）:
   描述：实现用户认证系统（邮箱注册登录 + 会话管理）
   复杂度：medium | 阶段：04→05→06 | 知识点：user-auth | 场景：add-feature"
```

---

## 相关文档

- [03_brief-to-create.md](03_brief-to-create.md) — 下一步：生成 brief 并创建管线
- [../../02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md](../../02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md) — 流程工具速览
