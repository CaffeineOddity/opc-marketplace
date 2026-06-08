# 02 节点选择策略

`opc_phase_start` 扫描 `phases/<phase>/nodes/` 和项目 `opc-nodes/`，返回**原始候选列表**（不做语义匹配）。Claude 拿到列表后自行完成匹配排序。

---

## 一、opc_phase_start 返回

```
state-server 职责（纯确定性）:
  ① 扫描 phases/<phase>/nodes/*.md + opc-nodes/<phase>/nodes/*.md
  ② 解析每个节点的 frontmatter（name, tags, description, agents, input, output, quality_gates）
  ③ tag 交集过滤 → 排除与任务 tags 无交集的节点（always_show: true 除外）
  ④ 标记 scenario 推荐的节点
  ⑤ 返回原始列表（无 LLM 排序）
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

---

## 三、反思轮次

每个 phase 独立配置 `max_reflection_rounds`：

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

---

## 四、置信度阈值

| Phase | `min_confidence_for_auto` | 理由 |
|-------|--------------------------|------|
| 00-ideation | 0.75 | 探索性强，允许 AI 自主尝试 |
| 01-validation | 0.80 | PRD 影响后续全链路 |
| 03-design | 0.80 | UI/UX 主观性强 |
| 04-implement-design | 0.85 | API/DB 设计决策关键 |
| 05-implement | 0.80 | 节点多但操作性为主 |
| 06-testing | 0.70 | 验证性为主，低风险 |
| 07-release | 0.85 | 部署涉及生产环境 |
| 08-growth | 0.75 | 营销策略可逆 |
| 09-scale | 0.90 | 架构演进影响面大 |

| 置信度 vs 阈值 | 节点选择 | 阶段推进 |
|--------------|---------|---------|
| ≥ `min_confidence_for_auto` | AI 自行确定节点列表 | `auto_advance: true` |
| < `min_confidence_for_auto` | 展示候选列表，请求确认 | `auto_advance: false` |

---

## 相关文档

- [03_scenarios.md](03_scenarios.md) — Scenario 加权来源
- [04_phase-start.md](04_phase-start.md) — `opc_phase_start` + 自省评估流程
- [../intent-analysis/06_task-analysis.md](../intent-analysis/06_task-analysis.md) — 任务复杂度决定阈值
