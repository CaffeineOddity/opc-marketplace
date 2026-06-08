# 知识模型与存储

知识库按 **unit → section → subsection** 三层组织。文件系统是唯一真相源，version 存在 .md frontmatter 中。

本文档已按主题拆分为多个子文档，本文是**聚合索引**，附端到端时序图与决策流程图。

---

## 知识写入与版本递增时序图

`opc_knowledge_open` → Agent 读 → 智能合并 → `opc_knowledge_write` → version+1 → 异步索引刷新：

```mermaid
sequenceDiagram
    autonumber
    actor A as Sub-Agent
    participant KS as knowledge-server
    participant FS as opc-knowledge/<br/>(文件系统)
    participant IDX as .opc-knowledge.idx

    Note over A,IDX: ① 加载已有知识
    A->>KS: opc_knowledge_get_batch<br/>([{unit, section, sub, min_version}])
    KS->>FS: 读 .md + frontmatter
    KS->>KS: 校验 version ≥ min_version
    alt 版本不满足
        KS-->>A: 阻止：min_version 未达
    else 通过
        KS-->>A: content + version
    end

    Note over A,IDX: ② 智能复用判定
    A->>KS: opc_knowledge_get(unit, section, sub)
    KS->>FS: stat 检查文件
    alt 文件存在
        KS-->>A: content + version=v
        A->>A: 分析差异 + 合并/补充/覆盖
    else 不存在
        KS-->>A: null
        A->>A: 准备新内容
    end

    Note over A,IDX: ③ 写入
    A->>KS: opc_knowledge_write({content, metadata})
    KS->>FS: 单文件原子写<br/>(frontmatter: version=v+1<br/>updated_at, pipeline_id, node)
    KS-->>A: ok
    KS-->>IDX: 异步刷新索引<br/>(失败不影响写入)

    Note over A,IDX: ④ 索引降级 / 重建
    opt 索引损坏
        A->>KS: opc_knowledge_search(query)
        KS->>IDX: 读索引
        IDX-->>KS: 失败/缺失
        KS->>FS: 降级遍历 .md
        KS-->>A: 搜索结果

        A->>KS: opc_knowledge_reindex()
        KS->>FS: 遍历全部 .md
        KS->>IDX: 全量重建
        KS-->>A: { indexed, duration_ms }
    end
```

---

## 智能复用决策流

Agent 对每个 `output.knowledge` 路径的写入策略：

```mermaid
flowchart TD
    Start([Agent 准备写 output.knowledge]) --> Get[opc_knowledge_get<br/>unit/section/sub]
    Get --> Exist{文件存在?}

    Exist -->|否| New[准备新内容]
    Exist -->|是| Read[读旧内容<br/>+ frontmatter.version=v]

    Read --> Diff[分析差异]
    Diff --> Mode{合并策略}
    Mode -->|互补| Merge[补充 / 合并]
    Mode -->|冲突| Override[覆盖]
    Mode -->|无变化| Skip[跳过写入]

    New --> Write1[opc_knowledge_write<br/>version=1]
    Merge --> Write2[opc_knowledge_write<br/>version=v+1]
    Override --> Write2

    Write1 --> Frontmatter[写 frontmatter:<br/>version, updated_at,<br/>pipeline_id, node]
    Write2 --> Frontmatter
    Skip --> End0([结束])

    Frontmatter --> Async[异步刷新 .opc-knowledge.idx]
    Async --> EndW([写入成功])
```

---

## 子文档导航

| 子文档 | 内容 |
|------|------|
| [01_concept-and-storage.md](01_concept-and-storage.md) | 三层概念模型 + opc-knowledge/ 目录布局 |
| [02_metadata-files.md](02_metadata-files.md) | `.md frontmatter` / `.opc-knowledge.json` / `.opc-knowledge.idx` |
| [03_node-driven-and-versioning.md](03_node-driven-and-versioning.md) | node frontmatter 的 input/output 声明、min_version 校验、创建 vs 更新策略 |

---

## 核心设计原则

- **文件系统单一真相源**：version 存 .md frontmatter，杜绝 index.json 与文件不一致的 crash 风险
- **索引零数据风险**：`.opc-knowledge.idx` 是派生数据，可随时 `opc_knowledge_reindex` 全量重建
- **min_version 强制校验**：`opc_node_start` 阶段拦截，保证 node 输入的版本契约
- **跨 unit 依赖通过 _refs 显式声明**：拆分管线时由 state-server 读 _refs 推导依赖

---

## 相关文档

- [知识 API](../02-knowledge-api/00_overview.md) — 8 个 MCP 工具完整规范
- [节点](../../02-opc-state-server/04-node/00_overview.md) — 节点定义中的 knowledge input/output 声明
