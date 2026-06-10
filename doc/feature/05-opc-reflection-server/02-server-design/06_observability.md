# 06 — 可观测性设计（日志 + 聚合 + 仪表盘 + 告警）

> 本章定义 reflection-server 的完整可观测性：telemetry 日志 schema、
> 聚合指标 query_stats 实现、最小仪表盘规范、告警阈值、
> 以及与健康度自动 unlearn 的联动。

## 一、设计原则

1. **零额外依赖**：telemetry 落 JSONL 文件，聚合走 TS 纯函数，不依赖外部监控系统
2. **按 session 隔离**：每个 session 一个 `telemetry.jsonl`，便于回放和清理
3. **原子写**：所有 telemetry 写入通过 `withFileLock` 保证不丢不坏
4. **可回放**：JSONL 格式支持 `tail -f` 实时查看、`jq` 聚合查询
5. **隐私边界**：不记录用户输入原文、不记录 artifact 完整内容，只记录统计量

## 二、Telemetry 日志

### 2.1 文件布局

```
opc-logs/reflection/<session_id>/
├── rfl-P5-r1-01HXY8.json       # 反思 artifact
├── rfl-P5-r2-01HXY9.json
└── telemetry.jsonl              # 聚合 telemetry（本 session 所有反思事件）
```

### 2.2 事件 Schema

```typescript
type TelemetryEvent = {
  // —— 标识 ——
  ts: string                     // ISO 8601，事件发生时间
  session_id: string             // 会话 ID
  event: TelemetryEventType      // 事件类型（见 §2.3）

  // —— 反思上下文 ——
  step: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8'
  method: 'reflexion' | 'cove' | 'critique' | 'debate' | 'tot'
  reflection_id: string          // "rfl-<step>-r<n>-<ulid>"
  round: number                  // 当前 step 的第几轮反思
  pipeline_id?: string           // P5+ 时必填
  phase?: string                 // 所属 phase

  // —— 结果 ——
  verdict: 'clean' | 'objections_remain' | 'rounds_exceeded' | 'rejected'
  objections_raised: number      // sub-agent 提出的 objection 总数
  objections_kept: number        // meta-validator 保留的 objection 数

  // —— 影响 ——
  evidence_diff: boolean         // 是否触发了 evidence 修改
  fallback_triggered: boolean    // 是否触发了降级（primary→secondary）
  fallback_reason?: string       // 降级原因

  // —— 校验 ——
  validator_pass: boolean        // V1-V5 + 三兜底全部通过
  meta_validator_pass: boolean   // meta-validator 通过
  meta_validator_warnings: number

  // —— 资源 ——
  latency_ms: number             // 端到端延迟（plan→execute→complete）
  tokens_in: number              // sub-agent 输入 token
  tokens_out: number             // sub-agent 输出 token
  agent_count: number            // 派出的 sub-agent 数量

  // —— 纠正 ——
  corrections_injected: number   // 注入的 prior_corrections 条数
  corrections_adopted: number    // 被采纳的 corrections 条数
  corrections_hotness_updated: number  // hotness 变化的条数

  // —— 错误（可选）——
  error_type?: 'timeout' | 'invalid_output' | 'meta_validator_reject'
      | 'corrections_error' | 'server_unreachable' | 'budget_exhausted'
      | 'method_unlearned'
  error_detail?: string
}
```

### 2.3 事件类型

```typescript
type TelemetryEventType =
  | 'reflection.started'       // opc_reflect_execute 被调用
  | 'reflection.completed'     // opc_reflect_complete 完成（含 meta-validator 结果）
  | 'reflection.rejected'      // meta-validator 拒绝整次反思
  | 'reflection.fallback'      // 触发了降级（primary→secondary 或 secondary→ask_user）
  | 'reflection.skipped'       // 用户 skip 或 intensity=off
  | 'correction.injected'      // prior_corrections 被注入到 enhanced_prompt
  | 'correction.adopted'       // correction 在反思中被采纳
  | 'correction.created'       // 新 correction 写入
  | 'correction.merged'        // correction 合并（hotness 更新）
  | 'method.unlearned'         // 方法被自动或手动 unlearn
  | 'method.recovered'         // 方法 TTL 到期恢复
  | 'budget.exhausted'         // token 预算耗尽
  | 'server.unreachable'       // reflection-server 不可达
```

### 2.4 写入实现

```typescript
// reflection-server 内部
async function appendTelemetry(
  session_id: string,
  event: TelemetryEvent
): Promise<void> {
  const dir = join(workspaceRoot, 'opc-logs', 'reflection', session_id)
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'telemetry.jsonl')

  await withFileLock(path, async () => {
    const line = JSON.stringify(event) + '\n'
    await appendFile(path, line)
  })
}
```

### 2.5 示例

```jsonl
{"ts":"2026-06-11T10:00:00Z","session_id":"sess-abc","event":"reflection.started","step":"P5","method":"critique","reflection_id":"rfl-P5-r1-01HXY8","round":1,"pipeline_id":"pl-xxx","phase":"impl"}
{"ts":"2026-06-11T10:00:04Z","session_id":"sess-abc","event":"reflection.completed","step":"P5","method":"critique","reflection_id":"rfl-P5-r1-01HXY8","round":1,"pipeline_id":"pl-xxx","phase":"impl","verdict":"objections_remain","objections_raised":3,"objections_kept":2,"evidence_diff":true,"fallback_triggered":false,"validator_pass":true,"meta_validator_pass":true,"meta_validator_warnings":0,"latency_ms":4200,"tokens_in":1200,"tokens_out":350,"agent_count":1,"corrections_injected":2,"corrections_adopted":1,"corrections_hotness_updated":1}
{"ts":"2026-06-11T10:00:30Z","session_id":"sess-abc","event":"reflection.rejected","step":"P5","method":"debate","reflection_id":"rfl-P5-r2-01HXY9","round":2,"pipeline_id":"pl-xxx","phase":"impl","verdict":"rejected","objections_raised":5,"objections_kept":0,"evidence_diff":false,"fallback_triggered":true,"fallback_reason":"meta_validator_reject_debate_synthesis_overlap","validator_pass":true,"meta_validator_pass":false,"meta_validator_warnings":1,"latency_ms":8100,"tokens_in":2400,"tokens_out":800,"agent_count":2,"corrections_injected":2,"corrections_adopted":0,"corrections_hotness_updated":0,"error_type":"meta_validator_reject","error_detail":"双方立场重合度 0.92 > 阈值 0.85，视为假辩论"}
```

## 三、聚合指标（query_stats）

### 3.1 实现架构

```
opc_reflect_admin({action:"query_stats", method?, window?})
    │
    ├── 扫描 opc-logs/reflection/*/telemetry.jsonl
    │   按 window 过滤 ts 范围
    │
    ├── 内存聚合（TS 纯函数，O(events)）
    │
    └── 返回 ReflectionStats
```

### 3.2 方法健康度（method_stats）

```typescript
type MethodStats = Record<string, {
  total_calls: number            // 窗口内总调用次数
  fp_rate: number                // meta_validator_reject / total_calls
  timeout_rate: number           // timeouts / total_calls
  objection_to_diff_rate: number // evidence_diff=true 次数 / total_calls
  avg_latency_ms: number
  avg_tokens_in: number
  avg_tokens_out: number
  unlearned: boolean
  unlearn_until: string | null   // ISO 8601
}>
```

聚合 SQL 等效逻辑：

```
method_stats =
  SELECT
    method,
    COUNT(*) as total_calls,
    SUM(CASE WHEN error_type='meta_validator_reject' THEN 1 ELSE 0 END) / COUNT(*) as fp_rate,
    SUM(CASE WHEN error_type='timeout' THEN 1 ELSE 0 END) / COUNT(*) as timeout_rate,
    SUM(CASE WHEN evidence_diff=true THEN 1 ELSE 0 END) / COUNT(*) as objection_to_diff_rate,
    AVG(latency_ms) as avg_latency_ms,
    AVG(tokens_in) as avg_tokens_in,
    AVG(tokens_out) as avg_tokens_out
  FROM telemetry_events
  WHERE event = 'reflection.completed' OR event = 'reflection.rejected'
    AND ts >= now() - window
  GROUP BY method
```

### 3.3 失败分类统计（failure_stats）

```typescript
type FailureStats = {
  A_classification: CategoryStats   // 分类错误
  B_completeness: CategoryStats     // 完整性遗漏
  C_execution: CategoryStats        // 执行缺陷
  D_meta_decision: CategoryStats    // 元决策失误
}

type CategoryStats = {
  count: number
  last_24h: number
  trend: 'rising' | 'falling' | 'stable'
}
```

失败分类依据：

| 类别 | 触发条件 |
|---|---|
| A 分类 | V5 discrimination fail + step=P1 |
| B 完整性 | V4 coverage fail + objection 类型为 completeness |
| C 执行 | P6/P7 L1 工件不存在 + 测试失败 |
| D 元决策 | rounds_exceeded + fallback_triggered + method.unlearned |

趋势判定：`last_24h / (count / days_in_window)` — >1.3 为 rising，<0.7 为 falling。

### 3.4 膨胀控制统计（expansion_stats）

```typescript
type ExpansionStats = {
  total_entries: number           // corrections 总条目数
  frozen_entries: number          // 冻结条目数
  avg_hotness: number             // 平均热度
  merge_rate_7d: number           // 7 天内合并比例（merged / (created + merged)）
  budget_exhausted_rate: number   // budget_exhausted 事件数 / total_calls
  per_step_capacity: Record<string, { used: number, limit: number }>
}
```

### 3.5 用户自治统计（autonomy_stats）

```typescript
type AutonomyStats = {
  current_intensity: 'high' | 'medium' | 'low' | 'off'
  intensity_history: Array<{
    from: string
    to: string
    changed_at: string
    reason: string
  }>
  skip_count_24h: number
  on_demand_count_24h: number
  skip_rate: number               // skip_count / total_reflection_opportunities
}
```

### 3.6 过期告警指标（expiry_metrics）

```typescript
type ExpiryMetrics = {
  expired_pending_count_24h: number       // 24h 内过期的 pending_reflection 数
  expired_resumed_count_24h: number       // 过期后用户选 resume 的数量
  expired_discarded_count_24h: number     // 过期后用户选 discard 的数量
  expired_skipped_count_24h: number       // 过期后用户选 skip 的数量
  artifact_purged_7d_count: number        // 7 天前过期且已被清理的 artifact 数
  avg_expire_to_decision_minutes: number  // 过期 → 用户决策平均时长
}
```

### 3.7 Token 预算统计（budget_stats）

```typescript
type BudgetStats = {
  total_tokens_consumed: number
  budget_limit: number
  utilization_rate: number        // consumed / limit
  avg_tokens_per_reflection: number
  budget_exhausted_count_24h: number
}
```

## 四、最小仪表盘

### 4.1 必看指标（MVP）

| 指标 | 面板类型 | 数据来源 |
|---|---|---|
| FP 率趋势（按 method） | 折线图 | `method_stats[].fp_rate` |
| objection→diff 转化率 | 柱状图（method 对比）| `method_stats[].objection_to_diff_rate` |
| 反思延迟分布 | 箱线图 / p50-p95-p99 | `telemetry.jsonl.latency_ms` |
| Token 消耗趋势 | 面积图（按 method 堆叠）| `telemetry.jsonl.tokens_in + tokens_out` |
| 降级触发次数 | 计数器 + 趋势 | `telemetry.jsonl.fallback_triggered` |
| 失败类别占比 | 堆叠柱状图（A/B/C/D）| `failure_stats` |
| 过期 pending 趋势 | 折线图 | `expiry_metrics.*_count_24h` |

### 4.2 推荐但不紧急

| 指标 | 说明 |
|---|---|
| corrections 命中率 | `corrections_adopted / corrections_injected` |
| 方法 unlearn 历史 | 时间线视图 |
| 用户自治行为 | skip vs on_demand 比例 |
| per-session 反思开销 | 单次 session 的 tokens / 延迟汇总 |

### 4.3 数据保留

| 数据类型 | 保留期限 | 清理策略 |
|---|---|---|
| `telemetry.jsonl`（per session）| session 结束后 30 天 | cron 清理过期 session 目录 |
| `query_stats` 快照 | 每次查询即时计算 | 不持久化（无状态） |
| 聚合 dashboard 用 JSON | 可选：每日快照到 `opc-logs/reflection/daily-<date>.json` | 保留 90 天 |

## 五、告警阈值

### 5.1 自动 unlearn 联动

以下阈值与 [05_reliability.md §5.3](./05_reliability.md#53-自动-unlearn-阈值) 同步：

| 指标 | 阈值 | 动作 | 告警级别 |
|---|---|---|---|
| `fp_rate` | > 0.3 | auto unlearn 24h | **critical** |
| `timeout_rate` | > 0.15 | auto unlearn 24h | **critical** |
| `objection_to_diff_rate` | < 0.1 且 total_calls > 50 | 建议降级 | **warning** |

### 5.2 独立告警阈值

| 指标 | 阈值 | 级别 | 说明 |
|---|---|---|---|
| `budget_exhausted_rate` | > 0.2 | warning | 频繁耗尽预算，考虑增加 budget 或降低 intensity |
| `fallback_triggered` 占比 | > 0.3 | warning | 降级触发过多，检查 method 健康度 |
| `expired_pending_count_24h` | > 5 | warning | 用户可能未及时处理 pending_reflection |
| `avg_latency_ms`（debate）| > 15000 | warning | Debate 延迟过高，考虑减少 max_rounds |
| `agent_count` 单次反思 | > 4 | warning | 单次反思派 agent 过多 |
| `corrections_merge_rate_7d` | < 0.1 且 total_entries > 20 | info | 纠正条目几乎全是新建无合并，可能存在碎片化 |
| `skip_rate`（用户自治）| > 0.5 | info | 用户频繁跳过反思，考虑建议降低 intensity |

### 5.3 告警输出

告警以 `_warnings` 数组形式附加在 `opc_reflect_admin({action:"query_stats"})` 返回中：

```typescript
{
  method_stats: { /* ... */ },
  // ...其他统计
  _warnings: [
    {
      level: 'warning',
      code: 'FP_RATE_HIGH',
      method: 'debate',
      value: 0.38,
      threshold: 0.3,
      message: 'debate FP rate 0.38 exceeds threshold 0.3; unlearned until 2026-06-12T10:00:00Z'
    }
  ]
}
```

## 六、与健康度的联动

```
telemetry.jsonl
    │
    ├──[query_stats 聚合]──→ method_stats
    │                           │
    │                           ├── fp_rate > THRESH_FP (0.3)  → auto unlearn
    │                           ├── timeout_rate > 0.15        → auto unlearn
    │                           └── objection_to_diff_rate < 0.1 → 建议降级
    │
    └──[failure_stats 聚合]──→ 趋势监控
                                │
                                ├── A 分类错误 rising → 检查 P1 classification
                                ├── B 完整性遗漏 rising → 检查 P2/P3 evidence
                                ├── C 执行缺陷 rising → 检查 P6/P7 quality_gates
                                └── D 元决策失误 rising → 检查 method 选择逻辑
```

`opc_reflect_plan` 每次被调用时：
1. 读取 `query_stats` 检查是否有 method 被 unlearn
2. 若 primary method 被 unlearn → 跳过，检查 secondary
3. 若所有 method 被 unlearn → 返回 `method:null` + 建议 validator-only
4. 健康度恢复后（TTL 到期），method 自动回到候选池

## 七、实现清单

| 组件 | 位置 | 说明 |
|---|---|---|
| `appendTelemetry()` | `reflection-server/src/telemetry.ts` | JSONL 原子追加 |
| `queryStats()` | `reflection-server/src/stats.ts` | 扫描 + 内存聚合 |
| `checkAlertThresholds()` | `reflection-server/src/stats.ts` | 阈值检查 + `_warnings` 生成 |
| `dailySnapshot()` | `reflection-server/src/telemetry.ts` | 可选定时快照 |
| `purgeOldTelemetry()` | `reflection-server/src/telemetry.ts` | 过期数据清理 |

## 八、相关文档

- [00 Server 设计总览](./00_overview.md) — 可观测性总述
- [01 工具规范](./01_tool-specs.md) — `query_stats` 返回 schema
- [05 可靠性](./05_reliability.md) — 健康度统计与自动 unlearn 联动
- [07 可解释性](./07_explainability.md) — reasoning_trace 日志
- [04-reflection-flow/06_call-sequence-contract.md](../04-reflection-flow/06_call-sequence-contract.md) — expiry_metrics 告警维度
- [父文档](../00_index.md) — reflection-server 总索引
