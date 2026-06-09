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
  "phase_plan": {
    "available": [
      "00-ideation", "01-validation", "03-design",
      "04-implement-design", "05-implement", "06-testing",
      "07-release", "08-growth", "09-scale"
    ],
    "selected": ["04-implement-design", "05-implement", "06-testing"],
    "selected_by": "task_analysis",
    "selection_rationale": "medium 复杂度 + add-feature scenario：跳过构思/验证/设计，从实现设计开始",
    "scenario_hints": ["add-feature"],
    "order_validated": true
  },
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
| `phase_plan.available` | 当前 marketplace 提供的全部可用 phase（来源：扫描 `phases/` 目录） |
| `phase_plan.selected` | 本子管线实际要执行的 phase 子集，按 `order.prev/next` 偏序排序 |
| `phase_plan.selected_by` | 选择来源：`task_analysis` / `scenario_template` / `user_specified` / `replan` |
| `phase_plan.selection_rationale` | 自然语言说明为何这样选（供反思 evidence 与 replan 复用） |
| `phase_plan.scenario_hints` | task-analysis 推断出的 scenario 列表，影响 phase 选择与节点加权 |
| `phase_plan.order_validated` | 是否通过偏序校验（详见 §六） |
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

## 六、phase_plan 校验规则（deterministic）

`opc_pipeline_create` / `opc_pipeline_replan` 写入 `phase_plan` 时，state-server 必须通过以下校验，否则 reject 并要求重新提交：

| 规则 | 说明 | 失败处理 |
|------|------|---------|
| **存在性** | `selected` 中每一项都必须出现在 `available` 里 | reject，提示无效 phase id |
| **偏序合法** | `selected` 顺序与各 `phase.md` 的 `order.prev/next` 偏序一致（不能 `06-testing` 排在 `04-implement-design` 之前） | reject，提示偏序冲突 |
| **非空** | `selected.length ≥ 1` | reject（low 复杂度走 `opc_quick_dispatch`，不写 phase_plan） |
| **与 phases[] 一致** | `phases[].phase` 集合 == `selected` 集合 | reject，提示集合不匹配 |
| **rationale 必填** | `selection_rationale` 非空字符串 | reject，强制说明理由（供反思复用） |

校验通过后 `order_validated: true`。任何一条 fail，整个 plan 写入回滚，state.json 不变。

`opc_phase_complete` 推进到下一 phase 时按 `selected` 顺序查找，而不是按 `available` 全集——确保跳过的 phase 不会被 auto_advance 拉回来。

---

## 相关文档

- [03_pipeline-plan.md](03_pipeline-plan.md) — 编排层 schema
- [../03-phase/00_overview.md](../03-phase/00_overview.md) — 阶段执行
- [../04-node/00_overview.md](../04-node/00_overview.md) — 节点执行与质量门
