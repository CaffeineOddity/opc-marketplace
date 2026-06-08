# 01 工具速览

> 本文档是 [知识 API 总览](00_overview.md) 的子文档。其他子文档：
> [核心工具](02_core-tools.md) · [初始化时序](03_initialization-flow.md) · [与 state-server 协作](04_collaboration.md)

---

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

## 相关文档

- [02_core-tools.md](02_core-tools.md) — 8 个工具完整规范
