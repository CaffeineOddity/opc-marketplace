# OPC 设计

> 共 9 篇文档 + 1 篇完整链路测试，按管线流程顺序组织。

## 文档索引

[01 概览](01-overview.md) — 目录结构、架构分层、时序图、流程图、设计原则

[02 意图识别与任务分析](02-intent-analysis.md) — 自然语言入口、意图识别、任务分析、复杂度分叉、拆分判断、工作单生成

[03 知识体系](03-knowledge.md) — unit→section→subsection 三层结构、版本管理、存储格式、节点驱动

[04 管线](04-pipeline.md) — 两层 Plan 模型、pipeline-plan.json、state.json、单管线/拆分管线、生命周期

[05 阶段](05-phase.md) — 9 阶段定义、节点选择策略、Scenario 加权、反思轮次、/comma 独立运行

[06 节点](06-node.md) — 节点定义、信号匹配、并发执行、依赖解析、质量门、超时重试

[07 opc-state-server](07-opc-state-server.md) — 管线/阶段/节点 19 个 MCP 工具 API、自动机制、调用链路、内部引擎

[08 opc-knowledge-server](08-opc-knowledge-server.md) — 知识库 8 个 MCP 工具 API、初始化时序、智能复用

[09 端到端演练](09-e2e-walkthrough.md) — 从 0 到 1：medium 单管线完整示例

## 测试

[完整链路测试](test.md) — 10 个测试用例逐条追踪 MCP 调用链，检查工具覆盖和流程完整性

## 阅读顺序

按序号阅读即可走通完整链路：

```
用户输入 → 意图分析(02) → 知识初始化(03) → 管线创建(04)
         → 阶段执行(05) → 节点执行(06) → state-server(07)
         → knowledge-server(08) → 演练验证(09)
```
