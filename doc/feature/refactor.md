# OPC 设计

> 共 10 篇文档 + 1 篇完整链路测试，按管线流程顺序组织。

## 文档索引

[01 概览](01-overview.md) — 目录结构、架构分层、时序图、流程图、设计原则

[02 意图识别与任务分析](02-intent-analysis.md) — 自然语言入口、意图识别、任务分析、复杂度分叉、拆分判断、工作单生成

[03 知识体系](03-knowledge.md) — unit→section→subsection 三层结构、8 个 MCP 工具完整 API、版本管理

[04 管线](04-pipeline.md) — 两层 Plan 模型、pipeline-plan.json、state.json、单管线/拆分管线、生命周期

[05 阶段](05-phase.md) — 9 阶段定义、节点选择策略、Scenario 加权、反思轮次、/comma 独立运行

[06 节点](06-node.md) — 节点定义、信号匹配、并发执行、依赖解析、质量门、超时重试

[07 引擎](07-engine.md) — TypeScript 引擎（state-manager / phase-validator / task-analyzer / node-resolver）

[08 MCP 服务](08-mcp.md) — 两个 MCP 服务、19+8 个工具 API、自动机制、完整调用链路

[09 端到端演练](09-e2e-walkthrough.md) — 从 0 到 1：medium 单管线完整示例

[10 实施路线](10-roadmap.md) — 8 个 Phase 构建顺序

## 测试

[完整链路测试](test.md) — 10 个测试用例逐条追踪 MCP 调用链，检查工具覆盖和流程完整性

## 阅读顺序

按序号阅读即可走通完整链路：

```
用户输入 → 意图分析(02) → 知识初始化(03) → 管线创建(04)
         → 阶段执行(05) → 节点执行(06) → 引擎支持(07)
         → MCP 服务(08) → 演练验证(09) → 实施路线(10)
```
