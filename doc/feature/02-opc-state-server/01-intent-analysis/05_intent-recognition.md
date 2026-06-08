# 意图识别与置信度

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 四、意图识别（方法论：prompts/01_intent-analysis-overview.md）

Claude 收到 opc_flow_query 返回后按方法论判断。四种意图：

| 意图 | 说明 | 行为 |
|------|------|------|
| `task` | 用户想完成具体的开发任务 | opc_intent_complete 路由到 task_analysis |
| `project_question` | 针对当前项目提问 | opc_intent_complete 路由到 knowledge_search + 回答 |
| `general_question` | 与项目无关的纯知识问答 | opc_flow_start done，Claude 直接回答 |
| `chat` | 闲聊 / 无技术内容 | opc_flow_start done |

### 4.1 task 信号（详见 prompts/01_intent-analysis-overview.md §3.1）

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

