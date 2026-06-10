# 意图识别与置信度

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 四、意图识别（方法论：prompts/01_intent-analysis-overview.md）

Claude 收到 opc_flow_query 返回后按方法论判断。四种意图：

| 意图 | 说明 | 行为 |
|------|------|------|
| `task` | 用户想完成具体的开发任务 | `opc_flow_step_complete({step:"intent_analysis"})` 路由到 task_analysis |
| `project_question` | 针对当前项目提问 | `opc_flow_step_complete({step:"intent_analysis"})` 路由到 knowledge_read({mode:"search"}) + 回答 |
| `general_question` | 与项目无关的纯知识问答 | 流程终结（done），Claude 直接回答 |
| `chat` | 闲聊 / 无技术内容 | 流程终结（done） |

### 4.1 task 信号（详见 prompts/01_intent-analysis-overview.md 3.1）

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

## 五、Evidence 与纠错

### 5.1 Evidence 收集与路由（由 `opc_flow_step_complete({step:"intent_analysis"})` 路由层执行）

本步骤走 reflection-server **P1 反思位点**，提交 `intent_evidence` 而不是 `confidence: number`。Schema：

| 字段 | 说明 |
|------|------|
| `task_criteria_hits[]` | 命中的 task 判定条件（如「包含动作动词」「明确交付物」等具名条目，逐条引用 4.1 信号源） |
| `chat_signals[]` | 命中的 chat/question 反向信号 |
| `user_quotes[]` | 原始用户消息中支撑判定的逐字引文（必须能在 user_message_history 中检索到） |

`opc_flow_step_complete({step:"intent_analysis"})` 路由按 reflection-server V1-V5 validator + meta-validator 结果分流：

| validator 结果 | 路由行为 |
|----------------|---------|
| V1-V5 全部 pass + 无严重 objection | 直接路由到对应分支（task → task_analysis；project_question → knowledge_read({mode:"search"})；general/chat → done） |
| validator pass + 中等 objection | 路由到对应分支，但 step_instruction 提示 Claude 向用户简短确认（附 reasoning_trace） |
| validator fail 或严重 objection | 进入 P1 反思（primary=M3 CoVe，secondary=M4 Critique）；rounds 耗尽 → ask_user |

> evidence schema 完整字段、V1-V5 规则、M3/M4 方法定义见 [05-opc-reflection-server/02-server-design/00_overview.md 二/三](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema) + [01-method-theory/00_overview.md 五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

### 5.2 纠错指令

| 纠错指令 | 效果 |
|----------|------|
| "不用启动管线" / "just answer" | Claude 调 `opc_flow_lifecycle({action:"abort"})` → 普通问答 |
| "先不做了" / "cancel" | Claude 调 `opc_flow_lifecycle({action:"abort"})`（已创建 pipeline 时自动级联 `opc_pipeline_lifecycle({action:"abort"})`） |
| "这不是任务" / "not a task" | Claude 调 `opc_flow_lifecycle({action:"abort", reason: "marked_as_question_sample"})` |
| "重新分析" | Claude 调 `opc_flow_correct({action:"restart", from_step: "task_analysis"})` |
| "改 complexity 为 high" | Claude 调 `opc_flow_correct({action:"revise", field: "complexity", value: "high"})` |
| "还要加 X 功能" | Claude 调 `opc_flow_correct({action:"restart", from_step: "task_analysis", additional_input: "X"})` |
| "回到分析重做拆分" | Claude 调 `opc_flow_correct({action:"restart", from_step: "task_decomposition"})` |
| "继续" / "嗯" | 按上次 flow_next 推进，不调任何 flow 工具 |

### 5.3 显式声明

| 前缀 | 效果 |
|------|------|
| `!task <描述>` | 强制作为任务执行（intent=task，跳过 P1 反思，intent_evidence.user_quotes 仅记原始前缀） |
| `? <问题>` | 强制作为问答处理（intent=question，跳过 P1 反思） |

---

