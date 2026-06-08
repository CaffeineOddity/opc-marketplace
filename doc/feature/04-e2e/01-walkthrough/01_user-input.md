# 01 第一步：用户输入

> 本文档是 [walkthrough 总览](00_overview.md) 的子文档。其他子文档：
> [流程启动](02_flow-startup.md) · [brief → create](03_brief-to-create.md) · [phase 04](04_phase-04-implement-design.md) · [phase 05](05_phase-05-implement.md) · [phase 06](06_phase-06-testing.md) · [pipeline 完成](07_pipeline-complete.md)

---

## 用户输入

```
用户: "实现用户认证系统，支持邮箱注册登录和会话管理"
```

---

## 前提：知识库初始状态

```
opc-knowledge/
├── .opc-knowledge.json → { "_refs": {} }   # 仅 _refs，无跨 unit 依赖
└── .opc-knowledge.idx                      # 搜索索引（空，派生数据）
```

无任何 unit。

---

## 相关文档

- [02_flow-startup.md](02_flow-startup.md) — 下一步：Claude 启动流程状态机
- [../../02-opc-state-server/01-intent-analysis/00_overview.md](../../02-opc-state-server/01-intent-analysis/00_overview.md) — 意图分析方法论
