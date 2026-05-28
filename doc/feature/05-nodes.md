# 节点（Node）

不用预设流程模板。阶段根据任务信号自主选择节点，node-resolver 自动解析依赖、拓扑排序、生成执行计划。

## 节点定义

每个节点一个 markdown 文件，frontmatter + 执行指令：

```markdown
---
name: tdd-implementation
stage: 04-implementation
description: TDD 驱动的功能实现，RED → GREEN → REFACTOR

requires:
  - type: artifact
    value: spec.md
  - type: artifact
    value: architecture.md
  - type: knowledge
    category: requirement
    doc: main

provides:
  - artifacts: [tests/, src/]
  - knowledge:
      category: implementation
      doc: tech

agents:
  primary: [backend-engineer, frontend-engineer]
  optional: [database-engineer]
skills: [test-driven-development]
mode: parallel

entry_gates: [spec-exists, architecture-reviewed]
exit_gates: [tests-passing, coverage-80pct, verification-complete]

depends_on: []
conflicts_with: []
enhances: []

effort: medium
reusable: true

signals:
  match_description: "涉及后端功能实现、API 开发和数据库操作的任务"
  tags: [backend, database]
  keywords: [实现, 开发, implement, build, feature, 功能]
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

## 信号匹配机制（两层筛选）

1. **关键词初筛**（快速过滤）：`keywords` 字段做字符串匹配，快速排除不相关节点，缩小候选集。关键词为空的节点不过滤。
2. **语义匹配**（精准排序）：将 task-analyzer 输出的任务描述与每个候选节点 `signals.match_description` 做语义相似度计算（embedding 或 haiku 打分），选出 Top-N 节点。

```
任务: "搞一下登录功能"
→ 关键词初筛: 大部分节点无匹配，不过滤
→ 语义匹配: "搞一下登录功能" vs "涉及后端功能实现、API 开发和数据库操作的任务" → 相似度 0.72
→ 语义匹配: "搞一下登录功能" vs "构建用户界面组件、实现响应式布局" → 相似度 0.18
→ 选中: tdd-implementation (0.72), backend-endpoint (0.68), auth-integration (0.85)
```

这种方式对口语化表达（"搞一下"、"写个"、"搭一个"）也能正常工作，不需要维护庞大的关键词库。

## 并发执行与文件域隔离

node 的 `mode` 字段控制 node 内部 Agent 的执行方式：

| mode | 含义 |
|------|------|
| `parallel` | node 内多个 Agent 可以并行工作 |
| `sequential` | node 内 Agent 按顺序执行 |

跨 node 的并行由 resolver 的 Group 机制控制。并行执行时，resolver 检查每个 node 的 `provides.artifacts` 和文件操作范围是否重叠：

```
Group 1: [backend-endpoint → src/api/], [frontend-component → src/components/]
         文件域无重叠 → 安全并行 ✓

Group 2: [tdd-implementation → src/, tests/], [backend-endpoint → src/api/]
         文件域重叠 src/ → 标记冲突，自动降级为串行
```

## 节点依赖解析

node-resolver.ts 输入选中节点列表，输出有序执行计划：

```
输入: [backend-endpoint, tdd-implementation, security-review]

解析 depends_on:
  backend-endpoint:     []
  tdd-implementation:   []
  security-review:      [tdd-implementation]

拓扑排序:
  Group 1: [backend-endpoint, tdd-implementation]  (并行)
  Group 2: [security-review]                        (依赖 Group 1)
```

## 阶段节点选择

每个阶段通过 `nodes.md` 定义选择规则。节点选择经过三层筛选：

```
任务: "实现用户认证系统"
task-analyzer 分析结果: { 
  description: "实现用户认证系统，包括登录注册和会话管理",
  tags: ["backend", "auth", "database"],
  complexity: medium
}

04-implementation 阶段匹配:
  第1层 - tag 交集过滤:
    任务 tags: [backend, auth, database]
    节点 tags 与任务 tags 的交集大小决定初始候选:
      tdd-implementation:  tags [backend, database]  → 交集 2 → 候选
      backend-endpoint:    tags [backend, database]  → 交集 2 → 候选
      auth-integration:    tags [auth, backend]      → 交集 2 → 候选
      security-review:     tags [security]           → 交集 0 → 不匹配 tag，降级为推荐
      frontend-component:  tags [frontend]           → 交集 0 → 跳过

  第2层 - 语义匹配:
    认证系统的描述 vs match_description 相似度排序:
      auth-integration:      0.92 → 候选
      tdd-implementation:    0.78 → 候选
      backend-endpoint:      0.75 → 候选
      security-review:       0.68 → 推荐
      frontend-component:    0.15 → 跳过
      scaffold:              0.05 → 跳过

用户确认: [tdd-implementation, backend-endpoint, auth-integration, security-review]

resolver 解析:
  auth-integration depends_on [backend-endpoint]
  security-review depends_on [tdd-implementation]

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
    "stages": ["04-implementation"],
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
