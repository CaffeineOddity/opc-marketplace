# 02 元数据文件

> 本文档是 [知识模型总览](00_overview.md) 的子文档。其他子文档：
> [概念模型与存储结构](01_concept-and-storage.md) · [Node 声明、版本与写入策略](03_node-driven-and-versioning.md)

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

全文搜索索引，**纯派生数据**。损坏或丢失时通过 `opc_knowledge_reindex` 全量重建，零数据丢失风险。

**维护机制**：knowledge-server 主进程持有 `dirty_paths: Set<string>` 队列，`opc_knowledge_write` / `_delete` 入队即返回；2s debounce 后异步 incremental reindex。**不在 sub-agent 上下文里跑**。node 边界 (`opc_node_complete`) / phase 边界 (`opc_phase_complete`) / `consistency:"fresh"` search 触发 hard flush。完整契约见 [../02-knowledge-api/02_core-tools.md § 2.9 reindex 调度契约](../02-knowledge-api/02_core-tools.md#29-reindex-调度契约异步--节点级-flush)。

---

## 四、不设 index.json 的理由

原设计用 `index.json` 作为 version 的权威存储，存在 crash 不一致风险：先写 .md 再更新 index.json，中间崩溃则 index.json 与实际文件不一致。改为 version 存入 .md frontmatter 后，数据一致性风险消除。

---

## 五、version 字段的两条路径（不要混淆）

`.md frontmatter` 里的 `version` 字段被两个独立机制消费，语义完全不同：

| 路径 | 字段位置 | 谁读 | 不匹配的处理 |
|---|---|---|---|
| **input 侧前置条件** | node frontmatter `input.knowledge[].min_version` | `opc_node_start` 时 state-server 读 | **reject node 启动**（正向调度信号，让路由先跑能产出新版本的节点） |
| **write 侧并发探测器** | `opc_knowledge_write({base_version})` 调用参数 | knowledge-server 写入时比对 | **3-way diff-and-merge**（详见 [../02-knowledge-api/02_core-tools.md § 2.10](../02-knowledge-api/02_core-tools.md#210-版本冲突与-3-way-diff-and-merge-契约)） |

**关键区分**：
- `min_version` 是**节点声明的硬约束**——输入不达版本就不该跑，reject 是对的
- `base_version` 是**写入时的乐观锁**——调用方传"我刚才读到的版本"，server 检测是否被并发改过；冲突走 merge 不走 reject

OPC 默认串行执行，正常路径下 `base_version` 几乎不会不匹配；diff-and-merge 主要兜底以下场景：sub-pipeline 挂起+恢复、跨 session 接管、L3 corrections 注入、用户手工编辑。

`opc_knowledge_delete` 是**例外**：即使加 base_version 也保留 reject 语义（删除无法 3-way diff，且后果重）。

---

## 相关文档

- [01_concept-and-storage.md](01_concept-and-storage.md) — 整体目录布局
- [../02-knowledge-api/03_initialization-flow.md](../02-knowledge-api/03_initialization-flow.md) — _refs 在初始化中的作用
