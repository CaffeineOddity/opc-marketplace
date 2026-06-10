# 03 opc-knowledge-server — 知识库

> MCP 服务边界：知识模型 + CRUD/版本管理/全文搜索 API。纯 TypeScript 确定性逻辑，零 LLM 依赖。

## 主题地图

- [01 知识模型与存储](01-knowledge-model/00_overview.md) — unit→section→subsection 三层结构、`.md` frontmatter、`.opc-knowledge.json`（`_refs`）、版本管理、智能复用
- [02 知识 MCP API](02-knowledge-api/00_overview.md) — 4 个工具（`open` / `read` / `write` / `admin`）完整规范、初始化时序、与 state-server 协作

## 阅读顺序

```
01 知识模型（概念与存储） → 02 知识 API（工具规范）
```

## 相关章节

- [01 概览](../01-overview/00_index.md) — 全局架构与目录结构
- [02 opc-state-server](../02-opc-state-server/00_index.md) — 流程状态机 MCP 服务
- [04 e2e](../04-e2e/00_index.md) — 端到端演练与链路测试
