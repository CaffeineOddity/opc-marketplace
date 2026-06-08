# 02 核心 API

> 本文档是 [知识 API 总览](../02_knowledge-api-overview.md) 的子文档。其他子文档：
> [工具速览](01_tools-overview.md) · [初始化时序](03_initialization-flow.md) · [与 state-server 协作](04_collaboration.md)

---

## 2.1 `opc_knowledge_open` — 打开知识点

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

---

## 2.2 `opc_knowledge_get` — 读取单条知识

```
参数: unit, section, subsection, version? (可选)
返回: { content, version, updated_at }
若不存在则返回 null
若指定 version 则返回对应版本，不传返回最新
```

---

## 2.3 `opc_knowledge_get_batch` — 批量读取

```
参数: entries: [{unit, section, subsection, min_version?}]
返回: [{unit, section, subsection, content, version, updated_at, found}]
一次性读取多条知识，避免 Agent 逐条调用的 round-trip。
```

---

## 2.4 `opc_knowledge_write` — 写入知识

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

---

## 2.5 `opc_knowledge_delete` — 删除知识

```
参数: unit, section, subsection
行为:
  → 删除文件
  → 若 section 目录为空，删除目录
  → 异步更新 .opc-knowledge.idx
```

---

## 2.6 `opc_knowledge_list` — 列出知识结构

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

---

## 2.7 `opc_knowledge_search` — 全文搜索

```
参数: query, unit? (可选)
返回: [{ unit, section, subsection, snippet, score }, ...]
全文搜索，走 .opc-knowledge.idx 索引。索引不存在时自动降级为遍历 .md 文件。
```

---

## 2.8 `opc_knowledge_reindex` — 重建搜索索引

```
参数: 无
行为:
  → 遍历 opc-knowledge/ 下所有 .md 文件
  → 读取 frontmatter + 正文
  → 重建 .opc-knowledge.idx
返回: { indexed: number, duration_ms: number }
```

---

## 相关文档

- [01_tools-overview.md](01_tools-overview.md) — 工具速览
- [03_initialization-flow.md](03_initialization-flow.md) — 流程启动中的工具时序
- [04_collaboration.md](04_collaboration.md) — 与 state-server 的协作分工
