# 03-2 知识 MCP API

opc-knowledge-server 提供 8 个工具用于知识的 CRUD、版本管理和全文搜索。知识概念模型（三层结构、存储格式、版本管理）详见 [03-1 知识模型](03-1_knowledge-model.md)。

---

## 一、工具速览（8 个）

| # | 工具 | 说明 |
|---|------|------|
| 1 | `opc_knowledge_open` | 打开知识点：已有则返回结构树+version，没有则创建 |
| 2 | `opc_knowledge_get` | 读单条知识（支持指定 version） |
| 3 | `opc_knowledge_get_batch` | 批量读取多条知识 |
| 4 | `opc_knowledge_write` | 写入 .md，自动判断创建/更新，version 写入 frontmatter |
| 5 | `opc_knowledge_delete` | 删除 subsection，自动清理空目录 |
| 6 | `opc_knowledge_list` | readdir 扫描目录结构 |
| 7 | `opc_knowledge_search` | 全文搜索，走 .opc-knowledge.idx |
| 8 | `opc_knowledge_reindex` | 全量重建搜索索引 |

---

## 二、核心 API

### 2.1 `opc_knowledge_open` — 打开知识点

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

### 2.2 `opc_knowledge_get` — 读取单条知识

```
参数: unit, section, subsection, version? (可选)
返回: { content, version, updated_at }
若不存在则返回 null
若指定 version 则返回对应版本，不传返回最新
```

### 2.3 `opc_knowledge_get_batch` — 批量读取

```
参数: entries: [{unit, section, subsection, min_version?}]
返回: [{unit, section, subsection, content, version, updated_at, found}]
一次性读取多条知识，避免 Agent 逐条调用的 round-trip。
```

### 2.4 `opc_knowledge_write` — 写入知识

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

### 2.5 `opc_knowledge_delete` — 删除知识

```
参数: unit, section, subsection
行为:
  → 删除文件
  → 若 section 目录为空，删除目录
  → 异步更新 .opc-knowledge.idx
```

### 2.6 `opc_knowledge_list` — 列出知识结构

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

### 2.7 `opc_knowledge_search` — 全文搜索

```
参数: query, unit? (可选)
返回: [{ unit, section, subsection, snippet, score }, ...]
全文搜索，走 .opc-knowledge.idx 索引。索引不存在时自动降级为遍历 .md 文件。
```

### 2.8 `opc_knowledge_reindex` — 重建搜索索引

```
参数: 无
行为:
  → 遍历 opc-knowledge/ 下所有 .md 文件
  → 读取 frontmatter + 正文
  → 重建 .opc-knowledge.idx
返回: { indexed: number, duration_ms: number }
```

---

## 三、初始化时序

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

## 四、与 opc-state-server 的协作

| 场景 | knowledge-server 角色 | state-server 角色 |
|------|----------------------|-------------------|
| 管线启动 | knowledge_list → knowledge_open | 接收 knowledge_unit，写入 brief.md |
| node 执行 | get_batch 加载 input，write 产出 output | node_complete 校验 knowledge 文件存在性（L1） |
| 阶段回退 | 无感知（文件被快照覆盖） | phase_reset 从快照恢复 knowledge 文件 |
| 搜索 | search / list / reindex | 无感知 |

---

## 五、相关文档

- [03-1 知识模型](03-1_knowledge-model.md) — 概念模型、存储结构、版本管理
- [02-4 节点](02-4_node.md) — 节点定义中的 knowledge input/output 声明
- [02-2 管线](02-2_pipeline.md) — 管线创建与状态管理
