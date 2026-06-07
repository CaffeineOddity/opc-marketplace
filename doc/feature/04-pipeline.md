# 管线

管线的创建、编排、状态管理和生命周期。

---

## 一、两层 Plan 模型

| Plan | 位置 | 生成时机 | 内容 | 生成者 |
|------|------|---------|------|--------|
| **管线编排计划** | `pipeline-plan.json` | `opc_pipeline_create` | 子管线列表、依赖关系、执行分组 | state-manager |
| **阶段节点计划** | `state.json` → `phases[].nodes[]` | `opc_phase_confirm` | 当前 phase 选中的 node 列表、blocked_by、分组 | node-resolver |

---

## 二、目录结构

```
.opc/pipelines/<id>/
├── pipeline-plan.json               # 管线编排计划
├── manifest.md                      # 产物清单（管线结束时汇总）
├── snapshots/                       # 知识快照（每 phase 确认时自动生成）
│   └── sub-1/
│       └── 04-implement-design/
│           ├── user-auth/login/api.md
│           └── user-auth/session/api.md
└── sub-pipelines/
    └── sub-1/                       # 单管线仅一条；拆分管线有 sub-1, sub-2...
        ├── state.json               # 子管线状态机
        ├── brief.md                 # 任务工作单
        └── phases/                  # 逐阶段摘要
            ├── 04-implement-design.md
            ├── 05-implement.md
            └── 06-testing.md
```

---

## 三、pipeline-plan.json

### 3.1 单管线

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

### 3.2 拆分管线

```json
{
  "id": "pipeline-ecommerce-001",
  "description": "电商系统：商品管理 + 购物车 + 下单支付 + 用户中心",
  "complexity": "high",
  "status": "in_progress",
  "knowledge_unit": ["product", "cart", "order", "payment", "user-center"],
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

### 3.3 字段说明

| 字段 | 说明 |
|------|------|
| `id` | 管线唯一 ID |
| `complexity` | `medium` / `high` |
| `status` | 整体状态，由子管线状态自动聚合 |
| `knowledge_unit` | 全部涉及的 unit |
| `owner` | 当前占用管线的 session_id + pid + since |
| `sub_pipelines[].id` | 子管线 ID |
| `sub_pipelines[].knowledge_unit` | 该子管线负责的 unit |
| `sub_pipelines[].status` | `pending` / `in_progress` / `completed` / `failed` |
| `sub_pipelines[].blocked_by` | 依赖的其他子管线 ID |
| `execution_order` | 执行分组。`parallel` 可并行；group 之间串行 |

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

SessionStart 扫描时通过 PID 判断管线是否为孤儿：

```
→ 扫描 .opc/pipelines/*/pipeline-plan.json
→ 发现 status: in_progress 的管线
→ 检查 owner.pid：
  ├── 进程存活 → 跳过（其他 session 正在跑）
  └── 进程已死 → 孤儿管线 → 提示用户恢复
```

---

## 四、state.json

位于 `sub-pipelines/<name>/state.json`。单管线和拆分格式相同。

### 4.1 完整结构

```json
{
  "id": "sub-1",
  "title": "商品管理",
  "task": {
    "description": "实现商品管理功能（CRUD + 分类 + 搜索）",
    "tags": ["backend", "database", "api"],
    "complexity": "medium",
    "knowledge_unit": ["product"],
    "scenario_hints": ["add-feature"]
  },
  "status": "in_progress",
  "created_at": "2026-05-30T10:00:00Z",
  "updated_at": "2026-05-30T10:30:00Z",
  "phases": [
    {
      "phase": "04-implement-design",
      "status": "completed",
      "started_at": "2026-05-30T10:00:00Z",
      "completed_at": "2026-05-30T10:15:00Z",
      "nodes": [
        {
          "name": "api-design",
          "status": "completed",
          "agent": "backend-engineer",
          "blocked_by": [],
          "input": [
            {"type": "knowledge", "path": "product/api"}
          ],
          "output": [
            {"type": "knowledge", "path": "product/api", "version": 1}
          ],
          "error": null,
          "started_at": "2026-05-30T10:01:00Z",
          "completed_at": "2026-05-30T10:10:00Z",
          "timeout_minutes": 30,
          "retry_count": 0,
          "max_retries": 3
        }
      ]
    }
  ]
}
```

### 4.2 字段说明

| 字段 | 说明 |
|------|------|
| `id` | 子管线 ID |
| `task.complexity` | `low` / `medium` / `high` |
| `task.knowledge_unit` | 本条子管线负责的 unit 列表 |
| `phases[].status` | `pending` / `in_progress` / `completed` / `blocked` |
| `phases[].nodes[].status` | `pending` / `in_progress` / `completed` / `failed` |
| `phases[].nodes[].blocked_by` | 依赖的前置 node name |
| `phases[].nodes[].input` | 输入项，含 `type` + `path` |
| `phases[].nodes[].output` | 实际产出，knowledge 带 `version` |
| `phases[].nodes[].error` | 失败时写入，含 `message` + `type` |
| `phases[].nodes[].timeout_minutes` | 来自 node 定义 |
| `phases[].nodes[].retry_count` | 已重试次数 |
| `phases[].nodes[].max_retries` | 重试上限，默认 3 |

---

## 五、状态枚举

| 层级 | 可选值 |
|------|--------|
| pipeline | `pending` → `in_progress` → `completed` / `failed` / `aborted` |
| phase | `pending` → `in_progress` → `completed` / `blocked` |
| node | `pending` → `in_progress` → `completed` / `failed` |

### 5.1 input/output 规则

| 状态 | 规则 |
|------|------|
| **pending** | 不写入 input/output |
| **in_progress** | 写入 input（与 node 定义一致） |
| **completed** | 写入 output（实际产出路径 + evidence 摘要） |
| **failed** | 保留 input，output 为空或部分写入，附加 error |

### 5.2 error 类型

| error.type | 说明 |
|-----------|------|
| `agent_error` | Agent 执行异常，可 retry |
| `test_failure` | 测试未通过 |
| `dependency_failure` | 前置节点失败 |
| `quality_gate_failed` | L1/L2 校验不通过，node 保持 in_progress |
| `timeout` | 超时，retry_count 未达上限时自动重试 |
| `user_abort` | 用户通过 opc_pipeline_abort 中断 |

---

## 六、单管线 vs 拆分管线

### 6.1 拆分触发条件

task-analysis 输出中需要**修改**的 unit 数量 ≥ 2 时，触发 task-decomposition：

- 修改的 unit 互相独立 → 拆分为独立子管线
- 修改的 unit 有 `_refs` 依赖 → 合并或建立 blocked_by

### 6.2 单管线

只有 1 条子管线（sub-1），blocked_by 为空，1 个 execution group。`opc_pipeline_start` 返回 `sub_pipelines: null`，跳过用户确认拆分环节。

### 6.3 knowledge_unit 按子管线分配

每条子管线独立加载自己的 knowledge_unit。`_refs` 关联的 unit 自动标记为可读（跨 unit 上下文）。

---

## 七、管线生命周期

### 7.1 创建

```
用户消息
  → opc_pipeline_start: intent-analysis → knowledge_list → task-analysis
    → (需修改 unit ≥ 2: task-decomposition → 用户确认拆分)
  → opc_pipeline_create: 写入 pipeline-plan.json + 逐条 init_sub
    → init_sub: knowledge_open → brief-generation → state.json
```

### 7.2 执行

按 `execution_order` 分组推进。group 内 `parallel` 的子管线可并行执行；group 之间严格串行。每条子管线内部按 phases 顺序执行。

### 7.3 完成

全部子管线 completed → `opc_pipeline_complete`：
- 校验全部子管线状态
- 生成 manifest.md（汇总所有子管线的产物清单）
- 释放 owner、清理快照

### 7.4 取消

`opc_pipeline_abort`：级联终止。
- pipeline-plan.json: status → aborted
- 所有 in_progress 子管线/phase/node → aborted
- 下游 pending 保持 pending（不再推进）
- 清理快照

### 7.5 恢复

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

## 八、跨管线依赖

### 8.1 blocked_by 语义

sub-3 声明 `blocked_by: ["sub-1", "sub-2"]`，则 sub-3 必须等 sub-1 和 sub-2 都 completed 后才能启动。

### 8.2 execution_order 分组

- `parallel`：组内子管线可同时执行
- `sequential`：按顺序执行
- group 之间严格串行

`execution_order` 必须与 `blocked_by` 推导的拓扑排序一致。`opc_pipeline_create` 时校验，不一致则拒绝创建。

### 8.3 失败传播

子管线 failed 阻塞所有依赖它的子管线。failed 子管线不出现在 `ready_sub_pipelines` 中。

---

## 九、多 Feature 并行

多个独立管线可并存：

```
.opc/pipelines/
├── pipeline-20260530-001/    # user-auth
└── pipeline-20260530-002/    # subscription
```

每个管线独立目录、owner、状态。`/opc-status` 展示所有活跃管线。

---

## 十、管线状态展示

### 10.1 单管线

```
管线: user-auth (pipeline-20260530-001)
状态: in_progress

▸ sub-1: 用户认证系统  ⟳
  04-implement-design  ✓ (2/2 nodes)
    api-design         ✓  backend-engineer
    database-schema    ✓  database-engineer
  05-implement  ⟳ (1/4 nodes)
    tdd-implementation ⟳  backend-engineer     ← 当前
    auth-integration   ○  (等待 tdd-implementation)
    security-review    ○  (等待 tdd-implementation)
  06-testing  ○
```

### 10.2 拆分管线

```
管线: 电商系统 (pipeline-ecommerce-001)
状态: in_progress

▸ sub-1: 商品管理         ✓  completed
▸ sub-2: 用户中心         ⟳  in_progress
    04-implement-design  ✓ (2/2 nodes)
    05-implement  ⟳ (1/3 nodes)
      tdd-implementation ⟳  backend-engineer     ← 当前
▸ sub-3: 购物车           ○  pending (等待 sub-1, sub-2)
▸ sub-4: 下单与支付       ○  pending (等待 sub-3, sub-2)
```

---

## 十一、部分完成

拆分管线中，独立子管线可单独完成并交付。`opc_pipeline_status` 展示各子管线的独立完成情况，`manifest.md` 中标记部分完成状态。

---

## 十二、相关文档

- [02 意图识别与任务分析](02-intent-analysis.md) — task-analysis 与拆分
- [05 阶段](05-phase.md) — 阶段执行、节点选择
- [06 节点](06-node.md) — 节点执行、质量门、重试
