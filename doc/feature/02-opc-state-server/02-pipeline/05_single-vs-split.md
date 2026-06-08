# 05 单管线 vs 拆分管线

---

## 一、拆分触发条件

task-analysis 输出中需要**修改**的 unit 数量 ≥ 2 时，触发 task-decomposition：

- 修改的 unit 互相独立 → 拆分为独立子管线
- 修改的 unit 有 `_refs` 依赖 → 合并或建立 `blocked_by`

判定由 `opc_task_analysis_complete` 路由完成，详见 [intent-analysis task-analysis](../01-intent-analysis/06_task-analysis.md)。

---

## 二、单管线

只有 1 条子管线（sub-1），`blocked_by` 为空，1 个 execution group。跳过 task-decomposition 环节，由 `opc_task_analysis_complete` 直接路由到 `brief_generation`。

```json
{
  "sub_pipelines": [
    {"id": "sub-1", "blocked_by": []}
  ],
  "execution_order": [
    {"group": 1, "parallel": ["sub-1"]}
  ]
}
```

---

## 三、knowledge_unit 按子管线分配

每条子管线独立加载自己的 `knowledge_unit`。`_refs` 关联的 unit 自动标记为可读（read-only），不计入 modify_count。

| 子管线 | 拥有 unit（可读写） | 关联 unit（只读） |
|------|---|---|
| sub-1 商品管理 | `product` | `user-center` |
| sub-3 购物车 | `cart` | `product`, `user-center` |

---

## 相关文档

- [03_pipeline-plan.md](03_pipeline-plan.md) — `sub_pipelines[]` schema
- [../01-intent-analysis/07_task-decomposition.md](../01-intent-analysis/07_task-decomposition.md) — 拆分规则
- [07_dependency-parallel.md](07_dependency-parallel.md) — 依赖与并行执行
