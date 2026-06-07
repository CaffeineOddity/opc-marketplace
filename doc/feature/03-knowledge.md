# 知识体系（opc-knowledge-server）

知识库通过 opc-knowledge-server MCP 服务提供 CRUD。知识跟随项目，按 **unit → section → subsection** 三层组织。文件系统是唯一真相源，version 存在 .md frontmatter 中。

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

## 四、MCP 工具 API

`opc-knowledge-server` 提供 8 个工具。

### 4.1 `opc_knowledge_open` — 打开知识点

```
参数: units: string[]
行为:
  ① 遍历每个 unit:
    → 已存在 → readdir 扫描 section/ → 读每个 .md 的 frontmatter 取 version
    → 不存在 → 创建 unit 目录
  ② 查找 _refs 关联的 unit:
    → 读取 .opc-knowledge.json 的 _refs
    → 关联 unit 标记为可读（Agent 可跨 unit 加载知识）
  ③ 汇总返回（version 来自 .md frontmatter）

返回:
{
  units: {
    "user-auth": {
      "login":    { "api": {version:2}, "ui": {version:1} },
      "register": { "api": {version:1} },
      "session":  { "api": {version:3}, "model": {version:2} }
    }
  },
  related: ["authorization"]
}
```

### 4.2 `opc_knowledge_get` — 读取单条知识

```
参数: unit, section, subsection, version? (可选)
返回: { content, version, updated_at }
若不存在则返回 null
若指定 version 则返回对应版本，不传返回最新
```

### 4.3 `opc_knowledge_get_batch` — 批量读取

```
参数: entries: [{unit, section, subsection, min_version?}]
返回: [{unit, section, subsection, content, version, updated_at, found}]
一次性读取多条知识，避免 Agent 逐条调用的 round-trip。
```

### 4.4 `opc_knowledge_write` — 写入知识

```
参数: unit, section, subsection, content, metadata?: {pipeline_id, node}
行为:
  → 检查 opc-knowledge/<unit>/<section>/<subsection>.md
    ├── 不存在 → 创建 section 目录 + 文件，version: 1
    └── 已存在 → 读旧内容 → Agent 分析合并 → 更新文件，version: v+1
  → 写入 frontmatter（version, updated_at, pipeline_id, node）
  → 内容覆盖写入（单文件原子操作）
  → 异步更新 .opc-knowledge.idx（失败不影响写入成功）
```

### 4.5 `opc_knowledge_delete` — 删除知识

```
参数: unit, section, subsection
行为:
  → 删除文件
  → 若 section 目录为空，删除目录
  → 异步更新 .opc-knowledge.idx
```

### 4.6 `opc_knowledge_list` — 列出知识结构

```
参数: unit, section? (可选)
行为: readdir 直接扫描目录结构，不读文件内容（5000+ 文件无性能问题）

返回:
  只传 unit → 返回该 unit 下所有 section 及 subsection 列表
  传 unit + section → 返回该 section 下所有 subsection 列表
  传 unit + subsection → 返回该 unit 下所有包含此 subsection 的 section

例: opc_knowledge_list("user-auth") → [login, register, logout, session]
    opc_knowledge_list("user-auth", "login") → [api, ui, architecture]
    opc_knowledge_list("user-auth", subsection="api") → [login/api, register/api, session/api]
```

### 4.7 `opc_knowledge_search` — 全文搜索

```
参数: query, unit? (可选)
返回: [{ unit, section, subsection, snippet, score }, ...]
全文搜索，走 .opc-knowledge.idx 索引。索引不存在时自动降级为遍历 .md 文件。
```

### 4.8 `opc_knowledge_reindex` — 重建搜索索引

```
参数: 无
行为:
  → 遍历 opc-knowledge/ 下所有 .md 文件
  → 读取 frontmatter + 正文
  → 重建 .opc-knowledge.idx
返回: { indexed: number, duration_ms: number }
```

---

## 五、初始化时序

管线启动时，`opc_pipeline_start` 内部串行执行：

```
① knowledge_list → readdir 扫描 opc-knowledge/ 下所有 unit/section/subsection
  → 返回已有 unit 列表 + 结构
  → 注入 task-analyzer 作为知识上下文

② task-analyzer（带知识上下文）→ 输出 complexity + knowledge_unit

②b (需修改的 unit ≥ 2 时) task-decomposition → 拆分分析

③ knowledge_open → 按子管线加载对应 unit
  → 已存在 → 复用，读 .md frontmatter 获取已有条目 + version
  → 不存在 → 创建 unit 目录
  → 自动加载 _refs 关联的 unit 作为可读上下文

④ brief-generation → 生成工作单

⑤ 创建 state.json
```

---

## 六、Node 声明与驱动

### 6.1 声明知识意图

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

### 6.2 执行流程

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

## 七、智能复用

Agent 对每个 `output.knowledge` 的目标路径：

1. 调用 `opc_knowledge_get` 检查 `unit/section/subsection` 是否存在
2. **不存在** → `opc_knowledge_write` 创建新文件
3. **已存在** → 读取当前内容 → 分析差异 → 合并/补充/覆盖 → `opc_knowledge_write` 更新

---

## 八、与 opc-state-server 的协作

| 场景 | knowledge-server 角色 | state-server 角色 |
|------|----------------------|-------------------|
| 管线启动 | knowledge_list → knowledge_open | 接收 knowledge_unit，写入 brief.md |
| node 执行 | get_batch 加载 input，write 产出 output | node_complete 校验 knowledge 文件存在性（L1） |
| 阶段回退 | 无感知（文件被快照覆盖） | phase_reset 从快照恢复 knowledge 文件 |
| 搜索 | search / list / reindex | 无感知 |

---

## 九、相关文档

- [02 意图识别与任务分析](02-intent-analysis.md) — knowledge_list → task-analysis
- [04 管线](04-pipeline.md) — 管线创建与状态管理
- [06 节点](06-node.md) — 节点定义中的 knowledge input/output 声明
