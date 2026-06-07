# OPC 设计

> 按 MCP 服务边界组织：opc-state-server（意图→管线→阶段→节点）+ opc-knowledge-server（模型→API）+ 演练 + 测试。

## 文档索引

[01 概览](01-overview.md) — 目录结构、架构分层、时序图、流程图、设计原则

### 02 opc-state-server — 任务跟进

[02-1 意图识别与任务分析](02-opc-state-server/02-1_intent-analysis.md) — 自然语言入口、意图分类、置信度、任务分析、复杂度分叉、拆分判断、工作单生成

[02-2 管线](02-opc-state-server/02-2_pipeline.md) — 两层 Plan 模型、pipeline-plan.json、state.json、单管线/拆分管线、生命周期、状态展示、完整调用链路

[02-3 阶段](02-opc-state-server/02-3_phase.md) — 9 阶段定义、节点选择策略、Scenario 加权、反思轮次、置信度阈值、/comma 独立运行、分层回退

[02-4 节点](02-opc-state-server/02-4_node.md) — 节点类型与定义、信号匹配、并发与文件域隔离、依赖解析、质量门、超时重试、plugin.json

### 03 opc-knowledge-server — 知识库

[03-1 知识模型与存储](03-opc-knowledge-server/03-1_knowledge-model.md) — unit→section→subsection 三层结构、.md frontmatter、.opc-knowledge.json（_refs）、版本管理、智能复用

[03-2 知识 MCP API](03-opc-knowledge-server/03-2_knowledge-api.md) — 8 个工具完整规范、初始化时序、与 state-server 协作

### 04 e2e — 验证与测试

[04-1 端到端演练](04-e2e/04-1_walkthrough.md) — 从 0 到 1：medium 单管线完整示例

[04-2 链路测试](04-e2e/04-2_test.md) — 10 个测试用例逐条追踪 MCP 调用链，检查工具覆盖和流程完整性

## 阅读顺序

```
01-overview → 02-1 意图分析 → 02-2 管线 → 02-3 阶段 → 02-4 节点
            → 03-1 知识模型 → 03-2 知识 API
            → 04-1 演练 → 04-2 测试
```
