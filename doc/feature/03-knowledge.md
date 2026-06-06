# 知识体系

知识库通过 MCP 工具提供 CRUD，跟随项目，由 node 驱动写入。

## 三层知识体系

| 层 | 位置 | 性质 | 访问方式 |
|---|------|------|---------|
| knowledge | kit 内 | 静态领域知识，随 kit 分发 | 文件直读 |
| opc-knowledge | 项目内 | 阶段知识积累，随阶段推进写入 | MCP 工具 |
| opc-memory | 项目内 | 跨任务持久记忆，缓慢演进 | 用户手动维护 |

## MCP 工具

`opc-core` 提供知识 MCP 工具，所有 CRUD 通过 MCP 进行：

| 工具 | 说明 |
|------|------|
| `opc_knowledge_get` | 读取一条知识条目，返回内容和元信息 |
| `opc_knowledge_write` | 写入知识，自动判断创建或更新 |
| `opc_knowledge_delete` | 删除一条知识条目 |
| `opc_knowledge_list` | 列出当前 feature 下所有知识条目 |
| `opc_knowledge_search` | 全文搜索知识条目 |

### `opc_knowledge_get`

```
参数: feature, path
返回: { content, version, status, updated_at }
若不存在则返回 null
```

### `opc_knowledge_write` — 智能写入

Agent 调用 `opc_knowledge_write(feature, path, content)` 时，MCP 工具自动处理：

```
feature: user-auth
path: implementation/tech
content: (agent 产出的知识内容)

→ 检查 opc-knowledge/user-auth/implementation/tech.md 是否存在
   ├── 不存在 → 创建新条目，version: v1，status: draft
   └── 已存在 → 读取现有内容 → Agent 分析合并 → 写入更新，version: v+1，status: draft
```

创建和更新统一为一个 `write` 工具，Agent 不需要关心是创建还是更新，MCP 层自动处理。

### `opc_knowledge_delete`

```
参数: feature, path
硬删除知识条目和版本历史。
```

### `opc_knowledge_list`

```
参数: feature
返回: [{ path, version, status, updated_at }, ...]
```

### `opc_knowledge_search`

```
参数: query, feature? (可选)
返回: [{ feature, path, snippet, score }, ...]
全文搜索所有知识内容。
```

## 项目存储结构

```
opc-knowledge/
├── index.json              # 索引: { feature -> { path -> { version, status, updated_at } } }
├── user-auth/
│   ├── requirement/
│   │   └── main.md
│   ├── planning/
│   │   ├── api-design.md
│   │   └── architecture.md
│   └── implementation/
│       └── tech.md
└── payment/
    └── ...
```

`index.json` 记录所有知识条目的元信息，MCP 工具读写 index 来跟踪版本和状态。

## 知识状态

| 状态 | 含义 | 后续 node 可否加载 |
|------|------|-------------------|
| `draft` | 刚写入，未经验证 | 可加载但注明 "未验证" |
| `final` | 已由用户确认 | 正常加载 |

MCP 写入的知识默认为 `draft`。用户通过 `/opc-status` 将条目标记为 `final`。

## 版本管理

每次写入更新自动递增版本号（`v1`, `v2`, ...）。node 的 `input.knowledge` 可指定版本范围：

```yaml
input:
  - knowledge: requirement/main
    min_version: 2  # 至少 v2
```

若当前版本不满足条件，node 执行前会提示用户（知识需要更新）。

## Node 声明与驱动

### node 声明知识意图

```yaml
# node frontmatter
input:
  - knowledge: requirement/main
    min_version: 2

output:
  - knowledge: implementation/tech
```

- `input.knowledge` — 执行前需要这些知识。knowledge-load hook 自动读取并注入 Agent 上下文
- `output.knowledge` — 执行后应该产出这些知识。Agent 通过 MCP 工具显式写入

### 执行流程

```
knowledge-load hook
  → 读取 node input.knowledge 列表
  → 调用 opc_knowledge_get 逐条读取
  → 注入 Agent 上下文
       │
       ▼
Agent 执行 node 指令
  → 需要读取知识时，调用 opc_knowledge_get / opc_knowledge_list / opc_knowledge_search
  → 需要写入知识时，调用 opc_knowledge_write(feature, path, content)
  → MCP 工具自动处理创建 vs 更新
       │
       ▼
node-completion hook
  → state-manager 记录 output.knowledge 的实际产出路径
```

知识写入由 node 中运行的 Agent 显式调用 MCP 工具完成，**不通过 hook 自动保存**。

## 智能复用

Node 执行时，Agent 对每个 `output.knowledge` 的目标路径：

1. 调用 `opc_knowledge_get` 检查目标路径是否存在
2. **不存在** → 调用 `opc_knowledge_write` 创建新条目
3. **已存在** → 读取当前内容 → 分析新产出与现有内容的差异 → 调用 `opc_knowledge_write` 更新（合并、补充或覆盖）

MCP 工具的 `write` 操作统一处理创建和更新，Agent 只需提供完整的目标内容，工具层自动做版本递增和状态标记。
