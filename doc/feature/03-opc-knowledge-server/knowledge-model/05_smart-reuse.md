# 05 智能复用

> 本文档是 [知识模型总览](../01_knowledge-model-overview.md) 的子文档。其他子文档：
> [概念模型与存储结构](01_concept-and-storage.md) · [元数据文件](02_metadata-files.md) · [版本管理](03_versioning.md) · [Node 声明与驱动](04_node-driven.md)

---

Agent 对每个 `output.knowledge` 的目标路径：

1. 调用 `opc_knowledge_get` 检查 `unit/section/subsection` 是否存在
2. **不存在** → `opc_knowledge_write` 创建新文件
3. **已存在** → 读取当前内容 → 分析差异 → 合并/补充/覆盖 → `opc_knowledge_write` 更新

---

## 相关文档

- [04_node-driven.md](04_node-driven.md) — 知识声明与执行流程
- [../knowledge-api/02_core-tools.md](../knowledge-api/02_core-tools.md) — `opc_knowledge_get` / `opc_knowledge_write` 接口
