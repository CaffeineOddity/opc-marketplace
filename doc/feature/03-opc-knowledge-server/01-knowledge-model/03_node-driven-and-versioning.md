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
  → opc_knowledge_read({mode:"batch", entries:[...]}) 批量加载 input.knowledge
    → 按 min_version 校验版本，不满足则阻止
  → 执行 node 指令
  → 需要更多知识时调用 opc_knowledge_read({mode:"list"|"search"})
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

`min_version` 校验在 `opc_node_start` 时由 state-server 强制执行：调用 `opc_knowledge_read({mode:"batch"})` 获取全部 input 知识后，逐项比对返回的 version 是否 ≥ min_version。不满足则阻止 node 启动。

---

## 四、写入策略：创建 vs 更新

Agent 对每个 `output.knowledge` 的目标路径：

1. 调用 `opc_knowledge_read({mode:"single"})` 检查 `unit/section/subsection` 是否存在，并记下 `current_version`（如存在）
2. **不存在** → `opc_knowledge_write` 创建新文件（不传 `base_version`，merge_status 为 `clean`）
3. **已存在** → 读取当前内容 → 分析差异 → 合并/补充/覆盖 → `opc_knowledge_write({base_version: <第 1 步读到的 version>})` 更新

### 关于 base_version 与并发写

Agent 写入时**应当**回传 `base_version`（即第 1 步读到的 version），让 knowledge-server 检测期间是否被并发修改：

- 正常路径（同一 sub-agent 串行执行）：`base_version == current_version` → 直接 `v+1`，`merge_status: "clean"`
- 边界场景（sub-pipeline 挂起+恢复、跨 session 接管、L3 corrections 注入）：`base_version < current_version` → 走 3-way diff-and-merge

详见 [../02-knowledge-api/02_core-tools.md § 2.10](../02-knowledge-api/02_core-tools.md#210-版本冲突与-3-way-diff-and-merge-契约)。

> **不要把 `base_version` 和 `min_version` 混为一谈**：`min_version` 是 node 声明的**输入前置条件**（不达版本 reject 节点启动）；`base_version` 是 write 时的**乐观锁**（不匹配走 merge）。两者在 .md frontmatter 的 `version` 字段上读出同一个数字，但消费时机和失败处理完全不同。

---

## 相关文档

- [02_metadata-files.md](02_metadata-files.md) — version 在 frontmatter 中的位置
- [../02-knowledge-api/02_core-tools.md](../02-knowledge-api/02_core-tools.md) — `opc_knowledge_read` (5 modes) / `opc_knowledge_write` 接口
- [../../02-opc-state-server/04-node/02_field-spec.md](../../02-opc-state-server/04-node/02_field-spec.md) — node input/output 字段
