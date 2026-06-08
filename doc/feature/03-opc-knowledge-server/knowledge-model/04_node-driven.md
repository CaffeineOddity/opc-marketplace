# 04 Node 声明与驱动

> 本文档是 [知识模型总览](../01_knowledge-model-overview.md) 的子文档。其他子文档：
> [概念模型与存储结构](01_concept-and-storage.md) · [元数据文件](02_metadata-files.md) · [版本管理](03_versioning.md) · [智能复用](05_smart-reuse.md)

---

## 一、声明知识意图

```yaml
# node frontmatter
input:
  - knowledge: user-auth/login/api
  - knowledge: user-auth/session/api
    min_version: 2

output:
  - knowledge: user-auth/session/api           # 更新已有特性
  - knowledge: user-auth/session/architecture  # 新增特性
```

路径格式：`<unit>/<section>/<subsection>`

---

## 二、执行流程

```
Agent 执行 node:
  → opc_knowledge_get_batch([...]) 批量加载 input.knowledge
    → 按 min_version 校验版本，不满足则阻止
  → 执行 node 指令
  → 需要更多知识时调用 opc_knowledge_list / opc_knowledge_search
  → 产出知识时调用 opc_knowledge_write(unit, section, subsection, content)
    → MCP 工具自动处理创建 vs 更新
```

---

## 相关文档

- [05_smart-reuse.md](05_smart-reuse.md) — 创建 vs 更新的判定
- [../knowledge-api/02_core-tools.md](../knowledge-api/02_core-tools.md) — knowledge 工具细节
- [../../02-opc-state-server/04_node-overview.md](../../02-opc-state-server/04_node-overview.md) — 节点执行总览
