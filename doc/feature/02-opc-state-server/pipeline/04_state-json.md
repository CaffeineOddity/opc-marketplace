# 04 state.json 与状态枚举

每条子管线一份 `state.json`，位于 `sub-pipelines/<id>/state.json`，记录该子管线的 phase / node 执行状态。

---

## 一、完整结构

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
  "phases": [
    {
      "phase": "04-implement-design",
      "status": "completed",
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
          "timeout_minutes": 30,
          "retry_count": 0,
          "max_retries": 3
        }
      ]
    }
  ]
}
```

---

## 二、字段说明

| 字段 | 说明 |
|------|------|
| `task.complexity` | `low` / `medium` / `high` |
| `task.knowledge_unit` | 本条子管线负责的 unit 列表 |
| `phases[].status` | `pending` / `in_progress` / `completed` / `blocked` |
| `phases[].nodes[].status` | `pending` / `in_progress` / `completed` / `failed` |
| `phases[].nodes[].blocked_by` | 依赖的前置 node name |
| `phases[].nodes[].input` | 输入项，含 `type` + `path` |
| `phases[].nodes[].output` | 实际产出，knowledge 带 `version` |
| `phases[].nodes[].error` | 失败时写入，含 `message` + `type` |
| `phases[].nodes[].retry_count` | 已重试次数 |
| `phases[].nodes[].max_retries` | 重试上限，默认 3 |

---

## 三、状态枚举

| 层级 | 可选值 |
|------|--------|
| pipeline | `pending` → `in_progress` → `completed` / `failed` / `aborted` |
| phase | `pending` → `in_progress` → `completed` / `blocked` |
| node | `pending` → `in_progress` → `completed` / `failed` |

---

## 四、input / output 规则

| 状态 | 规则 |
|------|------|
| **pending** | 不写入 input/output |
| **in_progress** | 写入 input（与 node 定义一致） |
| **completed** | 写入 output（实际产出路径 + evidence 摘要） |
| **failed** | 保留 input，output 为空或部分写入，附加 error |

---

## 五、error 类型

| error.type | 说明 |
|-----------|------|
| `agent_error` | Agent 执行异常，可 retry |
| `test_failure` | 测试未通过 |
| `dependency_failure` | 前置节点失败 |
| `quality_gate_failed` | L1/L2 校验不通过，node 保持 in_progress |
| `timeout` | 超时，retry_count 未达上限时自动重试 |
| `user_abort` | 用户通过 opc_pipeline_abort 中断 |

---

## 相关文档

- [03_pipeline-plan.md](03_pipeline-plan.md) — 编排层 schema
- [../03_phase-overview.md](../03_phase-overview.md) — 阶段执行
- [../04_node-overview.md](../04_node-overview.md) — 节点执行与质量门
