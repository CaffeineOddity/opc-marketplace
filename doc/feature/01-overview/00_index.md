# OPC 概览

> 按 MCP 服务边界组织：opc-state-server（意图→管线→阶段→节点）+ opc-knowledge-server（模型→API）+ opc-reflection-server（方法学→纠正库）+ 演练 + 测试。

## 文档地图

### 01 概览子文档（本目录配套）

- [Marketplace 目录结构](01_marketplace-directory.md) — `opc-marketplace/` 完整树（platform/mcp/、phases/、kits/）
- [用户项目目录结构](02_user-project.md) — `my-project/` 完整树（.opc/、opc-knowledge/、opc-memory/、opc-logs/）
- [架构分层 + 时序 + 流程](03_architecture.md) — 4 层架构图、端到端时序图、决策分叉流程图、节点选择补充

### 02 opc-state-server — 任务跟进

- [意图识别与任务分析](../02-opc-state-server/01-intent-analysis/00_overview.md) — 自然语言入口、意图分类、置信度、任务分析、复杂度分叉、拆分判断、工作单生成
- [管线](../02-opc-state-server/02-pipeline/00_overview.md) — 两层 Plan 模型、pipeline-plan.json、state.json、单管线/拆分管线、生命周期、状态展示、完整调用链路
- [阶段](../02-opc-state-server/03-phase/00_overview.md) — 9 阶段定义、节点选择策略、Scenario 加权、反思轮次、分层回退
- [节点](../02-opc-state-server/04-node/00_overview.md) — 节点类型与定义、信号匹配、并发与文件域隔离、依赖解析、质量门、超时重试、plugin.json

### 03 opc-knowledge-server — 知识库

- [知识模型与存储](../03-opc-knowledge-server/01-knowledge-model/00_overview.md) — unit→section→subsection 三层结构、.md frontmatter、.opc-knowledge.json（_refs）、版本管理、智能复用
- [知识 MCP API](../03-opc-knowledge-server/02-knowledge-api/00_overview.md) — 8 个工具完整规范、初始化时序、与 state-server 协作



### 04 e2e — 验证与测试

- [端到端演练](../04-e2e/01-walkthrough/00_overview.md) — 从 0 到 1：medium 单管线完整示例
- [链路测试](../04-e2e/02-test/00_overview.md) — 10 个测试用例逐条追踪 MCP 调用链，检查工具覆盖和流程完整性


### 05 opc-reflection-server — 反思方法学

- [反思总览](../05-opc-reflection-server/00_index.md) — 8 核心原则 + 12 个关键设计点 + 端到端反思链路时序
- [反思方法学](../05-opc-reflection-server/01-method-theory/00_overview.md) — 5 种学术方法（CoVe/Critique/Debate/Reflexion/ToT）+ 8 step × 方法决策表
- [server 设计](../05-opc-reflection-server/02-server-design/00_overview.md) — 13 个工具 + Evidence schema + V1-V5 validator + sub-agent 权限 + meta-validator
- [corrections 存储](../05-opc-reflection-server/03-corrections-store/00_overview.md) — L1/L2/L3 三层存储 + 三层模型 + 4 个膨胀控制 + seed 冷启动
- [反思流程](../05-opc-reflection-server/04-reflection-flow/00_overview.md) — per-step 反思时序 + 用户自治 + meta-reflection + phase_reset 交互


### 阅读顺序

```
01 概览（本文档） → 概览子文档（目录 / 架构）
                  → intent-analysis → pipeline → phase → node
                  → 知识模型 → 知识 API
                  → 反思方法学 → server 设计 → corrections → 反思流程
                  → 端到端演练 → 链路测试
```

---

## 一、设计原则

1. **MCP 状态机驱动 + 文档方法论参考** —— flow tools 路由"做什么"，prompts/*.md 解释"为什么这么做"
2. **意图触发，置信度兜底** —— 用户直接说话；低置信度时主动确认
3. **MCP 服务器零 LLM 依赖** —— state-server / knowledge-server / reflection-server 都是纯 TypeScript 确定性逻辑；所有 LLM 工作（含反思 sub-agent）由 Claude Code（MCP Host）承担
4. **流程可观测可恢复** —— flow-state.json 记录每一步的输入、输出、反思日志，crash 后 `opc_flow_query` 检测到 owner.pid 已死 → `opc_flow_recover` 续跑
5. **工具返回自包含 next** —— 每个工具返回 `flow_next` 字段告诉 Claude 下一步调什么，避免文档硬编码跳转
6. **节点组装** —— 阶段自主选择节点，resolver 自动处理依赖和文件域冲突
7. **子管线严格串行** —— 按 execution_order 依次执行，blocked_by 阻塞未就绪的 sub，无需并发写保护
7. **Marketplace 只分发，不存数据** —— 知识、记忆、产出物都在用户项目里
8. **知识属于项目** —— 切换目录 = 切换知识上下文
9. **三 MCP 服务** —— opc-state-server 管流程+任务跟进，opc-knowledge-server 管知识库，opc-reflection-server 管反思方法学+用户纠正归档
10. **知识先于状态** —— 知识库在 state.json 创建前初始化，供所有 phase 参考
11. **声明式发现** —— plugin.json capabilities 让编排器动态发现能力
12. **阶段是强约束** —— input 依赖不满足则阻止，但允许受控回退
13. **语义匹配优先于关键词** —— node 选择以语义相似度为主，关键词只做初筛（由 Claude 完成）
14. **失败可恢复** —— 管线状态持久化，失败后尝试修复，支持暂停/恢复、重试/中止
15. **阶段自包含** —— 节点、模板、阶段定义同目录（`phases/<phase>/`），一目了然
16. **反思方法学化** —— 反思 = 工程化的标准方法库（5 种学术方法），不让 LLM 自评；evidence artifact + deterministic validator 替代所有 `confidence: number`
17. **用户纠正必沉淀** —— L1（flow-state）→ L2（项目 corrections）→ L3（全局 lessons）三层归档，反向注入反思 prompt
18. **反思永不阻塞主流程** —— 反思器自身失败时降级到 validator-only + ask_user，不卡用户
