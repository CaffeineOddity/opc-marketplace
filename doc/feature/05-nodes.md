# 节点（Node）

不用预设流程模板。阶段根据任务信号自主选择节点，node-resolver 自动解析依赖、拓扑排序、生成执行计划。

## 节点定义

每个节点一个 markdown 文件，frontmatter + 执行指令：

```markdown
---
name: tdd-implementation
phase: 04-implementation
description: TDD 驱动的后端功能实现，RED → GREEN → REFACTOR
tags: [backend, database]
agents:
  primary: [backend-engineer]
  optional: [database-engineer]

skills: [test-driven-development]
mode: parallel

input:
  - artifact: spec.md
  - artifact: architecture.md
  - knowledge: requirement/main

output:
  - artifacts: [tests/, src/]
  - knowledge: implementation/tech

---

## TDD 功能实现

### RED —— 先写失败测试
1. 根据 spec.md 中的验收标准，编写测试用例
2. 运行测试，确认测试失败

### GREEN —— 最小实现
1. 编写刚好能让测试通过的代码
2. 不要过度设计

### REFACTOR —— 重构
1. 消除重复代码，改善命名和结构
2. 运行测试，确认仍然全部通过

### Verification
- 运行 /verification-before-completion
```

## 字段定义

### 基础

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 节点唯一标识，kebab-case |
| `phase` | string | 是 | 所属阶段，如 `04-implementation` |
| `description` | string | 是 | 节点描述。同时用于节点选择列表展示和语义匹配 |
| `tags` | string[] | 是 | 技术标签。与任务 tags 求交集，交集为 0 的节点默认排除 |
| `mode` | string | 是 | `parallel` — 节点内多个 Agent 并行；`sequential` — 按 primary → optional 顺序执行 |

### 依赖

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `input` | list | 否 | 输入。执行前必须就绪的 artifact / knowledge |
| `output` | list | 是 | 输出。完成后产出的 artifact / knowledge |

### Agent

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agents.primary` | string[] | 是 | 核心 Agent。不可用则节点无法执行 |
| `agents.optional` | string[] | 否 | 辅助 Agent。可用则加入，不可用则跳过 |
| `skills` | string[] | 否 | 需要加载的 Skill 列表 |

### `input` 条目格式

```yaml
input:
  - artifact: spec.md                # 文件名
  - artifact: architecture.md
  - knowledge: requirement/main      # 分类/文档名
    min_version: 2                   # 可选，最低版本号
```

### `output` 条目格式

```yaml
output:
  - artifacts: [tests/, src/]        # 产出路径
  - knowledge: implementation/tech   # 写入的分类/文档名
```

---

## 信号匹配机制

两层筛选，由 node-resolver 执行：

1. **tag 交集过滤**：任务 tags 与节点 tags 求交集。交集为 0 的节点默认排除。
2. **语义匹配**：任务 description 与节点 description 做语义相似度计算，降序排列。

```
任务: "搞一下登录功能"
task-analyzer: { description: "实现用户登录认证功能", tags: [backend, auth] }

tag 过滤:
  tdd-implementation:  tags [backend, database]  → 交集 [backend]  → 候选
  frontend-component:  tags [frontend]           → 交集 []        → 跳过

语义匹配:
  "实现用户登录认证功能" vs "TDD 驱动的后端功能实现" → 相似度 0.78
  "实现用户登录认证功能" vs "构建前端 UI 组件"       → 相似度 0.18
```

## 并发执行与文件域隔离

node 的 `mode` 字段控制 node 内部 Agent 的执行方式：

| mode | 含义 |
|------|------|
| `parallel` | node 内多个 Agent 可以并行工作 |
| `sequential` | node 内 Agent 按顺序执行 |

跨 node 的并行由 resolver 的 Group 机制控制。并行执行时，resolver 检查每个 node 的 `output.artifacts` 和文件操作范围是否重叠：

```
Group 1: [backend-endpoint → src/api/], [frontend-component → src/components/]
         文件域无重叠 → 安全并行 ✓

Group 2: [tdd-implementation → src/, tests/], [backend-endpoint → src/api/]
         文件域重叠 src/ → 标记冲突，自动降级为串行
```

## 节点依赖解析

node-resolver.ts 输入选中节点列表，通过匹配 output → input 自动推导依赖：

```
输入: [api-design, tdd-implementation, security-review]

节点 output → input 匹配:
  api-design.output:     [spec.md, architecture.md]
  tdd-implementation.input:  [spec.md, architecture.md]  → 隐式依赖 api-design
  security-review.input: []                              → 无依赖

拓扑排序:
  Group 1: [api-design]                                 (先产出 spec)
  Group 2: [tdd-implementation]                          (需要 spec)
  Group 3: [security-review, ...]  ← 可与 Group 2 并行 (无共同依赖)
```

## 阶段节点选择

```
任务: "实现用户认证系统"
task-analyzer: { 
  description: "实现用户认证系统，包括登录注册和会话管理",
  tags: [backend, auth, database]
}

04-implementation 阶段匹配:

  tag 交集过滤:
    tdd-implementation:  tags [backend, database]  → 交集 2 → 候选
    backend-endpoint:    tags [backend, database]  → 交集 2 → 候选
    auth-integration:    tags [auth, backend]      → 交集 2 → 候选
    security-review:     tags [security]           → 交集 0 → 推荐 (无交集，但 auth 任务通常需要)
    frontend-component:  tags [frontend]           → 交集 0 → 跳过

  语义匹配 (任务 description vs 节点 description):
    auth-integration:      0.92 → 候选
    tdd-implementation:    0.78 → 候选
    backend-endpoint:      0.75 → 候选
    security-review:       0.68 → 推荐
    frontend-component:    0.15 → 跳过

用户确认: [tdd-implementation, backend-endpoint, auth-integration, security-review]

resolver (匹配 output → input 自动推导依赖):
  auth-integration.input 需要 backend-endpoint.output → 串行
  security-review.input 需要 tdd-implementation.output → 串行

执行计划:
  Group 1: [backend-endpoint, tdd-implementation]  并行 (文件域无重叠)
  Group 2: [auth-integration]                       串行
  Group 3: [security-review]                        串行
```

## plugin.json 声明式能力

每个 kit 通过 plugin.json 声明自己提供哪些 agent、skill、node：

```json
{
  "name": "dev-kit",
  "depends": ["opc-core"],
  "capabilities": {
    "phases": ["04-implementation"],
    "agents": [
      { "name": "frontend-engineer", "model": "sonnet", "expertise": ["react", "nextjs"] },
      { "name": "backend-engineer", "model": "sonnet", "expertise": ["api", "database"] }
    ],
    "skills": ["scaffold-nextjs", "build-api", "auth-system", "code-review"],
    "nodes": [
      "scaffold", "api-design", "database-schema", "tdd-implementation",
      "frontend-component", "backend-endpoint", "auth-integration",
      "security-review", "performance-optimize"
    ]
  }
}
```

`capability-discovery` hook 在 SessionStart 时扫描已安装 kit 的 plugin.json，动态构建 agent 目录、skill 索引和节点注册表。
