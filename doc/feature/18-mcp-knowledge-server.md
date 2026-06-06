# opc-knowledge-server API 规范

知识库 MCP 服务，提供知识的 CRUD、搜索和版本管理。文件系统是唯一真相源（source of truth）。

---

## 一、服务概述

### 1.1 角色

opc-knowledge-server 负责项目知识库的读写，与 opc-state-server 独立部署。知识按 **unit → section → subsection** 三层组织，以 markdown 文件存储在项目的 `opc-knowledge/` 目录下。

### 1.2 工具速览

| # | 工具 | 说明 |
|---|------|------|
| 1 | `opc_knowledge_open` | 打开知识点：已有则复用（返回结构树 + version），没有则创建 |
| 2 | `opc_knowledge_get` | 读单条知识（支持指定 version） |
| 3 | `opc_knowledge_get_batch` | 批量读取多条知识，一次调用完成 |
| 4 | `opc_knowledge_write` | 写入 .md 文件，自动判断创建或更新，version 写入 frontmatter |
| 5 | `opc_knowledge_delete` | 删除 subsection 文件，自动清理空目录 |
| 6 | `opc_knowledge_list` | readdir 扫描目录结构，不读文件内容 |
| 7 | `opc_knowledge_search` | 全文搜索，走 .opc-knowledge.idx 派生索引 |
| 8 | `opc_knowledge_reindex` | 全量重建搜索索引 |

### 1.3 设计原则

- **文件系统为唯一真相源**：不设 `index.json`，version 存在 .md frontmatter 中，写入只涉及单文件原子操作，无跨文件一致性问题
- **派生索引可重建**：`.opc-knowledge.idx` 损坏或丢失时通过 `opc_knowledge_reindex` 全量重建，零数据丢失风险
- **知识属于项目**：切换目录 = 切换知识上下文

---

## 二、知识数据模型

### 2.1 三层体系

| 层级 | 英文 | 例子 | 语义 |
|------|------|------|------|
| L1 知识点 | unit / knowledge_unit | `user-auth` | 领域实体，共享核心模型 |
| L2 功能 | section | `login`, `session` | 实体内的功能边界 |
| L3 特性 | subsection / aspect | `api`, `model`, `architecture` | 功能的某个方面 |

### 2.2 文件存储结构

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

### 2.3 .md frontmatter

每个知识文件的 version 记录在自己的 frontmatter 中：

```yaml
---
version: 3
updated_at: "2026-06-06T10:30:00Z"
pipeline_id: "pipeline-001"
node: "api-design"
---
```

version 不依赖任何外部索引文件。文件删了版本就没了，文件在版本就在。

### 2.4 .opc-knowledge.json（仅 _refs）

```json
{
  "_refs": {
    "authorization": ["user-auth"],
    "cart": ["product", "user-auth"]
  }
}
```

`_refs` 记录 unit 间的语义依赖（如 "authorization 依赖 user-auth"），用于管线拆分时推导管线间依赖。低频更新。

### 2.5 .opc-knowledge.idx（搜索索引）

全文搜索索引，**纯派生数据**——所有信息来自 .md 文件 frontmatter 和正文。损坏或丢失时通过 `opc_knowledge_reindex` 全量重建。

### 2.6 取消 index.json 的理由

原设计用 `index.json` 作为 version 的权威存储，存在 crash 不一致风险：先写 .md 再更新 index.json，中间崩溃则 index.json 与实际文件不一致。改为 version 存入 .md frontmatter 后，写入只涉及单文件原子操作，数据一致性风险消除。

---

## 三、知识工具 API

### 3.1 `opc_knowledge_open` — 打开知识点

```
参数: units: string[]
行为:
  ① 遍历每个 unit:
    → 若存在 → readdir 扫描 section/ 目录 → 读每个 .md 的 frontmatter 取 version
    → 若不存在 → 创建 unit 目录

  ② 查找 _refs 关联的 unit:
    → 读取 .opc-knowledge.json 的 _refs，找出依赖当前 unit 的关联 unit
    → 关联 unit 标记为可读（Agent 可跨 unit 加载知识）

  ③ 汇总返回:
    → 已有知识的完整结构树（version 来自 .md frontmatter）
    → 关联 unit 列表

返回:
{
  units: {
    "user-auth": {
      "login":    { "api": {version:2}, "ui": {version:1} },
      "register": { "api": {version:1} },
      "logout":   { "api": {version:1} },
      "session":  { "api": {version:3}, "model": {version:2} }
    }
  },
  related: ["authorization"]
}
```

### 3.2 `opc_knowledge_get` — 读取单条知识

```
参数: unit, section, subsection, version? (可选)
返回: { content, version, updated_at }
若不存在则返回 null
若指定 version 则返回对应版本，不传返回最新
```

### 3.3 `opc_knowledge_get_batch` — 批量读取

```
参数: entries: [{unit, section, subsection, min_version?}]
返回: [{unit, section, subsection, content, version, updated_at, found}]
  found=false 表示该条目不存在
一次性读取多条知识，避免 Agent 逐条调用的 round-trip。
```

### 3.4 `opc_knowledge_write` — 写入知识

```
参数: unit, section, subsection, content, metadata?: {pipeline_id, node}
行为:
  → 检查 opc-knowledge/<unit>/<section>/<subsection>.md
    ├── 不存在 → 创建 section 目录 + 文件，version: 1
    └── 已存在 → 读旧内容 → Agent 分析合并 → 更新文件，version: v+1
  → 写入 frontmatter（version, updated_at, pipeline_id, node）
  → 内容覆盖写入（单文件原子操作，无跨文件一致性风险）
  → 异步更新 .opc-knowledge.idx（失败不影响写入成功）
```

### 3.5 `opc_knowledge_delete` — 删除知识

```
参数: unit, section, subsection
行为:
  → 删除文件
  → 若 section 目录为空，删除目录
  → 异步更新 .opc-knowledge.idx
```

### 3.6 `opc_knowledge_list` — 列出知识结构

```
参数: unit, section? (可选)
行为:
  - readdir 直接扫描目录结构，不读文件内容（5000+ 文件无性能问题）
  - 只传 unit → 返回该 unit 下所有 section 及 subsection 列表
  - 传 unit + section → 返回该 section 下所有 subsection 列表
  - 传 unit + subsection → 返回该 unit 下所有包含此 subsection 的 section（跨 section 聚合视图）

返回:
  例: opc_knowledge_list("user-auth")
      → [login, register, logout, session]

  例: opc_knowledge_list("user-auth", "login")
      → [api, ui, architecture]

  例: opc_knowledge_list("user-auth", subsection="api")
      → [login/api, register/api, logout/api, session/api]
```

### 3.7 `opc_knowledge_search` — 全文搜索

```
参数: query, unit? (可选)
返回: [{ unit, section, subsection, snippet, score }, ...]
全文搜索，走 .opc-knowledge.idx 索引。索引不存在时自动降级为遍历 .md 文件。
```

### 3.8 `opc_knowledge_reindex` — 重建搜索索引

```
参数: 无
行为:
  → 遍历 opc-knowledge/ 下所有 .md 文件
  → 读取 frontmatter + 正文
  → 重建 .opc-knowledge.idx
返回: { indexed: number, duration_ms: number }
使用场景: .idx 损坏/丢失时重建；opc-knowledge/ 目录结构大幅变更后手动刷新。
```

---

## 四、版本管理

版本号存储在 .md 文件 frontmatter 的 `version` 字段中，每次写入自动递增（1, 2, ...）。版本是文件的固有属性，不依赖任何外部索引。

node 的 `input.knowledge` 可指定版本范围：

```yaml
input:
  - knowledge: user-auth/session/api
    min_version: 2  # 至少 v2
```

`min_version` 校验在执行时由 Agent 完成：调用 `opc_knowledge_get_batch` 获取全部 input 知识后，逐项比对返回的 version 是否 ≥ min_version。不满足则阻止执行。

---

## 五、管线中的知识流转

### 5.1 初始化

管线启动时，`opc_pipeline_start` 内部串行执行：

```
① knowledge_list → readdir 扫描已有 unit/section/subsection
② task-analyzer（带知识上下文）→ 输出 complexity + knowledge_unit
③ (需修改的 unit ≥ 2 时) task-decomposition → 拆分分析
④ knowledge_open → 按子管线加载对应 unit
```

### 5.2 node 声明

```yaml
# node frontmatter
input:
  - knowledge: user-auth/login/api
  - knowledge: user-auth/session/api
    min_version: 2

output:
  - knowledge: user-auth/session/api         # 更新已有特性
  - knowledge: user-auth/session/architecture  # 新增特性
```

路径格式：`<unit>/<section>/<subsection>`

### 5.3 执行流程

```
Agent 执行 node:
  → opc_knowledge_get_batch([...]) 批量加载 input.knowledge
    → 按 min_version 校验版本，不满足则提示
  → 执行 node 指令
  → 需要更多知识时调用 opc_knowledge_list / opc_knowledge_search
  → 产出知识时调用 opc_knowledge_write(unit, section, subsection, content)
    → MCP 工具自动处理创建 vs 更新
```

### 5.4 智能复用

Agent 对每个 `output.knowledge` 的目标路径：

1. 调用 `opc_knowledge_get` 检查 `unit/section/subsection` 是否存在
2. **不存在** → `opc_knowledge_write` 创建新文件
3. **已存在** → 读取当前内容 → 分析差异 → 合并/补充/覆盖 → `opc_knowledge_write` 写入更新

### 5.5 快照集成

`opc_phase_confirm` 时，state-server 扫描节点 `output.knowledge` 路径，将已有知识文件复制到 `.opc/snapshots/` 作为快照。`opc_phase_reset` 时从快照恢复。详见 [17 opc-state-server](17-mcp-state-server.md)。

---

## 六、与 opc-state-server 的协作

| 场景 | knowledge-server 角色 | state-server 角色 |
|------|----------------------|-------------------|
| 管线启动 | knowledge_list → knowledge_open | 接收 knowledge_unit，写入 brief.md |
| node 执行 | get_batch 加载 input，write 产出 output | node_complete 校验 knowledge 文件存在性（L1） |
| 阶段回退 | 无感知（文件被快照覆盖） | phase_reset 从快照恢复 knowledge 文件 |
| 搜索 | search / list / reindex | 无感知 |

两个服务独立部署，通过 MCP 协议调用。knowledge-server 不感知管线状态，只负责知识文件 CRUD。
