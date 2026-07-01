# 04 Meta-Reflection（反思器自身的元校验与健康度治理）

> Meta-validator 校验反思 sub-agent 的输出真伪、健康度统计跟踪每种方法 × step 的长期表现、`unlearn_method` 自动熔断。本文档把 [02-server-design 四](../02-server-design/00_overview.md#四meta-validator反思器自身的输出校验) 的规则集和 [02-server-design 七](../02-server-design/00_overview.md#七可观测性) 的可观测指标合并成 **A/B/C/D 四类规则 + FP/FN 指标 + 熔断阈值（部分 TODO）**。

---

## 一、规则集分类（A / B / C / D）

按"校验对象 + 行动严重程度"分四类。每条规则给出：触发条件、行动、计入哪个指标。

### A 类 — 引用真伪（最严格，硬拒）

| 规则 ID | 触发条件 | 行动 | 计入指标 |
|---|---|---|---|
| **A1** | objection 引用的 `evidence_ref` 在 artifact 中不存在 | 丢弃该 objection；reasoning_trace 标 `dropped_a1` | `meta_fp_count.A1` |
| **A2** | objection 引用的文件路径 `Read` 失败（unit/section/sub 不存在） | 同上 | `meta_fp_count.A2` |
| **A3** | objection 引用的字段在 evidence schema 中不存在（如 P5 引用 `selection_evidence.foo` 但字段名错） | 同上 | `meta_fp_count.A3` |
| **A4** | objection 引用的 `user_quote` 在 `intent_evidence.user_quotes[]` 中找不到（P1 专属） | 同上 | `meta_fp_count.A4` |

**性质**：A 类是**确定性纯函数**校验（字段查找 / 文件 stat），零 LLM；reject 即丢，**不写入反思 log**（避免污染下次 reflexion）。

### B 类 — 文本质量（弱拒，要求重做）

| 规则 ID | 触发条件 | 行动 | 计入指标 |
|---|---|---|---|
| **B1** | objection 文本与 artifact 关键词重合度 < 0.15（典型阈值，可配置） | 标 `low_relevance`；要求 sub-agent 补 reasoning_trace 后再提交 | `meta_low_relevance_count` |
| **B2** | reasoning_trace 长度 < `min_reasoning_length`（默认 50 字符） | reject 整次反思；触发该方法 reschedule | `meta_reject_count.B2` |
| **B3** | reasoning_trace 缺失（字段不在 response 中） | 同 B2 | `meta_reject_count.B3` |
| **B4** | objection 文本与本轮已 kept 的某条 objection 文本相似度 > 0.85（重复 objection） | 仅保留一条 | `meta_dedup_count` |

**性质**：B 类用文本启发式（关键词重合、字符长度、cosine similarity），仍是 TS 纯函数。B1/B2/B3 触发 reject 时**计入方法健康度**（影响后续 unlearn 决策）。

### C 类 — 方法专属（针对单方法的反模式）

| 规则 ID | 适用方法 | 触发条件 | 行动 | 计入指标 |
|---|---|---|---|---|
| **C-Critique-1** | critique | critic 返回 0 条 objection 且 reasoning_trace 中含 "no issues" 类肯定句 | 标 `confirmatory_bias`，要求 sub-agent 重做（强 prompt 加 "你必须至少提出一个 risk"） | `meta_confirmatory_count.M4` |
| **C-Debate-1** | debate | 双方立场重合度 > 0.7（cosine on 立场摘要） | reject 整次 debate；判 `fake_debate`；本轮直接降级 secondary | `meta_fake_debate_count` |
| **C-Debate-2** | debate | 双方 round 数 < 2（连一个回合都没辩） | 同 C-Debate-1 | 同上 |
| **C-ToT-1** | tot | 所有分支评分 > 0.9 | 标 `optimism_bias`；强制追加一个 critic agent 做悲观裁定 | `meta_optimism_count.M6` |
| **C-ToT-2** | tot | 分支数 < 2 | reject；ToT 退化为 single-path 失去意义 | `meta_single_path_count` |
| **C-CoVe-1** | cove | 断言数 < 2 | reject | `meta_under_decomposed.M3` |
| **C-CoVe-2** | cove | 断言全部 `verified=true` 但 artifact 有 V4 coverage < 0.7 | 标 `surface_verification`，要求重做 | `meta_surface_count` |

**性质**：C 类需要语义判断的部分（"no issues" 类肯定句、"立场重合度"）由短 TS 启发式 + 关键词词典实现；不调 LLM。FP 率会比 A/B 高，因此**只发 warning 不直接 reject**（除 C-Debate-1/2、C-ToT-2、C-CoVe-1）。

### D 类 — 时序与外部一致性

| 规则 ID | 触发条件 | 行动 | 计入指标 |
|---|---|---|---|
| **D1** | objection 引用的 knowledge 文件 `mtime` > 反思任务派发时间 | reasoning_trace 末尾追加 `warning: evidence_file_mutated_during_reflection`；**不拒**（用户在反思中途手改 knowledge 是合法行为，详见 [07-dependency-serial 六·补](../../02-opc-state-server/02-pipeline/07_dependency-serial.md#六补-反思期间的-knowledge-稳定性约定人类介入边界)） | `meta_concurrent_edit_count` |
| **D2** | objection 引用的 corrections 条目 `frozen=true` 或 `deprecated_by!=null` | 丢弃 objection，附说明 "referenced correction is frozen/deprecated" | `meta_stale_correction_count` |
| **D3** | sub-agent 返回时间 > `step.max_latency_ms`（默认 30s for critic, 90s for debate, 120s for tot） | 强制丢弃 sub-agent 全部输出；降级 secondary | `meta_timeout_count.<method>` |
| **D4** | sub-agent 调用了 `tools` 白名单外的工具（host C4 已拦截，仅作 audit 兜底） | 反思整次作废 + 报警（潜在配置错误） | `meta_tool_violation_count` |

---

## 二、指标 schema 与聚合

所有 meta 指标按 `(method, step, project_id)` 三维聚合，写到 `.opc/logs/reflection/<session_id>/meta-stats.jsonl`，`opc_reflect_admin({action:"query_stats"})` 直接读。

### 单条 meta-event schema

```typescript
type MetaEvent = {
  ts: ISO8601
  session_id: string
  reflection_id: string
  step: 'intent_analysis' | ... | 'phase_advance'
  method: 'cove' | 'critique' | 'debate' | 'tot' | 'reflexion' | 'validator'
  rule_id: 'A1' | 'A2' | ... | 'D4'
  outcome: 'dropped' | 'warned' | 'rejected'
  detail?: object   // 规则专属上下文（如 dropped objection 的 id、similarity score）
}
```

### 聚合维度

| 指标名 | 公式 | 用途 |
|---|---|---|
| `fp_rate(method, step)` | A 类 + B 类 reject / 总 objection 数（30 天滚动窗口） | 衡量该方法在该 step 的"瞎说率"，超阈值触发 unlearn 建议 |
| `dedup_rate(method, step)` | B4 dropped / 总 objection | 衡量 sub-agent 是否在重复刷 objection |
| `fake_debate_rate(step)` | C-Debate-1 + C-Debate-2 / debate 总次数 | 仅 M5 |
| `optimism_rate(step)` | C-ToT-1 / ToT 总次数 | 仅 M6 |
| `concurrent_edit_rate()` | D1 / 总反思数 | 衡量"反思期间用户改 knowledge"频次，过高暗示流程节奏问题 |
| `objection_to_evidence_diff_rate(method, step)` | 反思后 evidence 真实发生 diff 的次数 / kept_objections 数 | 衡量 objection 的"有效命中率"（已采纳 + 改了东西） |
| `corrections_hit_rate(step)` | 注入的 prior corrections 被采纳数 / 注入数 | 衡量 corrections 库质量 |

### 健康度面板（dashboard 最小集）

| 面板项 | 数据源 |
|---|---|
| 各方法 × step 的 FP 率热力图 | `fp_rate(method, step)` |
| 反思总开销占 pipeline 比例（rounds × 平均时长） | `.opc/logs/reflection/<sid>/<rid>.json.latency_ms` 聚合 |
| `unlearn_method` 当前激活列表 | reflection-server in-memory + 持久化 `.opc/state/unlearn-state.json` |
| 过期反思告警（24h 滚动） | `expired_pending_count_24h` 等（见 [02-server-design 七](../02-server-design/00_overview.md#七可观测性) `expiry_metrics`） |

---

## 三、`unlearn_method` 熔断阈值（部分 TODO）

`opc_reflect_admin({action:"unlearn_method", method, step, duration_hours?})` 可手动禁用某方法 × step 组合；同时 reflection-server 后台跑**自动熔断器**按下表触发建议（**不自动执行，需要用户/Claude 确认**）。

| 触发条件 | 建议行动 | 持续时间 | 状态 |
|---|---|---|---|
| `fp_rate(method, step)` > **`THRESH_FP`** 且窗口内 ≥ **`MIN_SAMPLES`** 次反思 | 建议 unlearn (method, step) | **`UNLEARN_TTL_HOURS`** | **TODO**（阈值待 PoC 数据填充） |
| `fake_debate_rate(step)` > **`THRESH_FAKE_DEBATE`** | 建议 unlearn (M5, step)；自动降级到 M4 | 同上 | **TODO** |
| `optimism_rate(step)` > **`THRESH_OPTIMISM`** | 建议 unlearn (M6, step)；自动降级到 M4 | 同上 | **TODO** |
| `meta_timeout_count.<method>` 连续 5 次 same method | 立即临时 unlearn 24h（不需用户确认，硬熔断） | 24h | ✅ 已定 |
| `meta_tool_violation_count` 任何一次触发 | 立即报警 + 暂停该 sub-agent kit 装载 | 持续到用户确认修复 | ✅ 已定 |

**待 PoC 数据填充的阈值清单**（占位常量，第一次实施先用以下保守默认，PoC 数据收集 ≥ 2 周后再校准）：

```typescript
const THRESH_FP = 0.30              // 30% objection 被丢则疑似瞎说（保守上限）
const MIN_SAMPLES = 20              // 至少 20 次反思才统计
const THRESH_FAKE_DEBATE = 0.40     // 40% debate 假辩论则熔断
const THRESH_OPTIMISM = 0.50        // 50% ToT 乐观偏差则熔断
const UNLEARN_TTL_HOURS = 24        // 默认熔断 24h，到期自动恢复
```

> 这些常量**显式标 TODO**：第一版以默认值上线，PoC 数据回流后由 `opc_reflect_admin({action:"query_stats"})` 报表决定是否调整。**不要在文档/代码里硬写为最终值**。

### 熔断状态持久化

```
.opc/state/unlearn-state.json
{
  "active": [
    {
      "method": "debate",
      "step": "task_decomposition",
      "reason": "fake_debate_rate=0.52 > 0.40",
      "activated_at": "2026-06-09T11:00:00Z",
      "expires_at": "2026-06-10T11:00:00Z",
      "triggered_by": "auto" | "manual"
    }
  ],
  "history": [...]  // 仅保留 30 天
}
```

reflection-server 启动时加载该文件；`opc_reflect_plan` 在选 method 时跳过 active 列表里命中的组合，降级 secondary。

---

## 四、Meta-Reflection 报告（pipeline 级总结）

`opc_pipeline_lifecycle({action:"complete"})` 触发 distiller 之外，同时跑一次 meta-reflection（[00_overview 四](00_overview.md#四meta-reflectionpipeline-级总结)），输出 `.opc/logs/meta-reflection/<pipeline-id>.md`，结构：

```markdown
# Meta-Reflection: <pipeline-id>

## 1. 反思开销
- 总反思轮数：<n>
- 总耗时：<ms>，占 pipeline 耗时 <pct>%
- 方法分布：M3=<n>, M4=<n>, M5=<n>, M6=<n>

## 2. 方法健康度变化
| method | step | FP rate (本次) | FP rate (历史) | 趋势 |

## 3. 触发的 meta-validator 规则
- A1 dropped: <n>
- B2 reject: <n>
- C-Debate-1 fake_debate: <n>
- ...

## 4. 建议的 unlearn
- (debate, task_decomposition): fake_debate_rate=0.52 — 建议熔断 24h

## 5. 高价值 corrections（建议 L3 晋升）
- correction-id-1: 在 P5 反思中命中 <n> 次

## 6. 用户介入 vs 反思发现重合率
- 重合 <n>/<total> = <pct>%（理想 > 60%，本次 <pct>%）
```

报告附在 pipeline manifest 末尾，自动写盘；用户可主动 `opc_reflect_admin({action:"explain", pipeline_id})` 重读。

---

## 五、与 corrections 的协同

| 场景 | 协同方式 |
|---|---|
| meta-validator 丢弃的 objection | **不写入** corrections（避免负样本污染） |
| meta-validator kept 的 objection 且后续 `evidence_diff=true` | distiller 优先合并为 L2 correction（high-quality 样本） |
| `unlearn_method` active 期间 | distiller 不再为该 (method, step) 写入新 correction（避免熔断方法的产出污染库） |
| pipeline manifest 中"建议 L3 晋升"列表 | 由 distiller 根据"corrections_hit_rate × kept_rate"打分 |

---

## 六、核心设计原则

- **分类即责任**：A 类硬拒 / B 类弱拒 / C 类警告 / D 类记录，行为对齐严重程度
- **零 LLM**：所有 meta 规则是 TS 纯函数 + 关键词启发式，可单测
- **熔断不自动执行**：默认建议 + 人工/Claude 确认；硬熔断仅限明确异常（超时连发 / 工具越权）
- **阈值待 PoC**：常量显式 TODO，第一版用保守默认
- **可恢复**：所有 unlearn 有 TTL，过期自动恢复；用户可手动提前恢复
- **不污染下游**：被 reject 的 objection 不进 reflection_log 不进 corrections

---

## 七、相关文档

- [02-server-design 四](../02-server-design/00_overview.md#四meta-validator反思器自身的输出校验) — meta-validator 原始规则表
- [02-server-design 七](../02-server-design/00_overview.md#七可观测性) — 可观测性 schema
- [00_overview 四](00_overview.md#四meta-reflectionpipeline-级总结) — pipeline 级总结
- [03-corrections-store/00_overview.md](../03-corrections-store/00_overview.md) — L1/L2/L3 三层存储
- [01_per-step-sequence.md](01_per-step-sequence.md) — P3/P4/P7/P8 工作示例
