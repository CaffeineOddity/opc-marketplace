# 管线状态（state.json）

> 管线概念和生命周期见 [16 管线](16-pipeline.md)。工具 API 和状态变更行为见 [17 opc-state-server](17-mcp-state-server.md)。本文档仅定义 state.json 的数据结构。

---

## state.json

位于 `sub-pipelines/<name>/state.json`。单管线和拆分管线的子管线格式相同。

`phases[].nodes[]` 即为**阶段节点计划**：由 `opc_phase_confirm` 调用 node-resolver 后写入，包含选中节点、`blocked_by` 依赖、执行分组。

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

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 子管线 ID（单管线为 `"sub-1"`） |
| `title` | string | 子管线标题 |
| `task.description` | string | 任务一句话描述 |
| `task.complexity` | enum | `low` / `medium` / `high` |
| `task.knowledge_unit` | string[] | 本管线负责的 unit 列表 |
| `phases[].status` | enum | `pending` / `in_progress` / `completed` / `blocked` |
| `phases[].nodes[].status` | enum | `pending` / `in_progress` / `completed` / `failed` |
| `phases[].nodes[].blocked_by` | string[] | 依赖的前置 node name |
| `phases[].nodes[].input` | object[] | 输入项，含 `type` + `path` |
| `phases[].nodes[].output` | object[] | 实际产出，knowledge 带 `version` |
| `phases[].nodes[].error` | object\|null | 失败时写入，含 `message` + `type` |
| `phases[].nodes[].timeout_minutes` | number\|null | 来自 node 定义，null 表示不超时 |
| `phases[].nodes[].retry_count` | number | 已重试次数 |
| `phases[].nodes[].max_retries` | number | 重试上限（来自 node 定义，默认 3） |

---

## 状态枚举

| 层级 | 可选值 |
|------|--------|
| pipeline | `pending` → `in_progress` → `completed` / `failed` / `aborted` |
| phase | `pending` → `in_progress` → `completed` / `blocked` |
| node | `pending` → `in_progress` → `completed` / `failed` |

---

## input/output 写入规则

| 状态 | 规则 |
|------|------|
| **pending** | 不写入 input/output |
| **in_progress** | 写入 input（与 node 定义一致） |
| **completed** | 写入 output（实际产出路径 + evidence 摘要） |
| **failed** | 保留 input，output 为空或部分写入，附加 error |

---

## error 字段

```json
{
  "name": "tdd-implementation",
  "status": "failed",
  "agent": "backend-engineer",
  "error": {
    "message": "测试失败: 3/12 tests failing",
    "type": "test_failure"
  }
}
```

| error.type | 说明 |
|-----------|------|
| `agent_error` | Agent 执行异常 |
| `test_failure` | 测试未通过 |
| `dependency_failure` | 前置节点失败导致 |
| `quality_gate_failed` | L1/L2 校验不通过，node 保持 in_progress |
| `timeout` | 执行时间超过 timeout_minutes |
| `user_abort` | 用户通过 opc_pipeline_abort 中断 |

---

## 质量门字段（node 定义）

node 定义中的 quality_gates 字段（见 [05 节点](05-nodes.md)）：

| gate 类型 | 校验方式 |
|-----------|---------|
| `test_pass` | `evidence.test_results.failed === 0` |
| `lint_pass` | `evidence.lint_results.errors === 0` |
| `build_pass` | `evidence.build_passed === true` |
| `type_check_pass` | `evidence.type_check_passed === true` |

不声明 `quality_gates` 的节点只走 L1（产出物存在性校验）。

---

## 相关文档

- [16 管线](16-pipeline.md) — 管线概念、目录结构、pipeline-plan.json、生命周期
- [17 opc-state-server](17-mcp-state-server.md) — 工具 API、质量校验、级联重置、超时检测
- [05 节点](05-nodes.md) — 节点定义字段（quality_gates、timeout_minutes、max_retries）
