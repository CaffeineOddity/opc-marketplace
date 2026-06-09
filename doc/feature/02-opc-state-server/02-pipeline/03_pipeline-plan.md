# 03 pipeline-plan.json

管线编排计划。由 `opc_pipeline_create` 生成、`opc_pipeline_replan` 修改、`opc_pipeline_complete` / `opc_pipeline_abort` 终结。

---

## 一、单管线示例

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

---

## 二、拆分管线示例

```json
{
  "id": "pipeline-ecommerce-001",
  "description": "电商系统：商品管理 + 购物车 + 下单支付 + 用户中心",
  "complexity": "high",
  "status": "in_progress",
  "knowledge_unit": ["product", "cart", "order", "payment", "user-center"],
  "sub_pipelines": [
    {"id": "sub-1", "title": "商品管理",    "knowledge_unit": ["product"],     "status": "completed",   "blocked_by": []},
    {"id": "sub-2", "title": "用户中心",    "knowledge_unit": ["user-center"], "status": "in_progress", "blocked_by": []},
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

---

## 三、字段说明

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

> **phase 选择不在本文件**：每条子管线实际跑哪些 phase 由 `sub-pipelines/<id>/state.json` 的 `phase_plan` 块声明（包含 `available` / `selected` / `selected_by` / `selection_rationale`，并由 state-server 做偏序与一致性校验）。详见 [04_state-json.md §六](04_state-json.md#六phase_plan-校验规则deterministic)。

---

## 四、状态聚合规则

| 条件 | 整体 status |
|------|-----------|
| 全部 completed | `completed` |
| 任意 aborted | `aborted` |
| 任意 failed | `failed` |
| 任意 in_progress | `in_progress` |
| 全部 pending | `pending` |
| 部分 completed + 其余 pending | `in_progress` |

聚合优先级：`aborted` > `failed` > `in_progress` > 混合 > `completed` > `pending`。任何子管线状态变更后，`pipeline-plan.json.status` 同步重算。

---

## 五、owner 字段 — 并发隔离

```
→ 扫描 .opc/pipelines/*/pipeline-plan.json
→ 发现 status: in_progress 的管线
→ 检查 owner.pid：
  ├── 进程存活 → 跳过（其他 session 正在跑）
  └── 进程已死 → 孤儿管线 → 提示用户恢复
```

详见 [06_lifecycle.md §恢复](06_lifecycle.md#五恢复)。

---

## 相关文档

- [04_state-json.md](04_state-json.md) — 阶段/节点状态
- [05_single-vs-split.md](05_single-vs-split.md) — 单/拆分管线触发条件
- [07_dependency-parallel.md](07_dependency-parallel.md) — `blocked_by` 与 `execution_order` 关系
