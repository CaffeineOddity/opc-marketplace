# 02-4 节点

阶段根据任务信号自主选择节点，node-resolver 自动解析依赖、拓扑排序、生成执行计划。

---

## 一、节点类型

| 类型 | 标识 | 驱动对象 | 执行者 |
|------|------|---------|--------|
| 管线控制节点 | `used_by: [orchestrator, ...]` | 意图识别、任务分析、阶段执行 | engine |
| 任务执行节点 | `phase: 05-implement` | 编码、测试、设计 | Agent |

两类格式完全相同。控制节点在 `platform/opc-orchestrator/pipeline/`（不可项目覆盖），任务节点在 `phases/<phase>/nodes/`（可项目覆盖）。

---

## 二、节点定义

每个节点一个 markdown 文件，frontmatter + 执行指令：

```markdown
---
name: tdd-implementation
phase: 05-implement
description: TDD 驱动的后端功能实现，RED → GREEN → REFACTOR
tags: [backend, database]
agents:
  primary: [backend-engineer]
  optional: [database-engineer]
skills: [test-driven-development]
mode: parallel

input:
  - knowledge: user-auth/login/spec
  - knowledge: user-auth/login/architecture
  - knowledge: user-auth/session/api

output:
  - artifacts: [tests/, src/]
  - knowledge: user-auth/session/api

quality_gates:
  - test_pass
  - lint_pass
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
```

---

## 三、字段定义

### 3.1 基础

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 节点唯一标识，kebab-case |
| `phase` | string | 是 | 所属阶段 |
| `description` | string | 是 | 用于节点选择列表展示和语义匹配 |
| `tags` | string[] | 是 | 技术标签。与任务 tags 求交集 |
| `mode` | string | 是 | `parallel` / `sequential` |

### 3.2 Agent

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agents.primary` | string[] | 是 | 核心 Agent，不可用则节点无法执行 |
| `agents.optional` | string[] | 否 | 辅助 Agent，可用则加入，不可用则跳过 |
| `skills` | string[] | 否 | 需要加载的 Skill 列表 |

### 3.3 质量门

| gate 类型 | 含义 | 校验方式 |
|-----------|------|---------|
| `test_pass` | 测试全部通过 | `evidence.test_results.failed === 0` |
| `lint_pass` | 无 lint 错误 | `evidence.lint_results.errors === 0` |
| `build_pass` | 构建成功 | `evidence.build_passed === true` |
| `type_check_pass` | 类型检查通过 | `evidence.type_check_passed === true` |

不声明 `quality_gates` 仅检查 L1（产出物存在性）；声明后附加 L2 校验。

### 3.4 超时与重试

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `timeout_minutes` | number | 否 | 无 | 从 `opc_node_start` 起算 |
| `max_retries` | number | 否 | 3 | 超时自动重试上限 |

超时检测是惰性的：在 `opc_pipeline_status`、`opc_phase_start`、`opc_node_start` 等调用时触发。

### 3.5 input 格式

```yaml
input:
  - knowledge: user-auth/login/spec
  - knowledge: user-auth/login/architecture
  - knowledge: user-auth/login/api
    min_version: 2
```

`min_version` 校验在 `opc_node_start` 时强制执行。

### 3.6 output 格式

```yaml
output:
  - artifacts: [tests/, src/]
  - knowledge: user-auth/session/api
  - knowledge: user-auth/session/architecture
```

---

## 四、信号匹配

两层筛选，由 node-resolver 执行：

```
① tag 交集过滤
  任务 tags ∩ 节点 tags，交集为 0 的排除

② 语义匹配排序
  任务 description 与节点 description 语义相似度降序

③ Scenario 加权
  命中 scenario 推荐的节点 +0.3
```

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

---

## 五、并发执行与文件域隔离

跨 node 的并行由 resolver 的 Group 机制控制。并行执行时检查两层冲突：

1. **artifacts 冲突**：`output.artifacts` 路径重叠 → 降级串行
2. **knowledge 冲突**：`output.knowledge` 路径重叠 → 降级串行

```
Group 1: [backend-endpoint → src/api/], [frontend-component → src/components/]
         文件域无重叠，knowledge 无重叠 → 安全并行 ✓

Group 2: [tdd-implementation → src/, tests/], [backend-endpoint → src/api/]
         文件域重叠 src/ → 降级为串行

Group 3: [api-design → knowledge: user-auth/session/api],
         [database-schema → knowledge: user-auth/session/api]
         knowledge 路径重叠 → 降级为串行
```

---

## 六、依赖解析

node-resolver 输入选中节点列表，通过匹配 output → input 自动推导依赖：

```
输入: [api-design, tdd-implementation, security-review]

output → input 匹配:
  api-design.output:           [user-auth/login/api, user-auth/session/api]
  tdd-implementation.input:    [user-auth/login/api, user-auth/session/api] → 依赖 api-design
  security-review.input:       [] → 无依赖

拓扑排序:
  Group 1: [api-design]
  Group 2: [tdd-implementation]
  Group 3: [security-review]  ← 可与 Group 2 并行（无共同依赖）
```

---

## 七、节点执行流程

```
opc_node_start(pipeline_id, sub_id, node_name)
  → 检查 blocked_by 是否全部 completed
  → 扫描已安装 kit → 校验 primary Agent 可用性
  → 写入 input + status: in_progress + agent + started_at
  → 返回 input 知识列表

Agent 执行:
  → opc_knowledge_get_batch([...]) 加载 input 知识
  → 执行 node body 指令
  → 调用 opc_knowledge_write 产出知识

opc_node_complete(pipeline_id, sub_id, node_name, evidence)
  → L1: 检查 output.knowledge 和 output.artifacts 存在
  → L2: 检查 quality_gates（如有声明）
  → 写入 output + evidence + status: completed
  → 自动解锁 blocked_by 下游节点

opc_node_fail(pipeline_id, sub_id, node_name, error)
  → retry_count += 1
  → retry_count < max_retries → auto retry（不级联）
  → retry_count ≥ max_retries → failed

opc_node_retry(pipeline_id, sub_id, node_name)
  → 手动重跑 completed/failed node
  → 计算影响面 → 自动级联重置下游
```

### 三种重试的区别

| 场景 | 触发 | 是否级联 |
|------|------|---------|
| Agent 执行出错 | `opc_node_fail` → auto retry | 否（未产出新版本知识） |
| 节点超时 | `check_node_timeout` → `opc_node_retry` | 是 |
| 手动重跑 | `opc_node_retry` | 是 |

---

## 八、节点来源与覆盖

| 来源 | 位置 | 说明 |
|------|------|------|
| 内置节点 | `phases/<phase>/nodes/` | 随 marketplace 分发 |
| 项目节点 | `opc-nodes/` | 同名覆盖内置节点 |

```
my-project/
└── opc-nodes/
    ├── 04-implement-design/nodes/
    │   └── api-design.md
    └── 05-implement/nodes/
        └── tdd-implementation.md
```

优先级：`opc-nodes/` > `phases/`。

---

## 九、plugin.json 声明式能力

每个 kit 通过 plugin.json 声明提供哪些 agent、skill、node：

```json
{
  "name": "dev-kit",
  "depends": ["mcp"],
  "capabilities": {
    "phases": ["04-implement-design", "05-implement"],
    "agents": [
      { "name": "frontend-engineer", "model": "sonnet", "expertise": ["react", "nextjs"] },
      { "name": "backend-engineer", "model": "sonnet", "expertise": ["api", "database"] }
    ],
    "skills": ["scaffold-nextjs", "build-api", "auth-system", "code-review"],
    "nodes": [
      "scaffold", "api-design", "database-schema", "tdd-implementation",
      "frontend-component", "backend-endpoint", "auth-integration"
    ]
  }
}
```

`opc_phase_start` 扫描已安装 kit 的 plugin.json，构建 Agent 目录和 Skill 索引。

---

## 十、MCP 工具

### 节点级工具（4 个）

| # | 工具 | 说明 |
|---|------|------|
| 16 | `opc_node_start` | node 开始执行（含 Agent 可用性校验） |
| 17 | `opc_node_complete` | node 完成（L1 + L2 校验） |
| 18 | `opc_node_fail` | node 失败（retry_count < max 自动重试） |
| 19 | `opc_node_retry` | 重跑 completed/failed node（自动级联重置下游） |

### opc_node_start

```
参数: pipeline_id, sub_pipeline_id, node_name

行为:
  ① 读取 node 定义，提取 agents.primary[]
  ② 扫描已安装 kit → 构建可用 Agent 集合
  ③ 逐一校验 primary Agent 是否可用 → 不可用立即报错
  ④ 校验 input.knowledge 的 min_version 是否满足（L0）
  ⑤ 全部可用 → 写入 input + status: in_progress + agent + started_at
```

### opc_node_complete

```
参数: pipeline_id, sub_pipeline_id, node_name, evidence?

行为:
  ① L1 — 产出物存在性校验（始终执行）
  ② L2 — 质量门校验（仅当 node 声明了 quality_gates）
  ③ 全部通过 → 写入 output + evidence 摘要，标记 completed
  ④ 自动解锁 blocked_by 下游节点

evidence 结构:
{
  "summary": "TDD 实现完成：3 个测试文件，12/12 通过",
  "test_results": { "passed": 12, "failed": 0, "skipped": 0 },
  "lint_results": { "errors": 0, "warnings": 2 },
  "build_passed": true,
  "type_check_passed": true,
  "files_created": ["src/auth/login.ts"],
  "knowledge_written": [{"path": "user-auth/session/api", "version": 2}]
}
```

### opc_node_fail

```
参数: pipeline_id, sub_pipeline_id, node_name, error: {message, type}

行为:
  ① retry_count += 1，写入 error 到 state.json
  ② retry_count < max_retries → auto_retrying（不级联）
  ③ retry_count ≥ max_retries → exhausted（标记 failed）
```

### opc_node_retry

```
参数: pipeline_id, sub_pipeline_id, node_name

行为:
  → 检查 node.status ∈ [failed, completed]，否则拒绝
  → 计算影响面:
      同 phase: blocked_by 包含当前 node 的已完成 node
      下游 phase: 所有已完成 node
  → 自动级联重置下游 → 当前 node → in_progress
```

---

## 十一、自动机制

**依赖解锁** — `opc_node_complete` 后自动检查 phase 内所有 pending node，将 blocked_by 已满足的标记为可执行。

**节点超时自动重试** — `opc_pipeline_status`、`opc_phase_start`、`opc_node_start` 调用时惰性检测 in_progress node 是否超时。超时且未达重试上限时自动 `opc_node_retry`（含级联重置）。

---

## 十二、内部引擎

### node-resolver

对选中节点做依赖解析和拓扑排序，输出分组执行计划。同时检查并行组冲突：

- `resolve(phase, nodes)`: opc_phase_confirm 时解析依赖 + 冲突检测 + 拓扑排序
- `adjust(phase, nodes)`: opc_phase_adjust 时重新生成预览（不锁定）
- 输入: 选中节点列表
- 输出: `[{ group: 1, nodes: [...], parallel: true }, { group: 2, nodes: [...], parallel: false }]`

### state-manager（节点部分）

- `validate_node_completion()` — L1（产出物存在性）+ L2（quality_gates）校验
- `cascade_reset_after_retry()` — 计算下游影响面，自动重置受影响 node/phase
- `check_node_timeout()` — 惰性检测 in_progress node 超时
- `auto_retry_on_timeout()` — 超时后自动触发 `opc_node_retry`（含级联重置）

---

## 十三、相关文档

- [02-3 阶段](02-3_phase.md) — 节点选择与阶段生命周期
- [03-1 知识模型](03-1_knowledge-model.md) — 知识读写与版本管理
