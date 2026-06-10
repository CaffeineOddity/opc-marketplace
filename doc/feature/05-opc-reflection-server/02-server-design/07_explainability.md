# 07 — 可解释性设计（reasoning_trace + explain + 可审计）

> 本章定义 reflection-server 的可解释性：reasoning_trace 规范、
> `opc_reflect_admin({action:"explain"})` 完整返回 schema、
> meta-validator 对 reasoning_trace 的校验规则、
> 以及 trace 如何注入 corrections 形成闭环。

## 一、设计原则

1. **可审计不可盲信**：每次反思的完整推理链可被人类回溯
2. **trace 即证据**：reasoning_trace 中每个断言必须引用具体文件/字段，不可空洞
3. **增量不覆盖**：同一 reflection_id 的多轮 trace 叠加，不覆盖历史
4. **可复现**：给定相同的 evidence + corrections + knowledge，trace 应可被独立审查者理解

## 二、Reasoning Trace 规范

### 2.1 结构

```typescript
type ReasoningTrace = {
  // —— 元信息 ——
  reflection_id: string
  step: string
  method: string
  round: number

  // —— 推理步骤 ——
  steps: ReasoningStep[]

  // —— 证据引用 ——
  evidence_refs: EvidenceRef[]    // trace 中引用的 evidence 字段

  // —— 纠正引用 ——
  correction_refs: string[]       // trace 中引用的 correction_id 列表

  // —— 知识引用 ——
  knowledge_refs: KnowledgeRef[]  // trace 中读取的 knowledge 路径
}
```

### 2.2 ReasoningStep 规范

```typescript
type ReasoningStep = {
  seq: number                     // 步骤序号，从 1 开始
  type: ReasoningStepType
  claim: string                   // 断言内容
  basis: string                   // 断言依据（文件路径 / 字段名 / correction_id / 逻辑推理）
  evidence_quote?: string         // 从 evidence 中引用的原文（如有）
  conclusion?: string             // 此步的结论
  sub_steps?: ReasoningStep[]     // 子步骤（CoVe 拆断言、ToT 分支）
}
```

### 2.3 步骤类型

```typescript
type ReasoningStepType =
  | 'decomposition'      // 拆解断言（CoVe 特有）
  | 'verification'       // 逐条验证（CoVe / Reflexion）
  | 'objection'          // 提出质疑（Critique / Debate）
  | 'counter_argument'   // 反方论点（Debate 特有）
  | 'rebuttal'           // 反驳（Debate 特有）
  | 'branch_generation'  // 生成分支（ToT 特有）
  | 'branch_evaluation'  // 评估分支（ToT 特有）
  | 'pruning'            // 剪枝（ToT 特有）
  | 'synthesis'          // 综合结论
  | 'correction_lookup'  // 查阅纠正库
  | 'knowledge_lookup'   // 查阅知识库
```

### 2.4 每 method 的 trace 特征

| Method | 典型 steps | 最小步数 |
|---|---|---|
| M2 Reflexion | `correction_lookup` → `verification`(×N) → `synthesis` | 3 |
| M3 CoVe | `decomposition` → `verification`(×N) → `synthesis` | N+2 (N≥1) |
| M4 Critique | `objection`(×N) → `verification`(×M) → `synthesis` | 2 |
| M5 Debate | `objection`(pro) → `counter_argument`(con) → `rebuttal` → `synthesis` | 4 |
| M6 ToT | `branch_generation`(×B) → `branch_evaluation`(×B) → `pruning` → `synthesis` | B×2+2 (B≥2) |

### 2.5 示例（M4 Critique, P5）

```json
{
  "reflection_id": "rfl-P5-r1-01HXY8",
  "step": "P5",
  "method": "critique",
  "round": 1,
  "steps": [
    {
      "seq": 1,
      "type": "objection",
      "claim": "scenario_hits 中 'build-saas' scenario 的 relevant_nodes 包含了 'setup-ci'，但 setup-ci 在 file_domain_conflicts 中与 'deploy-backend' 冲突",
      "basis": "selection_evidence.scenario_hits[2].relevant_nodes",
      "evidence_quote": "\"relevant_nodes\": [\"setup-ci\", \"config-env\"]",
      "conclusion": "建议将 setup-ci 从 build-saas 的 relevant_nodes 移除或标记冲突待解决"
    },
    {
      "seq": 2,
      "type": "verification",
      "claim": "blocked_by_graph 中 'deploy-backend' 依赖 'setup-ci' 且 'setup-ci' 依赖 'config-env'，但 'config-env' 未在 selected_nodes 中",
      "basis": "selection_evidence.blocked_by_graph['deploy-backend']",
      "evidence_quote": "\"deploy-backend\": [\"setup-ci\"], \"setup-ci\": [\"config-env\"]",
      "conclusion": "缺少 config-env 节点，选择不完整"
    },
    {
      "seq": 3,
      "type": "correction_lookup",
      "claim": "历史纠正 corr-42 记录了类似场景：'P5 selection 遗漏 config 类节点导致 P6 阶段阻塞'",
      "basis": "correction corr-42",
      "conclusion": "本次 objection 与历史模式匹配，建议采纳"
    },
    {
      "seq": 4,
      "type": "synthesis",
      "claim": "综合以上：节点选择存在 2 个问题：① scenario 节点冲突未解决；② 依赖链缺少 config-env 节点",
      "basis": "步骤 1 + 步骤 2 的结论合并",
      "conclusion": "建议补充 config-env 节点，解决 setup-ci 冲突后重新 opc_phase_confirm"
    }
  ],
  "evidence_refs": [
    { "field": "scenario_hits[2].relevant_nodes", "value_preview": "[\"setup-ci\", \"config-env\"]" },
    { "field": "blocked_by_graph", "value_preview": "{...}" }
  ],
  "correction_refs": ["corr-42"],
  "knowledge_refs": []
}
```

## 三、Meta-Validator 对 Reasoning Trace 的校验

### 3.1 校验规则

```typescript
function validateReasoningTrace(
  trace: ReasoningTrace,
  method: string,
  artifact: object
): MetaValidatorResult {
  const failures: string[] = []

  // ① 最小步数检查
  const minSteps = MIN_STEPS_BY_METHOD[method]
  if (trace.steps.length < minSteps) {
    failures.push(`reasoning_trace steps ${trace.steps.length} < min ${minSteps}`)
  }

  // ② 步骤完整性检查
  for (const step of trace.steps) {
    if (!step.claim || step.claim.length < 10) {
      failures.push(`step ${step.seq}: claim 过短 (< 10 chars)`)
    }
    if (!step.basis || step.basis.length === 0) {
      failures.push(`step ${step.seq}: basis 为空，断言无依据`)
    }
    if (step.type === 'verification' || step.type === 'objection') {
      if (!step.evidence_quote) {
        failures.push(`step ${step.seq} (${step.type}): 缺少 evidence_quote`)
      }
    }
  }

  // ③ 关键词重合度检查
  const artifactText = JSON.stringify(artifact).toLowerCase()
  const traceText = trace.steps.map(s => s.claim + s.basis).join(' ').toLowerCase()
  const overlap = keywordOverlap(artifactText, traceText)
  if (overlap < 0.1) {
    failures.push(`keyword overlap ${overlap.toFixed(2)} < 0.1, trace 可能跑题`)
  }

  // ④ evidence_refs 可达性检查
  for (const ref of trace.evidence_refs) {
    const val = getNested(artifact, ref.field)
    if (val === undefined) {
      failures.push(`evidence_ref ${ref.field} 在 artifact 中不存在`)
    }
  }

  // ⑤ Debate 专属：双方立场重合度
  if (method === 'debate') {
    const proClaims = trace.steps.filter(s => s.type === 'objection').map(s => s.claim)
    const conClaims = trace.steps.filter(s => s.type === 'counter_argument').map(s => s.claim)
    const overlap = claimOverlap(proClaims, conClaims)
    if (overlap > 0.85) {
      failures.push(`debate 双方立场重合度 ${overlap.toFixed(2)} > 0.85，疑似假辩论`)
    }
  }

  // ⑥ ToT 专属：分支评分分布
  if (method === 'tot') {
    const evalSteps = trace.steps.filter(s => s.type === 'branch_evaluation')
    if (evalSteps.length > 0 && evalSteps.every(s => parseFloat(s.conclusion ?? '1') > 0.9)) {
      failures.push('ToT 所有分支评分 > 0.9，怀疑乐观偏差')
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings: trace.steps.length > 20 ? ['trace 步数 > 20，可能过于冗长'] : []
  }
}
```

### 3.2 校验结果

```typescript
type MetaValidatorResult = {
  pass: boolean
  failures: string[]
  warnings: string[]
}
```

校验失败 → `opc_reflect_complete` 返回 `verdict: null`（反思被拒绝），整次反思作废，计入 FP 率。

## 四、Explain API

### 4.1 参数

```typescript
opc_reflect_admin({
  action: "explain",
  reflection_id: "rfl-P5-r2-01HXY8",
  include_superseded?: boolean  // 是否包含被后续轮次取代的旧 trace
})
```

### 4.2 返回

```typescript
{
  explanation: {
    // —— 标识 ——
    reflection_id: "rfl-P5-r2-01HXY8"
    step: "P5"
    method: "critique"
    round: 2

    // —— 决策 ——
    method_choice_reason: "step=P5, complexity=medium → primary=critique"
    fallback_chain: ["M4 → ok"]  // 或 ["M4 → timeout", "M5 → ok"]

    // —— 输入 ——
    evidence_input: { /* artifact.payload 精简版 */ }
    prior_corrections_used: [
      { id: "corr-42", title: "P5 遗漏 config 节点", hotness: 8 }
    ]
    knowledge_accessed: [
      { path: "opc-knowledge/deploy/ci-cd/001.md", version: 3 }
    ]

    // —— 输出 ——
    objections_raised: [
      { id: "obj-1", text: "...", severity: "warning", evidence_ref: "..." },
      { id: "obj-2", text: "...", severity: "error", evidence_ref: "..." }
    ]
    objections_kept: [
      { id: "obj-1", text: "...", severity: "warning" }
    ]
    objections_discarded: [
      { id: "obj-2", reason: "引用的文件不存在", discarded_by: "meta-validator" }
    ]

    // —— 推理 ——
    reasoning_trace: { /* 见 §二 */ }

    // —— 结果 ——
    verdict: "objections_remain"
    final_decision: "evidence_diff required — 补充 config-env 节点到 selected_nodes"

    // —— 状态 ——
    superseded: false  // 是否被后续轮次的反思取代
    superseded_by?: "rfl-P5-r3-01HXYA"
  }
}
```

### 4.3 精简规则

`evidence_input` 不返回完整的 artifact payload，而是：
- 保留所有顶层字段名（结构可见）
- 字符串值超过 200 字符的截断加 `…`
- 数组超过 10 项的截断加 `[+N more]`
- 嵌套对象深度超过 3 层不展开

## 五、Trace 注入 Corrections

### 5.1 注入流程

```
reflection 完成
    │
    ├── verdict=objections_remain → objections_kept 被记录
    │
    └── pipeline 结束时 distiller 读取所有 reasoning_trace:
        │
        ├── 提取 trace 中的 objection→conclusion 对
        ├── 脱敏（去掉具体文件路径 → 模式化）
        ├── 生成 correction 条目:
        │   reflection_snippet = trace 的摘要（≤ 500 chars）
        │   keywords = 从 trace.claim 中提取
        └── 写入 corrections 库
```

### 5.2 脱敏规则

| 原文 | 脱敏后 |
|---|---|
| `src/auth/jwt.ts` | `<auth-module>` |
| `selection_evidence.scenario_hits[2]` | `scenario_hits[*]` |
| `corr-42` | `prior_correction` |
| 具体用户原文 | `[user_input]` |

脱敏后的 trace 片段存入 `correction.reflection_snippet`，供后续跨 session 注入。

## 六、可审计性

### 6.1 审计信息

每次 `explain` 返回中附带审计元信息：

```typescript
{
  audit: {
    reflection_id: string
    created_at: string         // reflection artifact 创建时间
    created_by: 'reflection-server'
    sub_agent_id: string       // 执行的 sub-agent ID（可追溯）
    host_session_id: string    // 发起 reflection 的 Host session
    artifact_path: string      // 完整 artifact 文件路径
    artifact_hash: string      // SHA-256 of artifact file
    trace_hash: string         // SHA-256 of reasoning_trace JSON
    immutable: boolean         // artifact 不可变（一旦写入不再修改）
  }
}
```

### 6.2 防篡改

- Reflection artifact 落盘后不可修改（追加式 log）
- `artifact_hash` 和 `trace_hash` 提供完整性校验
- Superseded 旧 trace 保留不删除（`include_superseded: true` 可查看完整历史）

## 七、边界情况

### 7.1 空 trace

```
若 sub-agent 返回空 reasoning_trace:
    → meta-validator reject (trace length < min)
    → 计入 FP 率
    → explain 返回 { reasoning_trace: null, error: "trace_empty_rejected" }
```

### 7.2 超长 trace

```
若 reasoning_trace.steps.length > 50:
    → meta-validator 通过但 warning
    → explain 默认截断到前 30 步，加 truncated: true 标记
    → include_full_trace: true 参数可获取完整版
```

### 7.3 跨轮次 trace

```
同一 step 的多轮反思:
    round=1: rfl-P5-r1-xxx → superseded=true (被 r2 取代)
    round=2: rfl-P5-r2-xxx → superseded=false (当前有效)
    
    explain(reflection_id="rfl-P5-r1-xxx", include_superseded=true)
    → 返回 round=1 trace + superseded_by="rfl-P5-r2-xxx"
```

### 7.4 手动触发反思

```
opc_reflect_admin({action:"on_demand"}) 也产生 reasoning_trace:
    → trace 标记 source: "on_demand" (区别于 pipeline 自动触发 "auto")
    → explain 可查询
```

## 八、Trace 质量度量

通过 `query_stats` 可查 trace 质量：

| 指标 | 计算 | 含义 |
|---|---|---|
| `avg_trace_steps` | AVG(steps.length) | 平均推理步数 |
| `trace_reject_rate` | reject_count / total | trace 因不达标被 meta-validator 拒绝的比例 |
| `evidence_ref_coverage` | traces_with_evidence_refs / total | 有具体证据引用的 trace 比例 |
| `keyword_overlap_avg` | AVG(keyword_overlap) | trace 与 artifact 的平均关键词重合度 |

这些指标辅助判断 sub-agent 是否在认真审查还是敷衍了事。

## 九、实现清单

| 组件 | 位置 | 说明 |
|---|---|---|
| `validateReasoningTrace()` | `reflection-server/src/meta-validator.ts` | trace 校验 |
| `buildExplainResponse()` | `reflection-server/src/explain.ts` | explain action 响应构建 |
| `desensitizeTrace()` | `shared/memory-store/src/desensitize.ts` | trace 脱敏 |
| `auditHash()` | `shared/memory-store/src/hash.ts` | artifact / trace 哈希 |

## 十、相关文档

- [00 Server 设计总览](./00_overview.md) — 可解释性总述
- [01 工具规范](./01_tool-specs.md) — `explain` action 参数与返回 schema
- [03 Validators](./03_validators.md) — V1-V5 确定性校验
- [04 Sub-Agent 权限](./04_subagent-permissions.md) — sub-agent 如何提交 reasoning_trace
- [05 可靠性](./05_reliability.md) — meta-validator reject 的处理
- [06 可观测性](./06_observability.md) — trace 质量度量
- [父文档](../00_index.md) — reflection-server 总索引
