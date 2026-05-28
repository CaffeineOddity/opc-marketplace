# OPC 设计

> 共 11 篇文档，按主题独立维护。

[01 概览](01-overview.md) — 目录结构、架构分层、设计原则

[02 意图触发](02-intent.md) — 自然语言入口、置信度纠错、显式声明、精确命令

[03 知识体系](03-knowledge.md) — 三层知识、draft/final 状态、版本管理、Marketplace 分离

[04 阶段](04-stages.md) — 9 阶段定义 + 5 个文件结构（stage/entry-gates/exit-gates/nodes/deliverables）

[05 节点](05-nodes.md) — 节点定义、信号匹配、并发执行、依赖解析、plugin.json 声明式能力

[06 场景配方](06-scenarios.md) — Scenario 加权机制、快速启动模板

[07 引擎](07-engine.md) — TypeScript 引擎（gate-evaluator/stage-validator/task-analyzer/node-resolver/knowledge-flow）

[08 Hook 体系](08-hooks.md) — 10 个 Hook、路径过滤、TDD Gate 阶段感知

[09 执行流程](09-execution-flow.md) — 端到端：意图识别 → 任务分析 → 初始化 → 阶段执行 → 完成

[10 实施路线](10-roadmap.md) — 8 个 Phase 构建顺序

[11 补充设计](11-supplement.md) — 阶段回退、错误恢复、管线暂停/恢复、多 Feature 并行
