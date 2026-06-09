# 07 跨管线依赖与并行执行

---

## 一、核心原则：并发优先，依赖串行

拆分管线（split pipeline）的执行策略是 **"能并发就并发，有依赖才串行"**：

| 场景 | 执行策略 | 说明 |
|---|---|---|
| `blocked_by = []` | **默认并发** | 多个独立子管线由 Claude Host 在一次响应里同时拉起 `opc_phase_start` |
| `blocked_by = [...]` 非空 | **严格串行** | 前置子管线必须全部 `completed` 才进入 `ready_sub_pipelines` |

**设计动机**：拆分管线的初衷就是把可并行的工作并发执行，缩短整体时长。如果默认串行，拆分就失去意义；如果忽略 `blocked_by` 全并发，会破坏依赖约束。**`blocked_by` 是唯一的串行依据**，没有 `blocked_by` 就必须能并发。

---

## 二、blocked_by 语义

`sub-3` 声明 `blocked_by: ["sub-1", "sub-2"]`，则 `sub-3` 必须等 `sub-1` 和 `sub-2` 都 `completed` 后才能启动。

`blocked_by` 是 `sub_pipelines[]` 间的依赖图，由 task-decomposition 推导（基于跨 sub 的 knowledge `_refs` + 显式语义判断），由 `opc_pipeline_create` 校验，并参与 `execution_order` 拓扑一致性校验。

### 推导规则（task-decomposition 阶段）

| 触发 | 推导出的 `blocked_by` |
|---|---|
| `sub-B.input.knowledge` 引用 `sub-A.output.knowledge` 的某 unit/section | `sub-B.blocked_by` 加入 `sub-A` |
| Claude 在拆分时显式声明（"先建数据库再写 API"） | 按声明 |
| 共享同一 `knowledge_unit` 但语义独立 | **不加入** blocked_by（允许并发，由 knowledge-server `_refs` + version 校验兜底） |
| 无任何依赖信号 | `blocked_by: []`（默认并发） |

> **推导边界**：`blocked_by` 只描述 sub_pipeline 间的**启动时序**依赖，不描述 phase / node 内部依赖（那是 node-resolver 的职责）。

---

## 三、execution_order 分组

`execution_order[]` 是 `blocked_by` 拓扑排序后的**显式分组表达**，用于 `opc_pipeline_status` 快速返回 ready 集合：

- `parallel`：组内子管线**应并发执行**（Host 在同一响应里发起多个 `opc_phase_start`）
- `sequential`：组内子管线**按顺序串行执行**（仅当组内子管线间有 `blocked_by` 才使用，正常情况下应避免）
- **group 之间严格串行**（前一 group 全部 `completed` 才进入下一 group）

`execution_order` 必须与 `blocked_by` 推导的拓扑排序一致，`opc_pipeline_create` 时强制校验，不一致直接拒绝创建。

### 示例 1：典型 fork-join（默认并发优先）

```json
"sub_pipelines": [
  {"id": "sub-1", "title": "数据库 schema", "blocked_by": []},
  {"id": "sub-2", "title": "前端组件",      "blocked_by": []},
  {"id": "sub-3", "title": "API 集成",      "blocked_by": ["sub-1", "sub-2"]}
],
"execution_order": [
  {"group": 1, "parallel":   ["sub-1", "sub-2"]},
  {"group": 2, "sequential": ["sub-3"]}
]
```

启动时序：Host 在第一次拉起时同时发 `opc_phase_start(sub-1)` 和 `opc_phase_start(sub-2)`；待两者均 `completed` 后才发 `opc_phase_start(sub-3)`。

### 示例 2：纯并发（无任何依赖）

```json
"sub_pipelines": [
  {"id": "sub-1", "blocked_by": []},
  {"id": "sub-2", "blocked_by": []},
  {"id": "sub-3", "blocked_by": []}
],
"execution_order": [
  {"group": 1, "parallel": ["sub-1", "sub-2", "sub-3"]}
]
```

### 示例 3：链式依赖（退化为串行）

```json
"sub_pipelines": [
  {"id": "sub-1", "blocked_by": []},
  {"id": "sub-2", "blocked_by": ["sub-1"]},
  {"id": "sub-3", "blocked_by": ["sub-2"]}
],
"execution_order": [
  {"group": 1, "parallel": ["sub-1"]},
  {"group": 2, "parallel": ["sub-2"]},
  {"group": 3, "parallel": ["sub-3"]}
]
```

> 即使每组只有一个子管线，仍用 `parallel: [...]` 表达——`sequential` 仅当**组内有多个有依赖关系的子管线**才使用。

---

## 四、Host 并发执行规约

`opc_pipeline_status` 不带 `sub_pipeline_id` 时返回 `ready_sub_pipelines`，**一次返回当前所有 ready 子管线**（不限制条数）。Host（Claude）按以下规则执行：

```
1. Claude 调 opc_pipeline_status()
2. 拿到 ready_sub_pipelines = [sub-A, sub-B, sub-C]（已过滤完 blocked_by + failed downstream）
3. Claude 在【一次响应】里并发发起多个 opc_phase_start：
     opc_phase_start(sub-A) | opc_phase_start(sub-B) | opc_phase_start(sub-C)
4. 各 sub 的 phase / node 执行循环互不阻塞
5. 任一 sub 内 opc_phase_complete → 触发 opc_pipeline_status 重检 ready
6. 新 ready 加入并发执行队列
```

### 并发能力与限制

| 维度 | 规则 |
|---|---|
| 协议层 | MCP 协议是请求-响应；并发能力由 Host (Claude Code) 在一次响应里同时调多个工具来实现 |
| Host 行为约定 | Claude **应**在收到 `ready_sub_pipelines` 多元素时并发发起，不应人为串行 |
| 上下文共享 | 多个 sub 共享 Claude 主上下文（同一个对话窗口）；sub-agent 派发后才隔离 context |
| state-server 并发安全 | `state.json` 按 `sub_pipeline_id` 分片存储，多 sub 写互不冲突；`pipeline-plan.json` 状态聚合写经 owner.pid + 原子写保护 |
| knowledge-server 并发安全 | 不同 unit 写互不冲突；同 unit 跨 sub 写由 `_refs + version` 校验兜底（详见 §五） |
| 用户 opt-out | 用户可在 brief 阶段或 `opc_pipeline_replan` 时把 `execution_order` 强制改为单元素 `parallel`，等效串行 |

### 上限与降级

| 场景 | 处理 |
|---|---|
| `ready_sub_pipelines.length` 过多（> 4） | `opc_pipeline_status` 返回时附 `concurrency_hint: { recommended_batch: 3, reason: "context-window-pressure" }`，Host 自行决定批次 |
| 某 sub 在并发执行中 `failed` | 不影响其他并发 sub；其下游 sub 永久阻塞，直到 `opc_pipeline_recover` 或 `opc_pipeline_abort` |
| Host 上下文窗口紧张 | Claude 可主动降级为串行（一次只发一个 `opc_phase_start`），无需改 state-server 行为 |

---

## 五、跨 sub 的 knowledge 依赖

`blocked_by` 是**启动时序**约束，**不**覆盖运行时的细粒度 knowledge 版本依赖。后者由 knowledge-server 的 `_refs + min_version` 兜底：

| 依赖类型 | 表达机制 | 校验时点 |
|---|---|---|
| **启动时序**（sub-B 要等 sub-A 整体完成） | `sub-B.blocked_by = ["sub-A"]` | `opc_pipeline_status` 计算 `ready_sub_pipelines` 时 |
| **某 node 输入需要某 unit 的特定版本** | `node.input.knowledge[].min_version` | `opc_node_start` 时 |
| **跨 unit 引用关系**（user-auth 依赖 shared/utils） | `.opc-knowledge.json._refs[]` | `opc_knowledge_open` 时联动加载 |

### 三种典型场景

**场景 A：完全独立的两个 sub（推荐并发）**
- `sub-1` 写 `unit=billing`，`sub-2` 写 `unit=notification`
- `blocked_by = []`，并发执行，knowledge-server 无冲突

**场景 B：sub-B 强依赖 sub-A 的产出（必须串行）**
- `sub-1` 产出 `user-auth/api-design`，`sub-2` 的 `tdd-implementation` node 需要读它
- task-decomposition 应推导出 `sub-2.blocked_by = ["sub-1"]`
- `opc_pipeline_status` 不会把 `sub-2` 放入 ready 直到 `sub-1.status == completed`

**场景 C：共享 unit 但语义独立（允许并发 + 版本兜底）**
- `sub-1` 和 `sub-2` 都要写 `unit=shared/utils` 的不同 section
- `blocked_by = []`，并发执行
- knowledge-server 单文件原子写 + version+1 保证最终一致；同 section 并发写时 version 冲突 → 后写者收到 `version_conflict` 错误，由 sub-agent 重试合并

> **规则**：当 task-decomposition 不确定能否并发，应**保守加 `blocked_by`**；过度并发导致的合并冲突比过度串行的延时更难恢复。

---

## 六、失败传播

子管线 `failed` 阻塞所有依赖它的子管线。`failed` 子管线不出现在 `ready_sub_pipelines` 中，下游永久阻塞，直到：

- 修复 → `opc_pipeline_recover` → 重新进入 ready 队列
- 放弃 → `opc_pipeline_abort` → 整条管线终止

**并发场景下的失败隔离**：

```
group1: parallel [sub-1, sub-2, sub-3]
  ├── sub-1 completed
  ├── sub-2 failed     ──> 不影响 sub-3 继续跑，但 sub-2 的下游永久阻塞
  └── sub-3 in_progress
```

`sub-2 failed` 时：
1. state-server 标记 `sub-2.status = failed`
2. `sub-2.blocked_by ⊆ X` 的所有 X 不会进入 ready
3. 其他无关 sub（如 `sub-3`）继续不受影响
4. Host 收到下次 `opc_phase_complete` 后 `opc_pipeline_status` 返回时附 `failed_sub_pipelines: [sub-2]`，提示用户介入

---

## 七、多 Feature 并行（顶层多管线）

不同 Feature（如 user-auth + subscription）创建为**独立 pipeline**，不属于同一拆分：

```
.opc/pipelines/
├── pipeline-20260530-001/    # user-auth
└── pipeline-20260530-002/    # subscription
```

每个管线独立目录、owner、状态。`/opc-status` 展示所有活跃管线。

跨管线并发由 owner.pid 隔离，详见 [03_pipeline-plan.md §五](03_pipeline-plan.md#五owner-字段--并发隔离)。

---

## 相关文档

- [03_pipeline-plan.md](03_pipeline-plan.md) — `sub_pipelines[]` + `execution_order` schema
- [08_status-display.md](08_status-display.md) — 多管线状态展示
- [09_tools.md](09_tools.md) — `opc_pipeline_status` 返回 `ready_sub_pipelines` + `concurrency_hint`
- [../../03-opc-knowledge-server/01-knowledge-model/00_overview.md](../../03-opc-knowledge-server/01-knowledge-model/00_overview.md) — `_refs` + version 并发写兜底
