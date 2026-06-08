# 02-1 意图识别与任务分析

不设 `/opc` 入口命令。自然语言就是入口。UserPromptSubmit hook 注入一条极简指令，引导 Claude 调用 `opc_flow_query` 查询流程状态。后续每一步都由 MCP 工具返回的 `next` 字段驱动，pipeline 文档作为**方法论参考**按需读取。

本文档已按主题拆分为多个子文档，本文是**聚合索引**，按阅读顺序指向各子文档。

---

## 子文档导航

### 架构基础

| 子文档 | 内容 |
|------|------|
| [01_hook-architecture.md](02-1-intent-analysis/01_hook-architecture.md) | Hook 触发机制、混合架构（MCP 状态机 + 方法论文档）、文档归属、Hook 脚本高级形态 |
| [02_flow-tools.md](02-1-intent-analysis/02_flow-tools.md) | **流程工具规范**（13 个 `opc_flow_*` 工具，唯一真相源） |
| [08_flow-state-schema.md](02-1-intent-analysis/08_flow-state-schema.md) | `flow-state.json` 完整 schema + 字段读写分配 |

### 流程步骤（按执行顺序）

| 子文档 | 内容 | 涉及工具 |
|------|------|------|
| [03_intent-recognition.md](02-1-intent-analysis/03_intent-recognition.md) | 意图识别（4 种意图）+ 置信度阈值 + 纠错指令 | `opc_flow_query` / `opc_flow_start` / `opc_intent_complete` |
| [04_task-analysis.md](02-1-intent-analysis/04_task-analysis.md) | 7 步任务分析 + 5 维度自省评估 + 反思循环 | `opc_task_analysis_complete` / `opc_flow_reflect` |
| [05_task-decomposition.md](02-1-intent-analysis/05_task-decomposition.md) | 子管线拆分原则、依赖推导、4 维度自省 | `opc_decomposition_complete` |
| [06_brief-generation.md](02-1-intent-analysis/06_brief-generation.md) | 工作单模板与生成规则 | `opc_brief_complete` |
| [07_pipeline-creation.md](02-1-intent-analysis/07_pipeline-creation.md) | 管线创建、知识初始化、阶段执行循环入口 | `opc_pipeline_create` → `opc_knowledge_open` → `opc_phase_start` |

### 参考与示例

| 子文档 | 内容 |
|------|------|
| [09_complete-example.md](02-1-intent-analysis/09_complete-example.md) | 完整流程示例（含流程中追加需求、管线内增节点）+ 精确命令清单 |

---

## 快速入口

**入口工具**：[`opc_flow_query`](02-1-intent-analysis/02_flow-tools.md#opc_flow_query) — 流程状态查询，返回快照 + methodology + 9 种 suggested_actions

**核心架构原则**：

- **Hook 极简化**：永远只输出一行提示，不读文件、不拼快照、不做判断
- **事实查询统一入口**：`opc_flow_query` 是流程状态的唯一事实源，含 pid 存活校验
- **决策权归 Claude**：query 提供候选清单，最终走哪条路由由 LLM 判断
- **工具内部强制校验**：所有 `opc_flow_*` 都内置 pid + status 校验
- **方法论文档按需读**：MCP 工具返回 `methodology.docs` 指向 `prompts/*.md`，复杂边界场景才完整 Read

详见 [01_hook-architecture.md §1.1 设计原则](02-1-intent-analysis/01_hook-architecture.md#11-设计原则)。

---

## 相关文档

- [02-2 管线](02-2_pipeline.md) — 管线创建与生命周期、`opc_pipeline_replan` 细粒度规范
- [02-3 阶段](02-3_phase.md) — 阶段执行与节点选择、节点选择反思
- [02-4 节点](02-4_node.md) — 节点定义与执行、Agent 委派模式
- [03-1 知识模型](../03-opc-knowledge-server/03-1_knowledge-model.md) — 知识结构与存储
