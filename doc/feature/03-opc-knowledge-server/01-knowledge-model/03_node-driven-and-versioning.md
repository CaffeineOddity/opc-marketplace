# 03 Node 声明、版本契约与写入策略

> 本文档是 [知识模型总览](00_overview.md) 的子文档。其他子文档：
> [概念模型与存储结构](01_concept-and-storage.md) · [元数据文件](02_metadata-files.md)

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

## 三、版本契约

版本号存储在 .md frontmatter 的 `version` 字段，每次写入自动递增（1, 2, ...）。

node 的 `input.knowledge` 可指定版本范围：

```yaml
input:
  - knowledge: user-auth/session/api
    min_version: 2  # 至少 v2
```

`min_version` 校验在 `opc_node_start` 时由 state-server 强制执行：调用 `opc_knowledge_get_batch` 获取全部 input 知识后，逐项比对返回的 version 是否 ≥ min_version。不满足则阻止 node 启动。

---

## 四、写入策略：创建 vs 更新

Agent 对每个 `output.knowledge` 的目标路径：

1. 调用 `opc_knowledge_get` 检查 `unit/section/subsection` 是否存在
2. **不存在** → `opc_knowledge_write` 创建新文件
3. **已存在** → 读取当前内容 → 分析差异 → 合并/补充/覆盖 → `opc_knowledge_write` 更新

---

## 相关文档

- [02_metadata-files.md](02_metadata-files.md) — version 在 frontmatter 中的位置
- [../02-knowledge-api/02_core-tools.md](../02-knowledge-api/02_core-tools.md) — `opc_knowledge_get` / `opc_knowledge_get_batch` / `opc_knowledge_write` 接口
- [../../02-opc-state-server/04-node/02_field-spec.md](../../02-opc-state-server/04-node/02_field-spec.md) — node input/output 字段
