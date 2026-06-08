# 03 版本管理

> 本文档是 [知识模型总览](00_overview.md) 的子文档。其他子文档：
> [概念模型与存储结构](01_concept-and-storage.md) · [元数据文件](02_metadata-files.md) · [Node 声明与驱动](04_node-driven.md) · [智能复用](05_smart-reuse.md)

---

版本号存储在 .md frontmatter 的 `version` 字段，每次写入自动递增（1, 2, ...）。

node 的 `input.knowledge` 可指定版本范围：

```yaml
input:
  - knowledge: user-auth/session/api
    min_version: 2  # 至少 v2
```

`min_version` 校验在 `opc_node_start` 时由 state-server 强制执行：调用 `opc_knowledge_get_batch` 获取全部 input 知识后，逐项比对返回的 version 是否 ≥ min_version。不满足则阻止 node 启动。

---

## 相关文档

- [02_metadata-files.md](02_metadata-files.md) — version 在 frontmatter 中的位置
- [../02-knowledge-api/02_core-tools.md](../02-knowledge-api/02_core-tools.md) — `opc_knowledge_get_batch` 接口
- [../../02-opc-state-server/04-node/02_field-spec.md](../../02-opc-state-server/04-node/02_field-spec.md) — node input 字段
