# 知识体系（opc-knowledge-server）

知识库通过 opc-knowledge-server MCP 服务提供 CRUD。知识跟随项目，按 **unit → section → subsection** 三层组织。

## 概念模型

| 层级 | 中文 | 英文 | 例子 | 语义 |
|------|------|------|------|------|
| L1 知识点 | 单元 | unit / knowledge_unit | `user-auth` | 领域实体，共享核心模型 |
| L2 功能 | 节 | section | `login`, `session` | 实体内的功能边界 |
| L3 特性 | 小节 | subsection / aspect | `api`, `model`, `architecture` | 功能的某个方面 |

## 项目存储结构

```
opc-knowledge/
├── .opc-knowledge.json           ← 仅存储 _refs（跨 unit 依赖）
├── .opc-knowledge.idx            ← 搜索索引（派生数据，可重建）
├── user-auth/                    ← unit（知识点）
│   ├── login/                    ← section（功能）
│   │   ├── api.md                ← subsection（特性），version 在 frontmatter
│   │   ├── ui.md
│   │   └── architecture.md
│   ├── register/
│   │   ├── api.md
│   │   └── ui.md
│   ├── logout/
│   │   └── api.md
│   └── session/
│       ├── api.md
│       ├── model.md
│       └── architecture.md
├── authorization/
│   ├── role-management/
│   │   ├── api.md
│   │   └── model.md
│   └── permission/
│       ├── api.md
│       └── model.md
└── subscription/
    ├── plan/
    │   └── api.md
    └── billing/
        ├── api.md
        └── architecture.md
```

## 数据存储设计

**文件系统是唯一真相源（source of truth）。** 不设 `index.json`，避免 crash 导致索引与实际文件不一致。

### .md 文件 frontmatter

每个知识文件的 version 记录在自己的 frontmatter 中：

```yaml
---
version: 3
updated_at: "2026-06-06T10:30:00Z"
pipeline_id: "pipeline-001"
node: "api-design"
---
# 内容...
```

version 不依赖任何外部索引文件，写入只涉及单个 .md 文件的原子替换，无跨文件一致性问题。

### .opc-knowledge.json（仅 _refs）

```json
{
  "_refs": {
    "authorization": ["user-auth"],
    "cart": ["product", "user-auth"]
  }
}
```

`_refs` 记录 unit 间的语义依赖（如 "authorization 依赖 user-auth"），用于管线拆分时推导管线间依赖。与 version 无关，低频更新。

### .opc-knowledge.idx（搜索索引）

全文搜索索引，**纯派生数据**——所有信息来自 .md 文件 frontmatter 和正文。损坏或丢失时通过 `opc_knowledge_reindex` 全量重建，零数据丢失风险。

```
重建流程: 遍历所有 .md → 读 frontmatter + 正文 → 重建索引
```

## 三层知识体系

| 层 | 位置 | 性质 | 访问方式 |
|---|------|------|---------|
| knowledge | kit 内 | 静态领域知识，随 kit 分发 | 文件直读 |
| opc-knowledge | 项目内 | 阶段知识积累，unit → section → subsection | opc-knowledge-server MCP |
| opc-memory | 项目内 | 跨任务持久记忆，缓慢演进 | 用户手动维护 |

## 初始化时序

知识库的 list、open 按以下顺序执行（由 `opc_pipeline_start` 内部串行）：

```
① knowledge_list → readdir 扫描 opc-knowledge/ 下所有 unit/section/subsection
  → 返回: [user-auth(login,register,session), authorization(role-mgmt), ...]
  → 注入 task-analyzer 作为知识上下文

② task-analyzer（带知识上下文）→ 输出 complexity + knowledge_unit: ["user-auth"]

②b (需修改的 unit ≥ 2 时) task-decomposition → 拆分分析，推导管线间依赖

③ knowledge_open → 按子管线加载对应 unit
  → 遍历每个 unit:
    → 已存在 → 复用，读 .md frontmatter 返回已有条目 + version
    → 不存在 → 创建 unit 目录
  → 自动加载 _refs 关联的 unit 作为可读上下文

④ brief-generation → 生成工作单（brief.md）

⑤ 创建 state.json
```

## MCP 工具

`opc-knowledge-server` 提供 8 个工具，详细 API 规范见 [18 opc-knowledge-server](18-mcp-knowledge-server.md)。

| 工具 | 说明 |
|------|------|
| `opc_knowledge_open` | 打开知识点：已有则复用，没有则创建 |
| `opc_knowledge_get` | 读指定 unit/section/subsection 的文件内容（支持 version） |
| `opc_knowledge_get_batch` | 批量读取多条知识，一次调用完成 |
| `opc_knowledge_write` | 写入 .md 文件，自动判断创建或更新，version 写入 frontmatter |
| `opc_knowledge_delete` | 删除 subsection 文件，section 下文件删空则删 section |
| `opc_knowledge_list` | readdir 扫描目录结构，不读文件内容 |
| `opc_knowledge_search` | 全文搜索，走 .opc-knowledge.idx 索引 |
| `opc_knowledge_reindex` | 全量重建搜索索引 |

### `opc_knowledge_open`

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

### `opc_knowledge_get`

```
参数: unit, section, subsection, version? (可选)
返回: { content, version, updated_at }
若不存在则返回 null
若指定 version 则返回对应版本，不传返回最新
```

### `opc_knowledge_get_batch` — 批量读取

```
参数: entries: [{unit, section, subsection, min_version?}]
返回: [{unit, section, subsection, content, version, updated_at, found}]
  found=false 表示该条目不存在
一次性读取多条知识，避免 Agent 逐条调用的 round-trip。
```

### `opc_knowledge_write` — 智能写入

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

### `opc_knowledge_delete`

```
参数: unit, section, subsection
行为:
  → 删除文件
  → 若 section 目录为空，删除目录
  → 异步更新 .opc-knowledge.idx
```

### `opc_knowledge_list`

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

### `opc_knowledge_search`

```
参数: query, unit? (可选)
返回: [{ unit, section, subsection, snippet, score }, ...]
全文搜索，走 .opc-knowledge.idx 索引。索引不存在时自动降级为遍历 .md 文件。
```

### `opc_knowledge_reindex`

```
参数: 无
行为:
  → 遍历 opc-knowledge/ 下所有 .md 文件
  → 读取 frontmatter + 正文
  → 重建 .opc-knowledge.idx
返回: { indexed: number, duration_ms: number }
使用场景: .idx 损坏/丢失时重建；opc-knowledge/ 目录结构大幅变更后手动刷新。
```

## 版本管理

版本号存储在 .md 文件 frontmatter 的 `version` 字段中，每次写入自动递增（1, 2, ...）。node 的 `input.knowledge` 可指定版本范围：

```yaml
input:
  - knowledge: user-auth/session/api
    min_version: 2  # 至少 v2
```

版本是文件的固有属性，不依赖任何外部索引。文件删了版本就没了，文件在版本就在。

## Node 声明与驱动

### node 声明知识意图

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

### 执行流程

```
Agent 执行 node:
  → opc_knowledge_get_batch([...]) 批量加载 input.knowledge
    → 按 min_version 校验版本，不满足则提示
  → 执行 node 指令
  → 需要更多知识时调用 opc_knowledge_list / opc_knowledge_search
  → 产出知识时调用 opc_knowledge_write(unit, section, subsection, content)
    → MCP 工具自动处理创建 vs 更新
```

知识加载和写入都由 Agent 通过 MCP 工具显式完成。写入即生效，git 历史可追溯变更。

## 智能复用

Agent 对每个 `output.knowledge` 的目标路径：

1. 调用 `opc_knowledge_get` 检查 `unit/section/subsection` 是否存在
2. **不存在** → `opc_knowledge_write` 创建新文件
3. **已存在** → 读取当前内容 → 分析差异 → 合并/补充/覆盖 → `opc_knowledge_write` 写入更新
