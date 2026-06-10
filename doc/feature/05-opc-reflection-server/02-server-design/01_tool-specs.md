# 01 — 工具参数与返回 Schema 完整规范

> 本章提供 reflection-server 5 个 MCP 工具的完整参数 schema、
> 返回类型、discriminator 路由、错误码、以及与 state-server 的协作契约。

## 一、通用返回结构（ReflectionResponse）

所有 reflection-server 工具共享此返回结构：

```typescript
type ReflectionResponse = {
  // —— 数据部分 ——
  verdict?: 'clean' | 'objections_remain' | 'rounds_exceeded'
  kept_objections?: Objection[]
  reasoning_trace?: string[]

  // —— 提示部分 ——
  next_step_hint?: {
    suggestion: string
    suggested_tool: string
    suggested_args: object
    why: string
  }

  // —— 登记契约（仅 complete 类工具）——
  pending_reflection?: {
    reflection_id: string
    artifact_path: string
    expires_at: string
    must_be_registered_by: 'opc_flow_reflect'
  }

  // —— 管理类工具专属 ——
  corrections_manifest?: CorrectionsManifest
  method_stats?: MethodStats
  explanation?: ReflectionExplanation
  intensity_suggestion?: IntensitySuggestion
}
```

## 二、`opc_reflect_plan` — 规划反思

### 2.1 参数

```typescript
{
  name: "opc_reflect_plan",
  description: "输入 step + context，返回 method 选择 + 历史纠正 + agent_spec + max_rounds。",
  input_schema: {
    type: "object",
    required: ["step"],
    properties: {
      step: {
        enum: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]
      },
      context: {
        type: "object",
        properties: {
          pipeline_id: { type: "string" },
          phase: { type: "string" },
          complexity: { enum: ["simple", "medium", "high"] },
          node_type: { type: "string" },
          artifact_path: { type: "string" }
        }
      },
      intensity: {
        enum: ["high", "medium", "low", "off"],
        default: "medium"
      },
      session_id: { type: "string" }
    }
  }
}
```

### 2.2 内部流程

```
① opc_corrections({action:"query", step, keywords}) → 查历史纠正
② opc_reflect_admin({action:"query_stats"}) → 查 method 健康度
③ 按决策矩阵选 primary method
④ 按禁用矩阵检查 method 是否被 unlearn
⑤ 按 token 预算计算 max_rounds
⑥ 拼 enhanced_prompt = base_prompt + top-K corrections 片段
```

### 2.3 返回

```typescript
{
  // —— method 选择 ——
  method: "cove" | "critique" | "debate" | "tot",
  secondary_method: "reflexion" | "cove" | "critique" | "debate" | null,
  method_choice_reason: "step=P5, complexity=medium → primary=critique",

  // —— agent spec ——
  agent_spec: {
    subagent_type: "critic" | "cove-verifier" | "debater" | "tot-explorer",
    allowed_tools: ["Read", "Grep", "opc_knowledge_read", "opc_corrections"],
    input_contract: { /* method-specific input schema */ },
    output_contract: { /* method-specific output schema */ }
  },

  // —— 纠正注入 ——
  prior_corrections: [
    {
      id: "corr-xxx",
      step: "P5",
      keywords: ["file-domain-conflict"],
      reflection_snippet: "> 当 step=P5 且...",
      hotness: 8
    }
  ],

  // —— 预算 ——
  max_rounds: 3,
  token_budget_remaining: 6400,
  budget_exhausted: false,

  // —— 提示 ——
  next_step_hint: {
    suggestion: "调 opc_reflect_execute({method:\"critique\", artifact, enhanced_prompt})",
    suggested_tool: "opc_reflect_execute",
    suggested_args: { method: "critique", step: "P5", artifact: "..." },
    why: "P5 决策点需要独立 critic 审查节点组合"
  },

  // —— 建议 ——
  intensity_suggestion: {
    recommended: "medium",
    reason: "当前 FP 率正常（0.12），建议保持 medium",
    current: "medium",
    auto_applied: false
  }
}
```

### 2.4 边界情况

| 场景 | 返回 |
|---|---|
| complexity=simple + step=P3 | 仍返回 M6 ToT（P3 是核心决策点），但 budget 减半 |
| 所有 method 被 unlearn | `method: null, secondary_method: null` + next_step_hint 建议 `validator-only` |
| corrections 库空（新项目） | `prior_corrections: []`，注入 seed corrections |
| intensity=off | `method: null, secondary_method: null` + 直接返回 done |

## 三、`opc_reflect_execute` — 执行反思

### 3.1 参数

```typescript
{
  name: "opc_reflect_execute",
  description: "执行反思方法。inline=true 一次性完成 plan+execute+complete，返回 pending_reflection。",
  input_schema: {
    type: "object",
    required: ["step", "method", "artifact"],
    properties: {
      step: { enum: ["P1","P2","P3","P4","P5","P6","P7","P8"] },
      method: { enum: ["cove", "critique", "debate", "tot"] },
      artifact: { type: "object" },
      inline: { type: "boolean", default: true },
      enhanced_prompt: { type: "string" },
      prior_corrections: { type: "array" }
    }
  }
}
```

### 3.2 各 method 的 input_contract

**cove**：
```typescript
{
  method: "cove",
  artifact: {
    payload: object,        // 原始输出内容
    step: "P1" | "P2" | "P4" | "P7"
  },
  enhanced_prompt: string
}
```

**critique**：
```typescript
{
  method: "critique",
  artifact: {
    payload: object,
    node_type: string,
    phase: string,
    complexity: "simple" | "medium" | "high"
  },
  enhanced_prompt: string
}
```

**debate**：
```typescript
{
  method: "debate",
  topic: string,
  artifact: object,
  positions: ("pro" | "con" | "third_party")[],
  max_rounds: number,
  enhanced_prompt: string
}
```

**tot**：
```typescript
{
  method: "tot",
  problem_statement: string,
  artifact: object,
  max_depth: number,
  enhanced_prompt: string
}
```

### 3.3 inline vs 非 inline

| 模式 | 行为 | 返回 |
|---|---|---|
| `inline: true`（默认） | 内部完成 plan→execute→Task→complete→写盘 artifact | `pending_reflection` |
| `inline: false` | 仅返回 agent_spec，由 Host 自行派 Task | `agent_spec` + `next_step_hint` |

### 3.4 返回（inline=true）

```typescript
{
  verdict: "clean" | "objections_remain" | "rounds_exceeded",
  kept_objections: [
    {
      id: "OBJ1",
      dimension: "completeness",
      objection: "未考虑并发写入冲突",
      severity: "warning",
      reasoning: "该节点写入 knowledge 时未加 advisory lock",
      suggestion: "在 write 前获取 session 级文件锁"
    }
  ],
  reasoning_trace: ["拆解 5 个断言", "验证问题 1: ...", "验证一致"],
  next_step_hint: {
    suggestion: "调 opc_flow_reflect 登记",
    suggested_tool: "opc_flow_reflect",
    suggested_args: { reflection_id: "rfl-P5-r1-01HXY8" },
    why: "未登记反思无法通过 registry-guard"
  },
  pending_reflection: {
    reflection_id: "rfl-P5-r1-01HXY8",
    artifact_path: "opc-logs/reflection/sess-abc/rfl-P5-r1-01HXY8.json",
    expires_at: "2026-06-11T10:30:00Z",
    must_be_registered_by: "opc_flow_reflect"
  }
}
```

### 3.5 错误码

| 错误 | 说明 |
|---|---|
| `METHOD_UNLEARNED` | 请求的 method 已被临时禁用 |
| `BUDGET_EXHAUSTED` | token 预算已耗尽 |
| `INVALID_METHOD_FOR_STEP` | method 不适用于该 step（如对 P6 请求 M6 ToT） |
| `INLINE_NOT_SUPPORTED` | 该方法不支持 inline（如 debate 多 agent） |

## 四、`opc_reflect_complete` — 完成反思

### 4.1 参数

```typescript
{
  name: "opc_reflect_complete",
  description: "收 sub-agent 结果，跑 meta-validator，写盘 artifact，发 pending_reflection。",
  input_schema: {
    type: "object",
    required: ["method", "reflection_id", "result"],
    properties: {
      method: { enum: ["cove", "critique", "debate", "tot"] },
      reflection_id: { type: "string" },
      result: { type: "object" },
      session_id: { type: "string" }
    }
  }
}
```

### 4.2 内部流程

```
① 按 method 解析 result (claims / objections / debate_synthesis / search_tree)
② 跑 meta-validator:
    ├── objection 引用的文件/字段是否存在
    ├── reasoning_trace 长度 ≥ 最小阈值
    ├── objection 与 artifact 关键词重合度
    ├── (debate) 双方立场重合度
    └── (ToT) 分支评分分布
③ meta-validator 结果:
    ├── pass → write artifact + return pending_reflection
    ├── fail → return verdict + kept_objections (无 pending)
    └── reject → 整次反思作废，标记 FP
④ 更新 method 健康度统计
⑤ 若 verdict=clean 且 prior_corrections 被采纳 → hotness+1
```

### 4.3 返回

```typescript
{
  verdict: "clean" | "objections_remain" | "rounds_exceeded",
  kept_objections: Objection[],
  meta_validator_results: {
    referential_check: "pass",
    evidence_presence: "pass",
    reasoning_trace_length: "pass",
    keyword_overlap: "pass",
    warnings: []
  },
  next_step_hint: { /* ... */ },
  pending_reflection: {
    reflection_id: "rfl-P5-r1-01HXY8",
    artifact_path: "opc-logs/reflection/sess-abc/rfl-P5-r1-01HXY8.json",
    expires_at: "2026-06-11T10:30:00Z",
    must_be_registered_by: "opc_flow_reflect"
  }
}
```

### 4.4 Meta-Validator 拒绝响应

```typescript
{
  verdict: null,  // 反思被拒绝，无有效结论
  meta_validator_results: {
    referential_check: "fail",
    rejected_objections: [
      { id: "OBJ2", reason: "引用的文件 /path/to/nonexistent 不存在" }
    ]
  },
  next_step_hint: {
    suggestion: "本次反思作废，降级到 secondary method 或 ask_user",
    suggested_tool: "opc_reflect_execute",
    suggested_args: { method: "critique", /* secondary */ },
    why: "primary method 的输出被 meta-validator 拒绝"
  }
}
```

## 五、`opc_reflect_admin` — 反思管理

### 5.1 参数

```typescript
{
  name: "opc_reflect_admin",
  description: "反思管理。action=record_interventions 派 distiller；on_demand 事后反思；explain 查看 trace；query_stats 查健康度；unlearn_method 禁用方法。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        enum: ["record_interventions", "on_demand", "explain", "query_stats", "unlearn_method"]
      }
    }
  }
}
```

### 5.2 各 action 的参数与返回

**record_interventions**：

```typescript
// input
{ action: "record_interventions", pipeline_id: string }

// 内部流程
① 读 L1 flow-state.json → user_interventions[]
② 派 distiller sub-agent 提炼
③ 按 C1 合并策略写入 L2
④ 更新 .opc-memory.idx

// output
{
  corrections_manifest: {
    pipeline_id: "pl-xxx",
    interventions_total: 5,
    created: 2,
    merged: 1,
    skipped: 2,
    new_corrections: [{ id: "corr-xxx", title: "..." }],
    merged_corrections: [{ id: "corr-yyy", hotness_after: 8 }]
  }
}
```

**on_demand**：

```typescript
// input
{
  action: "on_demand",
  target: {
    pipeline_id: string,
    step: "P1" | ... | "P8",
    round: number  // optional
  },
  method: "cove" | ...  // optional
}

// output: 同 opc_reflect_execute(inline=true) 的返回
```

**explain**：

```typescript
// input
{ action: "explain", reflection_id: string, include_superseded?: boolean }

// output
{
  explanation: {
    reflection_id: "rfl-P5-r2-01HXY8",
    step: "P5",
    method: "critique",
    method_choice_reason: "step=P5, complexity=medium → critique",
    prior_corrections_used: ["corr-xxx"],
    evidence_input: { /* artifact payload */ },
    objections_raised: [/* ... */],
    objections_kept: [/* ... */],
    fallback_chain: ["M4 → ok"],
    final_decision: "evidence_diff required",
    reasoning_trace: ["拆解 5 断言", "验证一致"],
    verdict: "objections_remain",
    round: 2,
    superseded: false
  }
}
```

**query_stats**：

```typescript
// input
{ action: "query_stats", method?: string, window?: string }

// output
{
  method_stats: {
    "cove": {
      total_calls: 120,
      fp_rate: 0.12,
      objection_to_diff_rate: 0.35,
      avg_latency_ms: 3200,
      unlearned: false
    },
    "critique": {
      total_calls: 85,
      fp_rate: 0.18,
      objection_to_diff_rate: 0.42,
      avg_latency_ms: 4100,
      unlearned: false
    }
    // ...
  },
  failure_stats: {
    A_classification: { count: 3, last_24h: 1, trend: "stable" },
    B_completeness: { count: 12, last_24h: 4, trend: "rising" },
    C_execution: { count: 8, last_24h: 2, trend: "falling" },
    D_meta_decision: { count: 2, last_24h: 0, trend: "stable" }
  },
  expansion_stats: {
    total_entries: 47, frozen_entries: 12, avg_hotness: 4.3,
    merge_rate_7d: 0.35, budget_exhausted_rate: 0.12
  },
  autonomy_stats: {
    current_intensity: "medium",
    skip_count_24h: 1, on_demand_count_24h: 0
  },
  expiry_metrics: {
    expired_pending_count_24h: 0,
    expired_resumed_count_24h: 0,
    expired_discarded_count_24h: 0,
    artifact_purged_7d_count: 0
  }
}
```

**unlearn_method**：

```typescript
// input
{
  action: "unlearn_method",
  method: "cove" | "critique" | "debate" | "tot",
  undo: false,
  ttl_hours: 24
}

// output
{
  unlearned: {
    method: "debate",
    until: "2026-06-12T10:00:00Z",
    reason: "FP rate 0.45 exceeds threshold 0.3"
  }
}
```

## 六、`opc_corrections` — 纠正库管理

### 6.1 参数

```typescript
{
  name: "opc_corrections",
  description: "管理纠正库。action=query 查；record 写；unlearn 删除过期；reindex 重建索引；promote 晋升 L2→L3；migrate 升级 schema；endorse 认可；freeze 冷冻；delete 删除。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        enum: ["query", "record", "unlearn", "reindex", "promote", "migrate", "endorse", "freeze", "delete"]
      }
    }
  }
}
```

### 6.2 各 action 的返回

**query**：返回 `{ corrections: Correction[], total: number }`

**record**：返回 `{ correction: Correction, action: "created" | "merged" }`

**unlearn**：返回 `{ removed: string, reason: string }`

**reindex**：返回 `{ indexed: number, duration_ms: number }`

**promote**：返回 `{ global_id: string, desensitized_text: string, promoted_at: string }`

**migrate**：返回 `{ migrated: number, skipped: number, errors: string[] }`

**endorse**：返回 `{ id: string, hotness: number, source: "user" }`

**freeze**：返回 `{ id: string, frozen: true }`

**delete**：返回 `{ id: string, deleted: true }`

## 七、通用错误码

| 错误码 | 说明 |
|---|---|
| `INVALID_DISCRIMINATOR` | discriminator 值不在允许的枚举中 |
| `MISSING_REQUIRED_FIELD` | 必填字段缺失 |
| `SESSION_NOT_FOUND` | session_id 不存在 |
| `PIPELINE_NOT_FOUND` | pipeline_id 不存在 |
| `REFLECTION_NOT_FOUND` | reflection_id 不存在 |
| `PREVIOUS_PENDING_UNREGISTERED` | 尝试创建新 pending 但已有未登记的 pending |
| `HARD_INVARIANT_VIOLATION` | 不变量被违反 |
| `INTERNAL_ERROR` | server 内部错误 |

## 八、工具发 pending_reflection 的对照表

| 工具 | 是否发 pending |
|---|---|
| `opc_reflect_plan` | 否（仅返回方法选择） |
| `opc_reflect_execute({inline:true})` | 是 |
| `opc_reflect_execute({inline:false})` | 否（仅返回 agent_spec） |
| `opc_reflect_complete` | 是 |
| `opc_reflect_admin({action:"record_interventions"})` | 否 |
| `opc_reflect_admin({action:"on_demand"})` | 否（调 execute 内部产生） |
| `opc_reflect_admin({action:"explain"})` | 否（只读） |
| `opc_reflect_admin({action:"query_stats"})` | 否（只读） |
| `opc_reflect_admin({action:"unlearn_method"})` | 否（CRUD） |
| `opc_corrections({action:"*"})` | 否（CRUD） |

## 九、相关文档

- [00 Server 设计总览](./00_overview.md) — 工具总览 + 通用返回结构
- [02 Evidence Schema](./02_evidence-schema.md) — P1-P8 evidence artifact 完整定义
- [03 Validators](./03_validators.md) — V1-V5 TS 校验器规范
- [04 Sub-Agent 权限](./04_subagent-permissions.md) — 白名单规范
- [父文档](../00_index.md) — reflection-server 总索引
