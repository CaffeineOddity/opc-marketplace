# 07 跨管线依赖与并行执行

---

## 一、blocked_by 语义

sub-3 声明 `blocked_by: ["sub-1", "sub-2"]`，则 sub-3 必须等 sub-1 和 sub-2 都 `completed` 后才能启动。

`blocked_by` 是 sub_pipelines 间的依赖图，由 task-decomposition 推导，由 `opc_pipeline_create` 校验。

---

## 二、execution_order 分组

- `parallel`：组内子管线可同时执行
- `sequential`：按顺序执行
- group 之间严格串行

`execution_order` 必须与 `blocked_by` 推导的拓扑排序一致，`opc_pipeline_create` 时校验。

### 示例

```json
"sub_pipelines": [
  {"id": "sub-1", "blocked_by": []},
  {"id": "sub-2", "blocked_by": []},
  {"id": "sub-3", "blocked_by": ["sub-1", "sub-2"]}
],
"execution_order": [
  {"group": 1, "parallel":   ["sub-1", "sub-2"]},
  {"group": 2, "sequential": ["sub-3"]}
]
```

---

## 三、失败传播

子管线 `failed` 阻塞所有依赖它的子管线。`failed` 子管线不出现在 `ready_sub_pipelines` 中。

恢复路径：
- 修复 → `opc_pipeline_recover` → 重新进入 ready 队列
- 放弃 → `opc_pipeline_abort` → 整条管线终止

---

## 四、多 Feature 并行

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
- [09_tools.md](09_tools.md) — `opc_pipeline_status` 返回 `ready_sub_pipelines`
