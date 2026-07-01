# 03 — 膨胀控制（C1–C4）

> 本章展开 `00_overview.md` §四的 4 个膨胀控制策略，包含完整参数、
> 阈值调优指南、控制间的交互、以及边缘场景处理。

## 一、总览

corrections 库天然有膨胀压力：每次 pipeline 都可能产新条目，
加上 seed 注入和跨项目同步，数月后可达数百条。4 个控制分层拦截：

```
写入路径                          注入路径
────────                          ────────
C1 合并优先     ← distiller 写入    C3 容量上限   ← reflection 注入
C2 衰减+冷冻    ← 周期性扫描         C4 预算截断   ← enhanced_prompt 拼装
```

写入侧（C1/C2）控制存储膨胀；注入侧（C3/C4）控制 prompt 膨胀。

## 二、C1 — 合并优先于新建

### 2.1 机制

distiller 在写入 L2 前，先对 L1 提炼结果做相似度查询：

```
distiller 提炼 L1 条目
    │
    ├── 提取 keywords[] + step
    ├── opc_corrections({action:"query", step, keywords})
    │       └── 返回同 step 下 keyword 交集 ≥ 1 的现有条目
    ├── 逐条计算相似度（keyword Jaccard + body embedding cosine）
    ├── 相似度 > SIM_THRESH → 合并到现有条目
    │       ├── hotness += 1
    │       ├── updated_at = now
    │       └── body 末尾追加 "## 补充案例\n<新 case>"
    └── 相似度 ≤ SIM_THRESH → 新建条目
```

### 2.2 相似度计算

```
similarity(A, B) = 0.4 × jaccard(A.keywords, B.keywords) + 0.6 × cosine(A.body_embedding, B.body_embedding)
```

权重偏向语义匹配（0.6），但保留 keyword 精确匹配（0.4）来防止同形异义词误合并。

### 2.3 参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `SIM_THRESH` | 0.65 | 判定为"相似"的阈值 |
| `SIM_THRESH_HIGH` | 0.85 | 判定为"高度相似"（跳过人工确认）|
| `SIM_KEYWORD_WEIGHT` | 0.4 | keyword Jaccard 在相似度中的权重 |

### 2.4 边界情况

| 场景 | 处理 |
|---|---|
| 同 step 无任何条目 | 直接新建 |
| 相似度在 [SIM_THRESH, SIM_THRESH_HIGH) | 合并但标记 `needs_review: true`，下次用户 query 时提示确认 |
| 两条现有条目都超过阈值 | 合并到相似度最高的那条 |
| 合并后 body 中"补充案例"超过 5 条 | 提示 distiller 考虑拆分为独立条目 |

## 三、C2 — hotness 衰减 + 冷冻

### 3.1 衰减机制

每周日凌晨（UTC），对 `.opc/memory/corrections/` 所有条目执行衰减：

```
for each entry:
    hotness = floor(hotness * DECAY_RATE)
    if hotness < FREEZE_THRESH:
        frozen = true
```

### 3.2 参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `DECAY_RATE` | 0.9 | 每周衰减系数 |
| `FREEZE_THRESH` | 2 | 低于此值冷冻 |
| `DECAY_MIN_HOTNESS` | 1 | 衰减后 hotness 的保底值（不会衰减到 0）|

### 3.3 冷冻行为

```
frozen = true 的条目：
    ├── 从注入候选池移除（C3 不计入 top-K）
    ├── 仍可通过 opc_corrections({action:"query"}) 查到
    ├── 若被手动 query 且用户反馈"有用" → 解冻（frozen=false, hotness=3）
    └── 若被 distiller 再次命中 → 解冻 + hotness += 1
```

### 3.4 hotness 增长

| 事件 | hotness 变化 |
|---|---|
| distiller 合并 | +1 |
| reflection 采纳（被注入且 objection 减少）| +1 |
| 用户显式 `opc_corrections({action:"endorse"})` | +2 |
| 从 L3 seed 新注入 | 初始值 = 3 |
| 用户手动创建 | 初始值 = 5 |

### 3.5 衰减曲线示例

```
初始 hotness = 10
周 0: 10
周 1: 9   (×0.9)
周 2: 8   (×0.9)
周 4: 6   → 仍活跃
周 8: 4   → 仍活跃
周 12: 2  → 接近冷冻
周 16: 1  → 冷冻（< FREEZE_THRESH 未触发因保底值为1）
周 16+: frozen=true（hotness ≤ 2）
```

频繁命中的条目 hotness 保持高位（10+），偶尔命中的条目在 ~3 个月后自然冷冻。

## 四、C3 — per-step 容量上限

### 4.1 机制

每次 `opc_reflect_plan` 为某 step 注入教训时，限制注入数量：

```
opc_corrections({action:"query", step, include_frozen: false})
    │
    ├── 返回所有匹配条目，按 hotness 降序
    └── 取 top K，其中 K = MAX_INJECTIONS_PER_STEP
```

### 4.2 参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `MAX_INJECTIONS_PER_STEP` | 5 | 同 step 同时注入的最大条数 |
| `INJECTION_OVERFLOW` | `truncate` | 超出时的行为：`truncate`（截断）或 `warn`（截断 + 警告）|

### 4.3 优先级排序

注入选择不是纯 hotness 排序，而是加权：

```
priority = hotness × recency_bonus × source_bonus

recency_bonus:
    updated_at 在 7 天内 → 1.2
    updated_at 在 30 天内 → 1.0
    updated_at > 30 天 → 0.8

source_bonus:
    source = user → 1.3
    source = distiller → 1.0
    source = reflexion → 0.9
    source = seed → 0.7
```

用户直接创建的纠正优先级最高，seed 注入的最低（等项目自身积累后再提升）。

### 4.4 容量与 section 的关系

容量上限是 per-step 的，不限制 section 分布。
同 step 的 5 条注入可能来自 5 个不同 section，
对 enhanced_prompt 来说是自然的主题多样性。

## 五、C4 — 注入 prompt 预算

### 5.1 机制

拼装 enhanced_prompt 时，限制 corrections 片段的总 token 数：

```
enhanced_prompt = base_prompt
for each injection in top-K (C3):
    snippet = injection.body["反思 prompt 增强片段"]
    if total_tokens + token_count(snippet) ≤ B:
        enhanced_prompt += snippet
        total_tokens += token_count(snippet)
    else:
        break  // 截断
```

### 5.2 参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `CORRECTIONS_TOKEN_BUDGET` | 800 | corrections 片段总 token 上限 |
| `MIN_SNIPPET_TOKENS` | 40 | 单个片段最少保留 token（若不足则整条跳过）|

### 5.3 排序

注入顺序 = C3 的 priority 排序（hotness × recency × source），
预算从高 priority 开始分配，低 priority 的条目可能因预算耗尽被截断。

### 5.4 截断行为

```
若某条 snippet 的 tokens > 剩余预算:
    ├── 若 snippet tokens > 剩余预算 × 2 → 跳过此条，尝试下一条
    └── 若 snippet tokens ≤ 剩余预算 × 2 → 截断 snippet 到剩余预算
```

## 六、控制间交互

### 6.1 全链路示例

```
distiller 提炼 8 条新纠正
    │
    ▼ C1: 相似度查询
    ├── 3 条合并到现有（hotness +1）
    └── 5 条新建（hotness = 1）
            │
            ▼ C2: 下次周衰减
            ├── 新建条目 hotness 从 1 → 1（保底）
            └── 某旧条目 hotness 从 3 → 2 → 接近冷冻
                    │
                    ▼ 下次 reflection 注入
                    C3: step=P1, top-5 按 priority 排序
                    C4: 前 4 条总计 720 tokens（< 800），第 5 条 150 tokens → 截断到 80 tokens
                    最终 5 条注入
```

### 6.2 C2 ↔ C3 交互

C2 冷冻的条目被 C3 排除在候选池外，如果某 step 的活跃条目全部被冷冻，
该 step 的 reflection 注入为空——这是符合预期的：过时教训无注入价值。

### 6.3 C1 ↔ C3 交互

C1 合并导致单一条目 hotness 更高，在 C3 排序中更靠前。
合并→积累 hotness→优先级提高→更容易被注入→命中反馈→hotness 再提高。
正反馈循环使高价值纠正自然浮到顶部。

### 6.4 C3 ↔ C4 交互

C3 限数量、C4 限 token。在典型的 hotness 分布下（top-3 高 hotness，尾部低），
C4 预算通常足够容纳 C3 选出的全部条目。当某 step 出现多条大文本条目时，
C4 可能在 C3 之前就触发截断。

## 七、监控与调优

### 7.1 膨胀指标

`opc_reflect_admin({action:"query_stats"})` 返回：

```json
{
  "expansion_stats": {
    "total_entries": 47,
    "frozen_entries": 12,
    "avg_hotness": 4.3,
    "entries_by_step": { "P1": 8, "P2": 12, "P3": 5 },
    "merge_rate_7d": 0.35,
    "freeze_rate_7d": 0.08,
    "avg_injections_per_reflection": 3.2,
    "budget_exhausted_rate": 0.12
  }
}
```

### 7.2 调优建议

| 指标异常 | 建议 |
|---|---|
| `merge_rate_7d < 0.2` | C1 阈值太高，新条目太多；降低 `SIM_THRESH` 到 0.55 |
| `freeze_rate_7d > 0.2` | 条目流失太快；提高 `FREEZE_THRESH` 到 3 或降低 `DECAY_RATE` 到 0.95 |
| `budget_exhausted_rate > 0.3` | C4 预算不足或被大文本条目填充；提高 `CORRECTIONS_TOKEN_BUDGET` 或控制单条目 snippet 长度 |
| `entries_by_step` 某 step > 20 | 该 step 聚集过多；检查是否 C1 相似度计算对该 step 类型失效 |
| `avg_injections_per_reflection < 1.5` | 大部分 reflection 没命中任何纠正；检查 seed 覆盖或 keyword 匹配精度 |

## 八、相关文档

- [01 存储层定义](./01_storage-layers.md) — L2 条目字段定义
- [02 Schema 演化](./02_schema-and-evolution.md) — 膨胀控制与 schema version 的交互
- [04 Seed Corrections](./04_seed-corrections.md) — seed 注入如何参与 C1–C4
- [父文档](./00_overview.md) — corrections 存储总览
