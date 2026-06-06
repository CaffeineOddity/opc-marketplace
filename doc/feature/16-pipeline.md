# 管线设计

管线的创建、编排、生命周期和监控。

---

## 一、两层 Plan 模型

OPC 有两层 plan，对应不同粒度的执行计划：

| Plan | 位置 | 生成时机 | 内容 | 生成者 |
|------|------|---------|------|--------|
| **管线编排计划** | `pipeline-plan.json` | `opc_pipeline_create` | 子管线列表、依赖关系、执行分组 | state-manager |
| **阶段节点计划** | `state.json` → `phases[].nodes[]` | `opc_phase_confirm` | 当前 phase 选中的 node 列表、`blocked_by` 依赖、分组 | node-resolver |

- **管线编排计划**回答"这个需求拆成几条子管线、谁依赖谁、哪组可以并行"
- **阶段节点计划**回答"这个 phase 跑哪些 node、按什么顺序、谁和谁能并行"

两者都在各自层级用 `blocked_by` + 分组来表达依赖和并行。

---

## 二、目录结构

```
.opc/pipelines/<id>/
├── pipeline-plan.json               # 管线编排计划（始终存在）
├── manifest.md                      # 产物清单（管线结束时汇总）
├── snapshots/                       # 知识快照（每 phase 确认时自动生成）
│   └── sub-1/
│       └── 04-implement-design/
│           ├── user-auth/login/api.md
│           └── user-auth/session/api.md
└── sub-pipelines/
    └── sub-1/                       # 单管线仅此一条；拆分管线有 sub-1, sub-2...
        ├── state.json               # 子管线状态机（含阶段节点计划）
        ├── brief.md                 # 任务工作单
        └── phases/                  # 逐阶段摘要
            ├── 04-implement-design.md
            ├── 05-implement.md
            └── 06-testing.md
```

单管线和拆分管线的区别仅在 `pipeline-plan.json`：
- 单管线：`sub_pipelines` 数组只有 1 个元素，`blocked_by` 为空，`execution_order` 只有 1 个 group
- 拆分管线：`sub_pipelines` 数组有 N 个元素，含依赖关系和多个执行组

---

## 三、pipeline-plan.json

### 3.1 完整 Schema

```json
{
  "id": "pipeline-20260530-001",
  "description": "实现用户认证系统",
  "complexity": "medium",
  "status": "in_progress",
  "knowledge_unit": ["user-auth"],
  "owner": {
    "session_id": "session-abc-001",
    "pid": 12345,
    "since": "2026-05-30T10:00:00Z"
  },
  "created_at": "2026-05-30T10:00:00Z",
  "updated_at": "2026-05-30T10:30:00Z",

  "sub_pipelines": [
    {
      "id": "sub-1",
      "title": "用户认证系统",
      "knowledge_unit": ["user-auth"],
      "status": "in_progress",
      "blocked_by": [],
      "started_at": "2026-05-30T10:01:00Z"
    }
  ],

  "execution_order": [
    {"group": 1, "parallel": ["sub-1"]}
  ]
}
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 管线唯一 ID |
| `complexity` | enum | 整体复杂度 `medium` / `high` |
| `status` | enum | 整体状态，由子管线状态自动聚合 |
| `knowledge_unit` | string[] | 全部涉及的 unit |
| `owner.session_id` | string | 当前占用管线的 session ID |
| `owner.pid` | number | 占用进程的 PID，用于判断进程是否存活 |
| `owner.since` | string | 占用开始时间 |
| `sub_pipelines[].id` | string | 子管线 ID |
| `sub_pipelines[].knowledge_unit` | string[] | 该子管线负责的 unit |
| `sub_pipelines[].status` | enum | `pending` / `in_progress` / `completed` / `failed` |
| `sub_pipelines[].blocked_by` | string[] | 依赖的其他子管线 ID |
| `execution_order` | object[] | 执行分组。`parallel` 可并行；group 之间串行 |

### 3.3 拆分管线示例

```json
{
  "id": "pipeline-ecommerce-001",
  "description": "电商系统：商品管理 + 购物车 + 下单支付 + 用户中心",
  "complexity": "high",
  "status": "in_progress",
  "knowledge_unit": ["product", "cart", "order", "payment", "user-center"],
  "owner": { "session_id": "session-xyz-002", "pid": 67890, "since": "..." },
  "created_at": "...",
  "updated_at": "...",

  "sub_pipelines": [
    {"id": "sub-1", "title": "商品管理",    "knowledge_unit": ["product"],     "status": "completed",   "blocked_by": []},
    {"id": "sub-2", "title": "用户中心",    "knowledge_unit": ["user-center"], "status": "in_progress",  "blocked_by": []},
    {"id": "sub-3", "title": "购物车",      "knowledge_unit": ["cart"],        "status": "pending",     "blocked_by": ["sub-1", "sub-2"]},
    {"id": "sub-4", "title": "下单与支付",  "knowledge_unit": ["order", "payment"], "status": "pending", "blocked_by": ["sub-3", "sub-2"]}
  ],

  "execution_order": [
    {"group": 1, "parallel": ["sub-1", "sub-2"]},
    {"group": 2, "sequential": ["sub-3"]},
    {"group": 3, "sequential": ["sub-4"]}
  ]
}
```

### 3.4 状态聚合规则

| 条件 | 整体 status |
|------|-----------|
| 全部 completed | `completed` |
| 任意 aborted | `aborted` |
| 任意 failed | `failed` |
| 任意 in_progress | `in_progress` |
| 全部 pending | `pending` |
| 部分 completed + 其余 pending | `in_progress` |

### 3.5 owner 字段 — 并发隔离

每条管线有 `owner` 记录当前占用的 session 和进程 PID。恢复时通过 PID 判断管线是否为孤儿：

```
SessionStart:
  → 扫描 .opc/pipelines/*/pipeline-plan.json
  → 发现 status: in_progress 的管线
  → 检查 owner.pid：
    ├── 进程存活 → 跳过（其他 session 正在跑）
    └── 进程已死 → 孤儿管线 → 提示用户恢复
```

---

## 四、单管线 vs 拆分管线

### 4.1 拆分触发条件

当 task-analysis 输出 `knowledge_unit` 数组长度 ≥ 2 时，触发 `task-decomposition` 分析：

- 修改的 unit 之间互相独立 → 拆分为独立子管线
- 修改的 unit 之间有 `_refs` 依赖 → 合并或建立子管线间 blocked_by 关系

### 4.2 单管线

单管线只有 1 条子管线（sub-1），blocked_by 为空，1 个 execution group。`opc_pipeline_start` 返回 `sub_pipelines: null`，跳过用户确认拆分环节。

### 4.3 拆分管线

拆分管线有 N 条子管线，通过 `blocked_by` 表达依赖，通过 `execution_order` 分组执行。

### 4.4 knowledge_unit 按子管线分配

每条子管线独立加载自己的 knowledge_unit。`_refs` 关联的 unit 自动标记为可读（跨 unit 上下文），但不属于子管线的修改范围。

---

## 五、管线生命周期

### 5.1 创建

```
用户消息
  → opc_pipeline_start: intent-analysis → knowledge_list → task-analysis
    → (需修改 unit ≥ 2: task-decomposition → 用户确认拆分)
  → opc_pipeline_create: 写入 pipeline-plan.json + 逐条 init_sub
    → init_sub: knowledge_open → brief-generation → state.json
```

### 5.2 执行

按 `execution_order` 分组推进。group 内 `parallel` 的子管线无依赖可并行（多 session 场景）；group 之间严格串行。

每条子管线内部按 phases 顺序执行 phase → node，详见 [10 执行流程](10-execution-flow.md)。

### 5.3 完成

全部子管线 completed → `opc_pipeline_complete`：
- 校验全部子管线状态
- 生成 manifest.md（汇总所有子管线的产物清单）
- 释放 owner、清理快照

### 5.4 取消

`opc_pipeline_abort`：级联终止。
- pipeline-plan.json: status → aborted
- 所有 in_progress 子管线/phase/node → aborted
- 下游 pending 子管线保持 pending（不再推进）
- 清理快照

### 5.5 恢复

```
Session 启动检测:
  opc_session_init()
  → 扫描 .opc/pipelines/*/pipeline-plan.json
  → status: in_progress + owner.pid 已死 → 孤儿管线
  → 返回孤儿列表（不自动接管）

用户决定恢复:
  opc_pipeline_recover(pipeline_id)
  → PID 检查 → owner 接管 → 返回可恢复的 in_progress node 列表
  → 继续执行
```

---

## 六、跨管线依赖

### 6.1 blocked_by 语义

`sub_pipelines[].blocked_by` 表达子管线间的依赖：sub-3 声明 `blocked_by: ["sub-1", "sub-2"]`，则 sub-3 必须等 sub-1 和 sub-2 都 completed 后才能启动。

### 6.2 execution_order 分组

```json
"execution_order": [
  {"group": 1, "parallel": ["sub-1", "sub-2"]},
  {"group": 2, "sequential": ["sub-3"]},
  {"group": 3, "sequential": ["sub-4"]}
]
```

- `parallel`：组内子管线无依赖，可同时执行（在多 session 场景下）
- `sequential`：单条子管线，按顺序执行
- group 之间严格串行：group 1 全部完成后才启动 group 2

### 6.3 ready_sub_pipelines

`opc_pipeline_status`（聚合视图）返回 `ready_sub_pipelines`：blocked_by 全部满足、可立即启动的子管线列表。

```
返回（拆分管线）:
{
  pipeline_id: "pipeline-ecommerce-001",
  status: "in_progress",
  sub_pipelines: [
    {id: "sub-1", status: "completed"},
    {id: "sub-2", status: "completed"},
    {id: "sub-3", status: "pending", blocked_by: ["sub-1", "sub-2"]},
    {id: "sub-4", status: "pending", blocked_by: ["sub-3"]}
  ],
  ready_sub_pipelines: ["sub-3"]
}
```

### 6.4 失败传播

子管线 failed 会阻塞所有依赖它的子管线。failed 子管线不会出现在 `ready_sub_pipelines` 中，直到通过 recovery/retry 恢复。

---

## 七、多 Feature 并行

多个独立管线可以并存于 `.opc/pipelines/` 下：

```
.opc/pipelines/
├── pipeline-20260530-001/    # user-auth 管线
└── pipeline-20260530-002/    # subscription 管线
```

- 每个管线有独立的目录、owner、状态
- `/opc-status` 展示所有活跃管线
- 切换上下文：`/opc-phase --pipeline <id>` 或自然语言指定

---

## 八、部分完成

拆分管线中，独立子管线可单独完成并交付：

- 子管线的 knowledge_unit 不被其他待定子管线依赖时，可视为独立完成
- `manifest.md` 中标记部分完成状态
- `opc_pipeline_status` 展示各子管线的独立完成情况

---

## 九、管线状态展示

### 9.1 单管线

```
管线: user-auth (pipeline-20260530-001)
状态: in_progress

▸ sub-1: 用户认证系统  ⟳
  04-implement-design  ✓ (2/2 nodes)
    api-design         ✓  backend-engineer
    database-schema    ✓  database-engineer
  05-implement  ⟳ (1/4 nodes)
    backend-endpoint   ✓  backend-engineer
    tdd-implementation ⟳  backend-engineer     ← 当前
    auth-integration   ○  (等待 backend-endpoint)
    security-review    ○  (等待 tdd-implementation)
  06-testing  ○
```

### 9.2 拆分管线

```
管线: 电商系统 (pipeline-ecommerce-001)
状态: in_progress

▸ sub-1: 商品管理         ✓  completed
▸ sub-2: 用户中心         ⟳  in_progress
    04-implement-design  ✓ (2/2 nodes)
    05-implement  ⟳ (1/3 nodes)
      tdd-implementation ⟳  backend-engineer     ← 当前
      backend-endpoint   ○
      security-review    ○
▸ sub-3: 购物车           ○  pending (等待 sub-1, sub-2)
▸ sub-4: 下单与支付       ○  pending (等待 sub-3, sub-2)
```

---

## 十、相关文档

- [06 管线状态](06-state.md) — state.json 数据结构、状态枚举
- [10 执行流程](10-execution-flow.md) — 端到端流程图
- [17 opc-state-server](17-mcp-state-server.md) — 管线/阶段/节点工具 API
- [05 节点](05-nodes.md) — 节点定义与并发执行
