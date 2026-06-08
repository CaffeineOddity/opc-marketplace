# 02 用户项目目录结构

> 本文档是 [OPC 概览](00_index.md) 的子文档。其他子文档：
> [Marketplace 目录](01_marketplace-directory.md) · [架构分层与时序](03_architecture.md)

---

```
my-project/                              # 用户工程目录（claude 执行目录）
│
├── .claude/
│   ├── settings.json
│   └── permissions.json
│
├── .opc/                                # 运行时状态（gitignore）
│   ├── sessions/                        #   流程状态机的会话存储
│   │   └── sess-abc/
│   │       └── flow-state.json          #     当前流程步骤 + 反思日志 + 累积分析结果
│   ├── pipelines/
│   │   ├── pipeline-xxx/                # 单管线 = 1 条子管线
│   │   │   ├── pipeline-plan.json       # 管线编排计划（始终存在）
│   │   │   ├── manifest.md
│   │   │   └── sub-pipelines/
│   │   │       └── sub-1/  (state.json + brief.md + phases/)
│   │   │
│   │   └── pipeline-ecommerce-xxx/      # 拆分管线 = N 条子管线
│   │       ├── pipeline-plan.json
│   │       ├── manifest.md
│   │       └── sub-pipelines/
│   │           ├── sub-1/  (state.json + brief.md + phases/)
│   │           ├── sub-2/
│   │           └── sub-3/
│   └── .project-init
│
├── opc-nodes/                           # 覆盖内置节点（同 phases/ 目录结构）
│   ├── 04-implement-design/nodes/api-design.md
│   └── 05-implement/nodes/tdd-implementation.md
│
├── opc-knowledge/                       # 项目知识库（git 跟踪）
│   ├── .opc-knowledge.json              #   _refs（跨 unit 依赖）
│   ├── .opc-knowledge.idx               #   搜索索引（派生数据，可重建）
│   ├── user-auth/                       # ← unit
│   │   ├── login/                       # ← section
│   │   │   ├── api.md                   # ← subsection
│   │   │   ├── ui.md
│   │   │   └── architecture.md
│   │   ├── register/
│   │   │   ├── api.md
│   │   │   └── ui.md
│   │   └── session/
│   │       ├── api.md
│   │       ├── model.md
│   │       └── architecture.md
│   ├── authorization/
│   │   └── role-management/
│   │       ├── api.md
│   │       └── model.md
│   └── subscription/
│       └── ...
│
├── opc-memory/                          # 项目持久记忆（git 跟踪）
│   ├── architecture.md
│   ├── api-contracts.md
│   ├── coding-conventions.md
│   ├── design-system.md
│   └── decisions.md
│
├── opc-logs/                            # 运行日志（gitignore）
│   ├── phases/
│   ├── agent-runs/
│   ├── failures/
│   └── telemetry/
│
├── src/                                 # 项目实际代码
├── tests/
├── package.json
└── ...
```

---

## 相关文档

- [01_marketplace-directory.md](01_marketplace-directory.md) — Marketplace 自身结构
- [03_architecture.md](03_architecture.md) — 架构分层 + 时序图 + 流程图
- [../03-opc-knowledge-server/knowledge-model/01_concept-and-storage.md](../03-opc-knowledge-server/knowledge-model/01_concept-and-storage.md) — opc-knowledge/ 详细布局
