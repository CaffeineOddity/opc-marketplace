# 07 跨管线依赖与串行执行

---

## 一、核心原则：严格串行，依赖阻塞

拆分管线（split pipeline）的执行策略是 **"严格按 execution_order 串行，blocked_by 阻塞未就绪的 sub"**：

| 场景 | 执行策略 | 说明 |
|---|---|---|
| `blocked_by = []` | 按 execution_order 顺序执行 | 无依赖的子管线按列表顺序依次启动 |
| `blocked_by = [...]` 非空 | 前置全部 completed 后才可启动 | `next_sub_pipeline` 只会返回 `blocked_by` 全满足的 sub |

**设计动机**：MCP 协议是请求-响应模型，天然适合串行调用。子管线按 `execution_order` 依次执行，每条子管线内部按 phases 顺序执行，状态简单可预测。`blocked_by` 描述启动时序约束——即使某 sub 排在 execution_order 前面，如果它的 `blocked_by` 未满足，也会跳过。

---

## 二、blocked_by 语义

`sub-3` 声明 `blocked_by: ["sub-1", "sub-2"]`，则 `sub-3` 必须等 `sub-1` 和 `sub-2` 都 `completed` 后才能启动。

`blocked_by` 是 `sub_pipelines[]` 间的依赖图，由 task-decomposition 推导（基于跨 sub 的 knowledge `_refs` + 显式语义判断），由 `opc_pipeline_create` 校验（`blocked_by` 引用的 sub_id 必须存在且无环）。

### 推导规则（task-decomposition 阶段）

| 触发 | 推导出的 `blocked_by` |
|---|---|
| `sub-B.input.knowledge` 引用 `sub-A.output.knowledge` 的某 unit/section | `sub-B.blocked_by` 加入 `sub-A` |
| Claude 在拆分时显式声明（"先建数据库再写 API"） | 按声明 |
| 共享同一 `knowledge_unit` 但语义独立 | **不加入** blocked_by（串行执行，无写冲突） |
| 无任何依赖信号 | `blocked_by: []` |

> **推导边界**：`blocked_by` 只描述 sub_pipeline 间的**启动时序**依赖，不描述 phase / node 内部依赖（那是 node-resolver 的职责）。

---

## 三、execution_order 排序

`execution_order[]` 是子管线的**执行顺序列表**，用于 `opc_pipeline_status` 和 `opc_phase_complete` 返回 `next_sub_pipeline` 时快速定位：

- 每组的 `sub_pipeline_ids` 按顺序串行执行
- **group 之间严格串行**（前一 group 全部 `completed` 才进入下一 group）

`opc_pipeline_create` 校验 `blocked_by` 引用的 sub_id 存在且无环。`execution_order` 应与 `blocked_by` 推导的偏序一致，不一致时以 `blocked_by` 为准并写 warning。

### 示例 1：有依赖的拆分

```json
"sub_pipelines": [
  {"id": "sub-1", "title": "数据库 schema", "blocked_by": []},
  {"id": "sub-2", "title": "前端组件",      "blocked_by": []},
  {"id": "sub-3", "title": "API 集成",      "blocked_by": ["sub-1", "sub-2"]}
],
"execution_order": [
  {"group": 1, "sub_pipeline_ids": ["sub-1", "sub-2"]},
  {"group": 2, "sub_pipeline_ids": ["sub-3"]}
]
```

启动时序：sub-1 → sub-2 → sub-3。sub-3 的 `blocked_by` 要求 sub-1 和 sub-2 都 completed，因此在 group 2 才启动。

### 示例 2：无任何依赖

```json
"sub_pipelines": [
  {"id": "sub-1", "blocked_by": []},
  {"id": "sub-2", "blocked_by": []},
  {"id": "sub-3", "blocked_by": []}
],
"execution_order": [
  {"group": 1, "sub_pipeline_ids": ["sub-1", "sub-2", "sub-3"]}
]
```

全部在一个 group，按列表顺序依次执行。

### 示例 3：链式依赖

```json
"sub_pipelines": [
  {"id": "sub-1", "blocked_by": []},
  {"id": "sub-2", "blocked_by": ["sub-1"]},
  {"id": "sub-3", "blocked_by": ["sub-2"]}
],
"execution_order": [
  {"group": 1, "sub_pipeline_ids": ["sub-1"]},
  {"group": 2, "sub_pipeline_ids": ["sub-2"]},
  {"group": 3, "sub_pipeline_ids": ["sub-3"]}
]
```

---

## 四、Host 串行执行规约

`opc_phase_complete` 在当前子管线全部 phase 完成后，返回 `pipeline_progress.next_sub_pipeline`。Claude 按以下规则执行：

```
1. 当前子管线的最后 phase → opc_phase_complete
2. 返回 pipeline_progress.next_sub_pipeline = {id: "sub-X", reason: "..."}
3. Claude 调 opc_phase_start(sub-X) → 开始下一条子管线
4. 若 next_sub_pipeline = null + 全部 sub completed → 调 opc_pipeline_complete
```

### 串行执行的保障

| 维度 | 规则 |
|---|---|
| 协议层 | MCP 请求-响应模型天然适合串行 |
| 单写者 | 同一时刻只有一条 sub 在执行，`state.json` 和 knowledge 无写竞争 |
| state-server 安全 | `state.json` 按 `sub_pipeline_id` 分片存储，串行写互不冲突 |
| knowledge-server 安全 | 串行执行，无跨 sub 写冲突；`version+1` 仅做信息性记录 |
| 简单可预测 | 状态空间线性，调试和恢复逻辑简单 |

### 上限与处理

| 场景 | 处理 |
|---|---|
| `blocked_by` 未满足的 sub | `next_sub_pipeline` 跳过该 sub，返回下一个 blocked_by 已满足的 pending sub |
| 某 sub 执行中 `failed` | 其下游 sub 永久阻塞，直到 `opc_pipeline_recover` 或 `opc_pipeline_abort` |
| 无 sub 可执行 | `next_sub_pipeline = null`，提示用户介入 |

---

## 五、跨 sub 的 knowledge 依赖

`blocked_by` 是**启动时序**约束，**不**覆盖运行时的细粒度 knowledge 版本依赖。后者由 knowledge-server 的 `_refs + min_version` 兜底：

| 依赖类型 | 表达机制 | 校验时点 |
|---|---|---|
| **启动时序**（sub-B 要等 sub-A 整体完成） | `sub-B.blocked_by = ["sub-A"]` | `opc_phase_complete` 计算 `next_sub_pipeline` 时 |
| **某 node 输入需要某 unit 的特定版本** | `node.input.knowledge[].min_version` | `opc_node_start` 时 |
| **跨 unit 引用关系**（user-auth 依赖 shared/utils） | `.opc-knowledge.json._refs[]` | `opc_knowledge_open` 时联动加载 |

### 三种典型场景

**场景 A：完全独立的两个 sub**
- `sub-1` 写 `unit=billing`，`sub-2` 写 `unit=notification`
- `blocked_by = []`，按 execution_order 串行执行，knowledge-server 无冲突

**场景 B：sub-B 强依赖 sub-A 的产出**
- `sub-1` 产出 `user-auth/api-design`，`sub-2` 的 `tdd-implementation` node 需要读它
- task-decomposition 应推导出 `sub-2.blocked_by = ["sub-1"]`
- `next_sub_pipeline` 不会返回 `sub-2` 直到 `sub-1.status == completed`

**场景 C：共享 unit 但语义独立**
- `sub-1` 和 `sub-2` 都要写 `unit=shared/utils` 的不同 section
- `blocked_by = []`，按 execution_order 串行执行
- 串行执行保证同一时刻只有一个 sub 在写 knowledge，无写冲突

> **规则**：当 task-decomposition 不确定能否安全串行排在一起，应**保守加 `blocked_by`**，确保依赖关系显式化。

---

## 六、失败传播

子管线 `failed` 阻塞所有依赖它的子管线。`failed` 子管线不会出现在 `next_sub_pipeline` 中，下游永久阻塞，直到：

- 修复 → `opc_pipeline_recover` → 重新进入就绪
- 放弃 → `opc_pipeline_abort` → 整条管线终止

**串行场景下的失败处理**：

```
execution_order: sub-1 → sub-2 → sub-3
  ├── sub-1 completed
  ├── sub-2 failed     ──> sub-3 的 blocked_by 包含 sub-2，永久阻塞
  └── sub-3 pending    ──> next_sub_pipeline = null（无可执行的 sub）
```

`sub-2 failed` 时：
1. state-server 标记 `sub-2.status = failed`
2. `sub-2.blocked_by ⊆ X` 的所有 X 不会进入 `next_sub_pipeline`
3. `opc_phase_complete` 返回 `next_sub_pipeline = null` + `failed_sub_pipelines: [sub-2]`，提示用户介入

---

## 七、多 Feature 独立管线（顶层多管线）

不同 Feature（如 user-auth + subscription）创建为**独立 pipeline**，不属于同一拆分：

```
.opc/pipelines/
├── pipeline-20260530-001/    # user-auth
└── pipeline-20260530-002/    # subscription
```

每个管线独立目录、owner、状态。同一时刻只有一条管线在执行（由 `opc_flow_query` 的 `active` 状态保证）。`/opc-status` 展示所有管线。

---

## 相关文档

- [03_pipeline-plan.md](03_pipeline-plan.md) — `sub_pipelines[]` + `execution_order` schema
- [08_status-display.md](08_status-display.md) — 多管线状态展示
- [09_tools.md](09_tools.md) — `opc_pipeline_status` 返回 `next_sub_pipeline`
