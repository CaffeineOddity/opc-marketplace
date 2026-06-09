# 02 节点选择策略

`opc_phase_start` 扫描 `phases/<phase>/nodes/` 和项目 `opc-nodes/`，返回**原始候选列表**（不做语义匹配）。Claude 拿到列表后自行完成匹配排序 + 收集 `selection_evidence`，由 reflection-server **P5 反思位点**的 V1-V5 validator + meta-validator 决定推进路径。

---

## 一、opc_phase_start 返回

```
state-server 职责（纯确定性）:
  ① 扫描 phases/<phase>/nodes/*.md + opc-nodes/<phase>/nodes/*.md
  ② 解析每个节点的 frontmatter（name, tags, description, agents, input, output, quality_gates）
  ③ tag 交集过滤 → 排除与任务 tags 无交集的节点（always_show: true 除外）
  ④ 标记 scenario 推荐的节点
  ⑤ 返回原始列表（无 LLM 排序）+ reflection_budget_hint
```

---

## 二、Claude 的匹配排序

Claude 拿到 `available_nodes` 后执行：

**① 语义匹配** — 任务 description 与每个节点 description 的语义相似度。Claude 本身是 LLM，无需额外引擎。

**② Scenario 加权** — 命中 scenario 推荐的节点 +0.3 权重加成。

```
节点匹配得分 = 语义相似度 × 0.7 + scenario 加权 × 0.3

例: add-feature 推荐的节点:
  - api-design:        +0.3 weight
  - database-schema:   +0.3 weight
  - tdd-implementation: +0.3 weight
```

排序完成后，Claude 收集 `selection_evidence` 提交给 reflection-server P5 验证，详见 [04_phase-start.md §三](04_phase-start.md#三selection_evidence-schema)。

---

## 三、selection_evidence 字段（速查）

| 字段 | 说明 | 对应 validator |
|------|------|--------------|
| `matched_tags[]` | 每个选中 node 命中的 task_tags | V4 coverage |
| `scenario_hits[]` | 选中 node 中被 scenario 标 `recommended:true` 的集合 | V4 coverage |
| `file_domain_conflicts[]` | 选中 node 之间的文件域冲突 | V5 discrimination |
| `blocked_by_graph` | 输出→输入推导出的依赖图 | V2 referential |
| `coverage_gaps[]` | task_tags 中未被任何选中 node 覆盖的标签 | V4 coverage |

完整 schema 见 [05-opc-reflection-server/02-server-design/00_overview.md §二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)。

---

## 四、反思 budget-guard 上限（按 phase + complexity 配置）

`opc_phase_start` 返回的 `reflection_budget_hint.max_rounds`，作为 budget-guard 的硬上限：

| Phase | medium | high | 理由 |
|-------|--------|------|------|
| 00-ideation | 4 | 6 | 方向性探索，需多轮试错 |
| 01-validation | 2 | 4 | PRD/画像，少量关键决策 |
| 03-design | 3 | 5 | UI/UX 视觉决策需迭代 |
| 04-implement-design | 2 | 4 | API/DB 设计决策关键 |
| 05-implement | 3 | 5 | 节点最多，依赖链长 |
| 06-testing | 1 | 2 | 验证性为主 |
| 07-release | 1 | 2 | 操作性强 |
| 08-growth | 2 | 3 | 营销/SEO 策略需权衡 |
| 09-scale | 2 | 4 | 架构演进影响面大 |

low 复杂度走 quick_dispatch，不进入 phase 反思循环。

---

## 五、推进路径（由 V1-V5 + meta-validator 决定）

| validator + meta-validator 结果 | 节点选择 | 阶段推进（auto_advance） |
|--------------|---------|---------|
| V1-V5 全部 pass + 无严重 objection | AI 自行确定节点列表，调 `opc_phase_confirm` | 满足 auto_advance 4 条件之一（P5 通过） |
| V1-V5 pass + 中等 objection | 展示方案 + reasoning_trace + objection，用户一键确认 | 同上但 step_instruction 提示确认 |
| V1-V5 fail 或 严重 objection | 进入 P5 反思循环（M4 Critique + M5 Debate），受 budget-guard 约束 | `auto_advance: false`，等反思收敛或 ask_user |

> auto_advance 4 条件全集见 [06_phase-complete-reset.md §auto_advance](06_phase-complete-reset.md)；V1-V5 规则见 [05-opc-reflection-server/02-server-design/00_overview.md §三](../../05-opc-reflection-server/02-server-design/00_overview.md#三validators)。

---

## 相关文档

- [03_scenarios.md](03_scenarios.md) — Scenario 加权来源
- [04_phase-start.md](04_phase-start.md) — `opc_phase_start` + P5 selection_evidence 反思流程
- [06_phase-complete-reset.md](06_phase-complete-reset.md) — auto_advance 4 条件
- [../01-intent-analysis/06_task-analysis.md](../01-intent-analysis/06_task-analysis.md) — 任务复杂度决定反思预算
- [../../05-opc-reflection-server/00_index.md](../../05-opc-reflection-server/00_index.md) — 反思方法学总览
