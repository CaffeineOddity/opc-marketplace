# 03 pipeline-plan.json

管线编排计划。由 `opc_pipeline_create` 生成、`opc_pipeline_lifecycle({action:"replan"})` 修改、`opc_pipeline_lifecycle({action:"complete"/"abort"})` 终结。

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
    {"group": 1, "sub_pipeline_ids": ["sub-1"]}
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
    {"group": 1, "sub_pipeline_ids": ["sub-1", "sub-2"]},
    {"group": 2, "sub_pipeline_ids": ["sub-3"]},
    {"group": 3, "sub_pipeline_ids": ["sub-4"]}
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
| `sub_pipelines[].status` | `pending` / `in_progress` / `paused` / `completed` / `failed` / `aborted` |
| `sub_pipelines[].blocked_by` | 依赖的其他子管线 ID |
| `sub_pipelines[].execution_priority` | `normal`（默认，按 `execution_order` 串行）/ `immediate`（插队，挂起当前 sub 优先执行） |
| `sub_pipelines[].inserted_at` | 插入时间戳（仅 `add_sub_pipeline` 注入时存在），用于审计 |
| `sub_pipelines[].paused_at` | 挂起时间戳（status=paused 时存在），含 `node` 字段指向暂停时的 node_name |
| `execution_order` | 执行分组列表。`sub_pipeline_ids` 按列表顺序串行执行；group 之间串行 |

> **phase 选择不在本文件**：每条子管线实际跑哪些 phase 由 `sub-pipelines/<id>/state.json` 的 `phase_plan` 块声明（包含 `available` / `selected` / `selected_by` / `selection_rationale`，并由 state-server 做偏序与一致性校验）。详见 [04_state-json.md 六](04_state-json.md#六phase_plan-校验规则deterministic)。

---

## 四、状态聚合规则

| 条件 | 整体 status |
|------|-----------|
| 全部 completed | `completed` |
| 任意 aborted | `aborted` |
| 任意 failed | `failed` |
| 任意 in_progress | `in_progress` |
| 任意 paused（无 in_progress / failed / aborted）| `in_progress`（管线仍活跃，等待 resume） |
| 全部 pending | `pending` |
| 部分 completed + 其余 pending | `in_progress` |

聚合优先级：`aborted` > `failed` > `in_progress` > 混合 > `completed` > `pending`。`paused` 视同 `in_progress` 参与活跃判定（owner 不释放），任何子管线状态变更后，`pipeline-plan.json.status` 同步重算。

---

## 五、owner 字段 — 进程隔离

```
→ 扫描 .opc/pipelines/*/pipeline-plan.json
→ 发现 status: in_progress 的管线
→ 检查 owner.pid：
  ├── 进程存活 → 跳过（其他 session 正在跑）
  └── 进程已死 → 孤儿管线 → 提示用户恢复
```

串行执行下同一时刻只有一条 sub 在写状态，无需原子写保护。owner.pid 仅用于跨 session 的孤儿检测。详见 [06_lifecycle.md 恢复](06_lifecycle.md#五恢复)。

---

## 相关文档

- [04_state-json.md](04_state-json.md) — 阶段/节点状态
- [05_single-vs-split.md](05_single-vs-split.md) — 单/拆分管线触发条件
- [07_dependency-serial.md](07_dependency-serial.md) — `blocked_by` 与 `execution_order` 关系
- [11_insert-resume.md](11_insert-resume.md) — sub-pipeline 插队与挂起/恢复契约
