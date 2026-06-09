# 02 opc-state-server — 任务跟进

> MCP 服务边界：流程状态机 + 管线/阶段/节点编排。纯 TypeScript 确定性逻辑，零 LLM 依赖。

## 主题地图

- [01 意图识别与任务分析](01-intent-analysis/00_overview.md) — 自然语言入口、意图分类、置信度、任务分析、复杂度分叉、拆分判断、工作单生成
- [02 管线](02-pipeline/00_overview.md) — 两层 Plan 模型、`pipeline-plan.json`、`state.json`、单管线/拆分管线、生命周期、状态展示、完整调用链路
- [03 阶段](03-phase/00_overview.md) — 9 阶段定义、节点选择策略、Scenario 加权、反思轮次、分层回退
- [04 节点](04-node/00_overview.md) — 节点类型与定义、信号匹配、并发与文件域隔离、依赖解析、质量门、超时重试、`plugin.json`

## 阅读顺序

```
01 意图识别 → 02 管线 → 03 阶段 → 04 节点
```

## 相关章节

- [01 概览](../01-overview/00_index.md) — 全局架构与目录结构
- [03 opc-knowledge-server](../03-opc-knowledge-server/00_index.md) — 知识库 MCP 服务
- [04 e2e](../04-e2e/00_index.md) — 端到端演练与链路测试
