# 03 — Deterministic Validator 规范（V1–V5 + 三兜底）

> 本章定义 5 个 TS 纯函数 validator + 3 个工程兜底的完整规范：
> 输入/输出 contract、判据、错误消息、可测试性要求。
> **所有 validator 是纯 TS 函数，零 LLM 调用，可单测、可复现。**

## 一、通用 Contract

### 1.1 输入

```typescript
type ValidatorInput = {
  evidence: EvidenceArtifact
  flow_state: FlowState           // 当前 pipeline 的完整状态
  workspace_root: string          // 项目根目录绝对路径
  context?: {
    knowledge_version?: number
    corrections_freshness?: Record<string, string>  // correction_id → updated_at
    max_rounds?: number
    current_round?: number
  }
}
```

### 1.2 输出

```typescript
type ValidatorOutput = {
  validator: 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'coverage-guard' | 'rounds-guard' | 'freshness'
  verdict: 'pass' | 'fail'
  failures: Array<{
    field: string
    expected: string
    actual: string
    severity: 'error' | 'warning'
  }>
  ran_at: string  // ISO 8601
  duration_us: number
}
```

### 1.3 组合运行

```typescript
function runAllValidators(input: ValidatorInput): ValidatorOutput[] {
  return [
    runV1(input),
    runV2(input),
    runV3(input),
    runV4(input),
    runV5(input),
    runCoverageGuard(input),
    runRoundsGuard(input),
    runFreshnessGuard(input)
  ]
}
```

运行顺序：V1→V2→V3→V4→V5→三兜底。V1 失败时后续仍执行（收集所有错误），
但 P6/P7 的 L1 工件检查（V1 子集）失败时短路（节点未完成，无意义继续）。

## 二、V1 — Schema 完整性

### 2.1 判据

```
对每个 step 的 evidence artifact，检查：

① artifact 顶层字段:
    step 在允许的枚举中
    artifact_type 匹配 step
    collected_at 是合法 ISO 8601
    collected_by 非空字符串

② payload 字段:
    P1: task_criteria_hits 长度 = 5
    P2: requirements 长度 ≥ 1
    P3: sub_pipelines 长度 ≥ 1
    P4: brief_to_task_mapping 长度 ≥ 1
    P5: matched_tags 长度 ≥ 1
    P6: artifacts 长度 ≥ 1
    P7: quality_gate_results 长度 ≥ 1
    P8: auto_advance_4_conditions 包含全部 4 个字段

③ 字段类型:
    所有字段类型与 schema 声明一致（string / number / boolean / array / object）
    不允许多余字段（strict mode）
```

### 2.2 实现伪代码

```typescript
function runV1(input: ValidatorInput): ValidatorOutput {
  const failures: Failure[] = []
  const { evidence } = input
  const schema = STEP_SCHEMAS[evidence.step]

  // 顶层字段
  if (!ALLOWED_STEPS.includes(evidence.step)) {
    failures.push({ field: 'step', expected: 'P1..P8', actual: evidence.step, severity: 'error' })
  }
  if (evidence.artifact_type !== schema.artifact_type) {
    failures.push({ field: 'artifact_type', expected: schema.artifact_type, actual: evidence.artifact_type, severity: 'error' })
  }

  // payload 必填字段
  for (const req of schema.required_fields) {
    const val = getNested(evidence.payload, req.path)
    if (req.check === 'non_empty_array' && (!Array.isArray(val) || val.length === 0)) {
      failures.push({ field: req.path, expected: req.check, actual: JSON.stringify(val), severity: 'error' })
    }
    if (req.check === 'non_empty_string' && typeof val !== 'string') {
      failures.push({ field: req.path, expected: 'non-empty string', actual: typeof val, severity: 'error' })
    }
  }

  return {
    validator: 'V1',
    verdict: failures.length === 0 ? 'pass' : 'fail',
    failures,
    ran_at: new Date().toISOString(),
    duration_us: 0  // filled by caller
  }
}
```

### 2.3 P6/P7 特殊处理

P6 的 `artifacts[].exists` 字段在 V1 不检查——由 V3 通过 `fs.statSync` 检查。
V1 只检查字段存在且类型为 boolean。

## 三、V2 — 引用完整性

### 3.1 判据

```
① P2 knowledge_plan.units_to_open[] 中的 unit 路径:
    在 workspace_root/opc-memory/knowledge/ 下目录存在

② P3 sub_pipelines[].dependencies[]:
    引用的 sub_pipeline.id 在 sub_pipelines[] 中存在

③ P3 interfaces[].from / interfaces[].to:
    引用的 sub_pipeline.id 在 sub_pipelines[] 中存在

④ P5 blocked_by_graph 的 key 和 value:
    引用的 node_name 在 flow_state 的节点清单中存在

⑤ P7 quality_gate_results[].evidence_ref:
    引用的 P6 evidence artifact 文件在 opc-logs/ 下存在

⑥ P4 brief_to_task_mapping[].task_requirement_id:
    引用的 requirement id 在 P2 task_analysis_evidence 中存在
```

### 3.2 实现约束

- 所有文件路径检查使用 `fs.statSync` (同步，TS 纯函数内可调用)
- 不存在的路径：`fail`，提示 "路径 X 不存在，请确认 evidence 引用正确"
- 不存在的 ID 引用：`fail`，提示 "引用的 sub_pipeline id=X 在 decomposition 中未定义"

## 四、V3 — Evidence 存在性

### 4.1 判据

```
① P1: user_quotes[] 至少 1 条非空字符串
② P2: requirements[].source_quote 非空
③ P3: sub_pipelines[].estimated_nodes > 0
④ P4: brief_content 非空
⑤ P5: selection_rationale 非空
⑥ P6: artifacts[].exists === true（通过 fs.statSync 验证）
     artifacts 文件路径 stat 存在 + size > 0
⑦ P7: node_completion_map 中至少 1 个节点的状态非空
⑧ P8: recommended_action 非空
```

### 4.2 P6 L1/L2 检查 (L1 工件存在性)

```
P6 L1 工件检查:
    对 artifacts[] 中 type='source' 的条目:
        fs.statSync(path) 存在 → pass
        不存在 → fail (L1)
    
    L1 fail → 直接 reject opc_node_finish({status:"failed"})
    L1 pass + L2 quality_gate 未通过 → fail
```

## 五、V4 — 覆盖率

### 5.1 判据

```
① P1: task_criteria_hits 中 matched=true 的项数 ≥ 1
    若 matched=0 → 分类可能错误

② P2: knowledge_plan.estimated_coverage ≥ 0.3
    若 < 0.3 → 知识覆盖不足，分析可能遗漏关键依赖

③ P4: coverage_score ≥ 0.5
    若 < 0.5 → brief 对 task_analysis 的覆盖不足
    coverage_score = brief_to_task_mapping 中 covered=true 的数量 / 总需求数

④ P7: node_completion_map 中 completed 占比 ≥ 0.8
    若 < 0.8 → 阶段完成度不足，不应推进
```

### 5.2 阈值配置

```typescript
const V4_THRESHOLDS = {
  P1_min_matched_criteria: 1,
  P2_min_knowledge_coverage: 0.3,
  P4_min_brief_coverage: 0.5,
  P7_min_node_completion: 0.8
}
```

## 六、V5 — 区分度

### 6.1 判据

```
① P1: task 信号与 chat 信号不能同时 ≥ 3 条 matched
    若同时 ≥ 3 → classification 可能是 ambiguous 但被错误判为 task/chat

② P3: ToT 分支评分方差 ≥ 0.3
    若方差 < 0.3 → 所有分支几乎同分（分支同质化）
    若所有分支 total_score > 4.0 → 怀疑乐观偏差

③ P5: matched_tags 长度 ≥ 2 且 ≤ 10
    若 = 0 → 没有匹配到任何 scenario
    若 > 10 → 区分度太低（全匹配 = 没区分）

④ P5: scenario_hits 中每项 relevant_nodes 长度 ≥ 1 且 ≤ 5
    若某 scenario 的 relevant_nodes > 5 → 该 scenario 定义太宽泛
```

### 6.2 阈值

```typescript
const V5_THRESHOLDS = {
  P3_min_branch_variance: 0.3,
  P3_max_optimism_score: 4.0,
  P5_min_matched_tags: 2,
  P5_max_matched_tags: 10,
  P5_max_nodes_per_scenario: 5
}
```

## 七、兜底 1 — Coverage Guard

### 7.1 判据

```
步骤级兜底（在所有 step 上运行）:

① matched_tags_count / total_known_tags ≥ 0.1
    若 < 0.1 → 几乎没有匹配到已知 tag，可能是全新问题类型

② requirements_count ≥ MIN_REQUIREMENTS (default 2)
    若 < 2 → 需求分析可能不完备

③ 若 step=P3, sub_pipelines.length ≥ MAX_SUB_PIPELINES (default 15)
    若 > 15 → 分解粒度过细，建议合并
```

### 7.2 与 V4 的关系

Coverage Guard 是 V4 的上层兜底——V4 检查 step 专属覆盖率，
Coverage Guard 检查跨 step 的通用覆盖率下限。

## 八、兜底 2 — Rounds Guard

### 8.1 判据

```
① 当前 step 的 reflection 轮数 ≤ step 的 max_rounds
    P1: max 2 (CoVe)
    P2: max 2 (CoVe + Reflexion)
    P3: max 3 (ToT + Debate)
    P4: max 2 (CoVe + Critique)
    P5: max 3 (Critique + Debate)
    P6: max 1 (Validator + Critique)
    P7: max 1 (Validator + CoVe)
    P8: max 2 (Critique + Debate)

② 若当前轮数 > max_rounds:
    → verdict: rounds_exceeded
    → 不再跑 secondary method
    → 降级到 ask_user
```

### 8.2 实现

```typescript
function runRoundsGuard(input: ValidatorInput): ValidatorOutput {
  const step = input.evidence.step
  const maxRounds = MAX_ROUNDS[step]
  const currentRound = input.context?.current_round ?? 1

  if (currentRound > maxRounds) {
    return {
      validator: 'rounds-guard',
      verdict: 'fail',
      failures: [{
        field: 'rounds',
        expected: `≤ ${maxRounds}`,
        actual: `${currentRound}`,
        severity: 'error'
      }],
      ran_at: new Date().toISOString(),
      duration_us: 0
    }
  }
  return { validator: 'rounds-guard', verdict: 'pass', failures: [], ran_at: new Date().toISOString(), duration_us: 0 }
}
```

## 九、兜底 3 — Freshness Guard

### 9.1 判据

```
① 注入的 corrections 条目的 updated_at 距今 ≤ 90 天
    若 > 90 天 → 提示 "该纠正条目可能过时"

② knowledge version 满足 evidence 中声明的 min_version（如有）
    若不满足 → 提示 "knowledge 版本落后，建议 opc_knowledge_read({mode:'diff'})"
```

### 9.2 非阻塞

Freshness Guard 的 failures 标记为 `severity: 'warning'`，不阻塞流程。
过时的 corrections 仍可注入（可能仍有用），过期 knowledge 仍可读（只是提示更新）。

## 十、完整失败响应示例

```json
{
  "validators": [
    { "validator": "V1", "verdict": "pass", "failures": [], "ran_at": "...", "duration_us": 120 },
    { "validator": "V2", "verdict": "pass", "failures": [], "ran_at": "...", "duration_us": 340 },
    { "validator": "V3", "verdict": "fail",
      "failures": [
        { "field": "artifacts[0].exists", "expected": "true", "actual": "false", "severity": "error" }
      ],
      "ran_at": "...", "duration_us": 150
    },
    { "validator": "V4", "verdict": "pass", "failures": [], "ran_at": "...", "duration_us": 90 },
    { "validator": "V5", "verdict": "pass", "failures": [], "ran_at": "...", "duration_us": 80 },
    { "validator": "coverage-guard", "verdict": "pass", "failures": [], "ran_at": "...", "duration_us": 45 },
    { "validator": "rounds-guard", "verdict": "pass", "failures": [], "ran_at": "...", "duration_us": 30 },
    { "validator": "freshness", "verdict": "pass", "failures": [], "ran_at": "...", "duration_us": 55 }
  ],
  "overall_verdict": "fail",
  "critical_failure": {
    "validator": "V3",
    "reason": "artifacts[0] (src/auth/jwt.ts) 文件不存在",
    "required_action": "请确认节点输出文件已写入后重试 opc_node_finish"
  }
}
```

## 十一、可测试性要求

### 11.1 单测规范

```
每个 validator 必须至少覆盖:
    ① 全 pass 的 happy path
    ② 每个判据的 fail path (至少 1 条)
    ③ 边界值（空数组、0、null、undefined）
    ④ P6/P7 的 L1/L2 分支
```

### 11.2 Mock 策略

- `fs.statSync` → mock 返回 stat 对象或 throw ENOENT
- `flow_state` → 构造测试用 state JSON
- 不依赖 LLM、不依赖网络、不依赖 MCP 协议

### 11.3 现有测试

P6/P7 的 validator artifact 写入已有测试覆盖（`validator-log.test.ts`），
V1-V5 的纯函数测试待实现。

## 十二、相关文档

- [00 Server 设计总览](./00_overview.md) — Deterministic Validator 总述
- [02 Evidence Schema](./02_evidence-schema.md) — 各 step 的 evidence 字段定义
- [04 Sub-Agent 权限](./04_subagent-permissions.md) — validator 不涉及 sub-agent
- [父文档](../00_index.md) — reflection-server 总索引
