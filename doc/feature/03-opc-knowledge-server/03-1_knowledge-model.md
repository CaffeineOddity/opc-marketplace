# 03-1 知识模型与存储

知识库按 **unit → section → subsection** 三层组织。文件系统是唯一真相源，version 存在 .md frontmatter 中。

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

### 2.1 .md frontmatter

```yaml
---
version: 3
updated_at: "2026-06-06T10:30:00Z"
pipeline_id: "pipeline-001"
node: "api-design"
---
```

写入只涉及单文件原子操作，无跨文件一致性问题。文件删了版本就没了，文件在版本就在。

### 2.2 .opc-knowledge.json（仅 _refs）

```json
{
  "_refs": {
    "authorization": ["user-auth"],
    "cart": ["product", "user-auth"]
  }
}
```

记录 unit 间的语义依赖，用于管线拆分时推导管线间依赖。低频更新。

### 2.3 .opc-knowledge.idx（搜索索引）

全文搜索索引，纯派生数据。损坏或丢失时通过 `opc_knowledge_reindex` 全量重建，零数据丢失风险。

### 2.4 不设 index.json 的理由

原设计用 `index.json` 作为 version 的权威存储，存在 crash 不一致风险：先写 .md 再更新 index.json，中间崩溃则 index.json 与实际文件不一致。改为 version 存入 .md frontmatter 后，数据一致性风险消除。

---

## 三、版本管理

版本号存储在 .md frontmatter 的 `version` 字段，每次写入自动递增（1, 2, ...）。

node 的 `input.knowledge` 可指定版本范围：

```yaml
input:
  - knowledge: user-auth/session/api
    min_version: 2  # 至少 v2
```

`min_version` 校验在 `opc_node_start` 时由 state-server 强制执行：调用 `opc_knowledge_get_batch` 获取全部 input 知识后，逐项比对返回的 version 是否 ≥ min_version。不满足则阻止 node 启动。

---

## 四、Node 声明与驱动

### 4.1 声明知识意图

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

### 4.2 执行流程

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

## 五、智能复用

Agent 对每个 `output.knowledge` 的目标路径：

1. 调用 `opc_knowledge_get` 检查 `unit/section/subsection` 是否存在
2. **不存在** → `opc_knowledge_write` 创建新文件
3. **已存在** → 读取当前内容 → 分析差异 → 合并/补充/覆盖 → `opc_knowledge_write` 更新

---

## 六、相关文档

- [03-2 知识 API](03-2_knowledge-api.md) — 8 个 MCP 工具完整规范
- [02-4 节点](02-4_node.md) — 节点定义中的 knowledge input/output 声明
