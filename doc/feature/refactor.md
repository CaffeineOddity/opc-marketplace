# OPC 设计

> 共 15 篇文档，按主题独立维护。

[01 概览](01-overview.md) — 目录结构、架构分层、设计原则

[02 意图触发](02-intent.md) — 自然语言入口、置信度纠错、显式声明、精确命令

[03 知识体系](03-knowledge.md) — unit→section→subsection 三层结构、MCP 工具速览、版本管理

[04 阶段](04-phases.md) — 9 阶段定义，每阶段含 phase.md + nodes.md + nodes/ + templates/

[05 节点](05-nodes.md) — 节点定义、信号匹配、并发执行、依赖解析、plugin.json 声明式能力

[06 管线状态](06-state.md) — state.json 数据结构、状态枚举、error 字段

[07 场景配方](07-scenarios.md) — Scenario 加权机制、快速启动模板

[08 引擎](08-engine.md) — TypeScript 引擎（state-manager/phase-validator/task-analyzer/node-resolver）

[09 MCP 服务](09-hooks.md) — opc-state-server + opc-knowledge-server，替代原 Hook 体系

[10 执行流程](10-execution-flow.md) — 端到端流程图：意图识别 → 任务分析 → 阶段执行 → 重试/恢复

[11 实施路线](11-roadmap.md) — 8 个 Phase 构建顺序

[13 节点系统](13-guides.md) — 节点 + 模板按阶段组织在 `phases/`，与阶段定义同目录

[15 端到端演练](15-e2e-walkthrough.md) — medium 单管线 + high 拆分管线完整示例

[15 审查缺口](15-review-gaps.md) — 全量审查未解决的缺点与待补充点

[16 管线](16-pipeline.md) — 管线设计：两层 Plan、目录结构、pipeline-plan.json、生命周期、多 Feature 并行

[17 opc-state-server](17-mcp-state-server.md) — 16 个 MCP 工具 API、质量门、级联重置、超时检测、调用链路

[18 opc-knowledge-server](18-mcp-knowledge-server.md) — 8 个 MCP 工具 API、知识数据模型、版本管理
