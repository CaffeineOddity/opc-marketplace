# 02 元数据文件

> 本文档是 [知识模型总览](../01_knowledge-model-overview.md) 的子文档。其他子文档：
> [概念模型与存储结构](01_concept-and-storage.md) · [版本管理](03_versioning.md) · [Node 声明与驱动](04_node-driven.md) · [智能复用](05_smart-reuse.md)

---

## 一、.md frontmatter

```yaml
---
version: 3
updated_at: "2026-06-06T10:30:00Z"
pipeline_id: "pipeline-001"
node: "api-design"
---
```

写入只涉及单文件原子操作。文件删了版本就没了，文件在版本就在。

---

## 二、.opc-knowledge.json（仅 _refs）

```json
{
  "_refs": {
    "authorization": ["user-auth"],
    "cart": ["product", "user-auth"]
  }
}
```

记录 unit 间的语义依赖，用于管线拆分时推导管线间依赖。低频更新。

---

## 三、.opc-knowledge.idx（搜索索引）

全文搜索索引，纯派生数据。损坏或丢失时通过 `opc_knowledge_reindex` 全量重建，零数据丢失风险。

---

## 四、不设 index.json 的理由

原设计用 `index.json` 作为 version 的权威存储，存在 crash 不一致风险：先写 .md 再更新 index.json，中间崩溃则 index.json 与实际文件不一致。改为 version 存入 .md frontmatter 后，数据一致性风险消除。

---

## 相关文档

- [01_concept-and-storage.md](01_concept-and-storage.md) — 整体目录布局
- [../knowledge-api/03_initialization-flow.md](../knowledge-api/03_initialization-flow.md) — _refs 在初始化中的作用
