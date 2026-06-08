# 01 概念模型与存储结构

> 本文档是 [知识模型总览](../01_knowledge-model-overview.md) 的子文档。其他子文档：
> [元数据文件](02_metadata-files.md) · [版本管理](03_versioning.md) · [Node 声明与驱动](04_node-driven.md) · [智能复用](05_smart-reuse.md)

---

## 一、概念模型

| 层级 | 英文 | 例子 | 语义 |
|------|------|------|------|
| L1 知识点 | unit / knowledge_unit | `user-auth` | 领域实体，共享核心模型 |
| L2 功能 | section | `login`, `session` | 实体内的功能边界 |
| L3 特性 | subsection / aspect | `api`, `model`, `architecture` | 功能的某个方面 |

---

## 二、存储结构

```
opc-knowledge/
├── .opc-knowledge.json           ← 仅存储 _refs（跨 unit 依赖）
├── .opc-knowledge.idx            ← 搜索索引（派生数据，可重建）
├── user-auth/                    ← unit
│   ├── login/                    ← section
│   │   ├── api.md                ← subsection，version 在 frontmatter
│   │   ├── ui.md
│   │   └── architecture.md
│   ├── register/
│   │   ├── api.md
│   │   └── ui.md
│   └── session/
│       ├── api.md
│       ├── model.md
│       └── architecture.md
├── authorization/
│   └── role-management/
│       ├── api.md
│       └── model.md
└── subscription/
    └── plan/
        └── api.md
```

文件系统是唯一真相源，version 存在 .md frontmatter 中，写入只涉及单文件原子操作，无跨文件一致性问题。

---

## 相关文档

- [02_metadata-files.md](02_metadata-files.md) — `.opc-knowledge.json` / `.opc-knowledge.idx` 的设计
- [03_versioning.md](03_versioning.md) — version 字段语义
