# 02 — P1–P8 Evidence Artifact 完整 Schema

> 本章提供 8 个 reflection point 的 evidence artifact 完整 schema、
> 字段说明、真实示例、以及 validator 如何消费这些字段。
> 禁止 `confidence: number`，所有判定基于可审计的证据字段。

## 一、通用结构

```typescript
type EvidenceArtifact = {
  step: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8'
  artifact_type: string
  payload: Record<string, unknown>
  collected_at: string  // ISO 8601
  collected_by: 'host' | string  // sub-agent-id
}
```

**设计原则**：
- `confidence` 字段被**显式禁止**——置信度不可审计、不可复现
- 每个字段对应一个可独立验证的事实声明
- `collected_by` 区分 Host 直接收集 vs sub-agent 汇报，用于追溯

## 二、P1 — 意图分类证据

### 2.1 Schema

```typescript
type IntentEvidence = EvidenceArtifact & {
  step: 'P1'
  artifact_type: 'intent_evidence'
  payload: {
    task_criteria_hits: Array<{
      criterion: 'explicit_task_words' | 'multi_step' | 'creates_artifacts' | 'has_dependencies' | 'not_pure_question'
      matched: boolean
      evidence: string  // 原文引用
    }>
    chat_signals: Array<{
      signal: 'single_question' | 'greeting' | 'chitchat' | 'clarification' | 'social'
      detected: boolean
      evidence: string
    }>
    user_quotes: string[]       // ≥1 条用户原文引用
    classification: 'task' | 'chat' | 'ambiguous'
    reasoning: string           // 分类推理过程
    ambiguity_handled: boolean  // 若 ambiguous，是否做了消歧处理
  }
}
```

### 2.2 示例

```json
{
  "step": "P1",
  "artifact_type": "intent_evidence",
  "payload": {
    "task_criteria_hits": [
      { "criterion": "explicit_task_words", "matched": true, "evidence": "\"帮我实现一个用户登录功能\"" },
      { "criterion": "creates_artifacts", "matched": true, "evidence": "要求产出代码文件" },
      { "criterion": "not_pure_question", "matched": true, "evidence": "不是纯问答" }
    ],
    "chat_signals": [
      { "signal": "single_question", "detected": false, "evidence": "" }
    ],
    "user_quotes": ["帮我实现一个用户登录功能，包括 JWT token 和 refresh token"],
    "classification": "task",
    "reasoning": "含显式任务词'实现'，要求产出代码，多步骤（JWT + refresh），判定为 task",
    "ambiguity_handled": false
  },
  "collected_at": "2026-06-11T10:00:00Z",
  "collected_by": "host"
}
```

### 2.3 Validator 消费

| Validator | 检查 |
|---|---|
| V1 schema | `task_criteria_hits` 至少 5 项、`user_quotes` 非空 |
| V2 referential | `evidence` 引用的原文可在 flow-state 中找到 |
| V4 coverage | `task_criteria_hits` 中 matched=true 的项 ≥1 |
| V5 discrimination | task 信号与 chat 信号不同时为 true |

## 三、P2 — 任务分析证据

### 3.1 Schema

```typescript
type TaskAnalysisEvidence = EvidenceArtifact & {
  step: 'P2'
  artifact_type: 'task_analysis_evidence'
  payload: {
    requirements: Array<{
      id: string
      description: string
      source_quote: string      // 从用户原文中的引用
      priority: 'must' | 'should' | 'nice_to_have'
    }>
    dependencies: Array<{
      id: string
      description: string
      type: 'external_api' | 'internal_module' | 'knowledge' | 'tool' | 'environment'
      identified_from: string   // 从哪里识别出此依赖
    }>
    risks: Array<{
      id: string
      description: string
      likelihood: 'low' | 'medium' | 'high'
      impact: 'low' | 'medium' | 'high'
    }>
    knowledge_plan: {
      units_to_open: string[]   // 需要 opc_knowledge_open 的 unit 列表
      estimated_coverage: number  // 预估知识覆盖率 0-1
    }
  }
}
```

### 3.2 示例

```json
{
  "step": "P2",
  "artifact_type": "task_analysis_evidence",
  "payload": {
    "requirements": [
      { "id": "R1", "description": "JWT access token 生成与验证", "source_quote": "\"JWT token\"", "priority": "must" },
      { "id": "R2", "description": "refresh token 轮换机制", "source_quote": "\"refresh token\"", "priority": "must" },
      { "id": "R3", "description": "用户注册页面", "source_quote": "\"登录功能\"", "priority": "should" }
    ],
    "dependencies": [
      { "id": "D1", "description": "需要 JWT 库（如 jose）", "type": "external_api", "identified_from": "JWT 需求分析" },
      { "id": "D2", "description": "需要数据库存储用户凭证", "type": "internal_module", "identified_from": "登录流程分析" }
    ],
    "risks": [
      { "id": "RK1", "description": "refresh token 泄露风险", "likelihood": "medium", "impact": "high" }
    ],
    "knowledge_plan": {
      "units_to_open": ["auth", "database"],
      "estimated_coverage": 0.7
    }
  },
  "collected_at": "2026-06-11T10:01:00Z",
  "collected_by": "host"
}
```

### 3.3 Validator 消费

| Validator | 检查 |
|---|---|
| V1 | `requirements` 非空、`dependencies` 完整 |
| V2 | `knowledge_plan.units_to_open` 路径存在 |
| V3 | `source_quote` 非空、`identified_from` 非空 |
| V4 | `estimated_coverage` ≥ 0.3（过低说明分析不充分） |

## 四、P3 — 分解证据

### 4.1 Schema

```typescript
type DecompositionEvidence = EvidenceArtifact & {
  step: 'P3'
  artifact_type: 'decomposition_evidence'
  payload: {
    sub_pipelines: Array<{
      id: string
      name: string
      description: string
      estimated_nodes: number
      dependencies: string[]    // 对其它 sub_pipeline 的依赖
    }>
    interfaces: Array<{
      from: string
      to: string
      data: string
      protocol: 'file' | 'api' | 'message'
    }>
    parallel_groups: Array<{
      group_id: string
      members: string[]         // 可并行的 sub_pipeline id 列表
    }>
    alternatives_considered: number  // ToT 考虑了几个备选方案
  }
}
```

### 4.2 示例

```json
{
  "step": "P3",
  "artifact_type": "decomposition_evidence",
  "payload": {
    "sub_pipelines": [
      { "id": "sub-1", "name": "后端认证 API", "description": "实现 JWT 签发与验证端点", "estimated_nodes": 4, "dependencies": [] },
      { "id": "sub-2", "name": "数据库 schema", "description": "用户表 + refresh token 表", "estimated_nodes": 2, "dependencies": [] },
      { "id": "sub-3", "name": "前端登录页面", "description": "登录表单 + token 存储", "estimated_nodes": 3, "dependencies": ["sub-1"] }
    ],
    "interfaces": [
      { "from": "sub-3", "to": "sub-1", "data": "POST /auth/login → { access_token, refresh_token }", "protocol": "api" }
    ],
    "parallel_groups": [
      { "group_id": "G1", "members": ["sub-1", "sub-2"] }
    ],
    "alternatives_considered": 4
  },
  "collected_at": "2026-06-11T10:02:00Z",
  "collected_by": "host"
}
```

## 五、P4 — Brief 生成证据

### 5.1 Schema

```typescript
type BriefEvidence = EvidenceArtifact & {
  step: 'P4'
  artifact_type: 'brief_evidence'
  payload: {
    brief_to_task_mapping: Array<{
      brief_section: string
      task_requirement_id: string  // 对应 P2 requirements[].id
      covered: boolean
      gap_note: string | null
    }>
    coverage_score: number  // 0-1，brief 对 task_analysis 的覆盖比例
    brief_content: string   // brief 全文
  }
}
```

## 六、P5 — 节点选择证据

### 6.1 Schema

```typescript
type SelectionEvidence = EvidenceArtifact & {
  step: 'P5'
  artifact_type: 'selection_evidence'
  payload: {
    matched_tags: string[]        // 匹配到的 scenario/domain tags
    scenario_hits: Array<{
      scenario: string
      relevant_nodes: string[]
    }>
    file_domain_conflicts: Array<{
      file: string
      conflicting_nodes: string[]
      resolution: string
    }>
    blocked_by_graph: Record<string, string[]>  // node → 被哪些依赖阻塞
    selection_rationale: string   // 为什么选择这组节点
  }
}
```

## 七、P6 — 节点执行证据

### 7.1 Schema

```typescript
type NodeEvidence = EvidenceArtifact & {
  step: 'P6'
  artifact_type: 'node_evidence'
  node_type?: 'implementation' | 'test' | 'deploy' | 'control'
  payload: {
    artifacts: Array<{
      path: string                // 产出的文件路径
      type: 'source' | 'test' | 'config' | 'doc' | 'build_output'
      exists: boolean             // V1 检查的实际结果
      size_bytes: number
    }>
    test_results?: {
      total: number
      passed: number
      failed: number
      skipped: number
      output_snippet: string      // 测试输出的关键片段
    }
    lint_results?: {
      errors: number
      warnings: number
      output_snippet: string
    }
    build_output?: {
      success: boolean
      output_snippet: string
    }
    node_name: string
    sub_pipeline_id: string
  }
}
```

### 7.2 示例

```json
{
  "step": "P6",
  "artifact_type": "node_evidence",
  "node_type": "implementation",
  "payload": {
    "artifacts": [
      { "path": "src/auth/jwt.ts", "type": "source", "exists": true, "size_bytes": 2048 },
      { "path": "test/auth/jwt.test.ts", "type": "test", "exists": true, "size_bytes": 1024 }
    ],
    "test_results": { "total": 5, "passed": 5, "failed": 0, "skipped": 0, "output_snippet": "5 passed" },
    "lint_results": { "errors": 0, "warnings": 0, "output_snippet": "" },
    "node_name": "implement-jwt-auth",
    "sub_pipeline_id": "sub-1"
  },
  "collected_at": "2026-06-11T10:05:00Z",
  "collected_by": "sub-agent-backend-architect"
}
```

## 八、P7 — 阶段完成证据

### 8.1 Schema

```typescript
type PhaseEvidence = EvidenceArtifact & {
  step: 'P7'
  artifact_type: 'phase_evidence'
  payload: {
    quality_gate_results: Array<{
      gate: string
      passed: boolean
      detail: string
      evidence_ref: string      // 指向具体的 P6 evidence artifact
    }>
    node_completion_map: Record<string, 'completed' | 'failed' | 'skipped'>
    all_nodes_completed: boolean
    failed_nodes: string[]
  }
}
```

## 九、P8 — 阶段推进证据

### 9.1 Schema

```typescript
type AdvanceEvidence = EvidenceArtifact & {
  step: 'P8'
  artifact_type: 'advance_evidence'
  payload: {
    auto_advance_4_conditions: {
      all_nodes_completed: boolean
      quality_gate_passed: boolean
      no_pending_reflections: boolean
      no_unresolved_interventions: boolean
    }
    unblocked_phases: string[]
    recommended_action: 'advance' | 'phase_reset' | 'ask_user'
    reset_level?: 'L0' | 'L1' | 'L2' | 'L3'
  }
}
```

## 十、Validator 消费矩阵

| Evidence | V1 Schema | V2 Referential | V3 Presence | V4 Coverage | V5 Discrimination |
|---|---|---|---|---|---|
| P1 intent | ✅ `task_criteria_hits` 5项 | ✅ 原文引用存在 | ✅ `user_quotes` 非空 | ✅ matched ≥1 | ✅ task/chat 互斥 |
| P2 task_analysis | ✅ `requirements` 非空 | ✅ `units_to_open` 路径 | ✅ `source_quote` 非空 | ✅ coverage ≥0.3 | — |
| P3 decomposition | ✅ `sub_pipelines` 非空 | ✅ 依赖引用存在 | ✅ `interfaces` 完整 | — | ✅ 分支多样化 |
| P4 brief | ✅ `brief_to_task_mapping` | ✅ 映射到已有 req id | ✅ `brief_content` 非空 | ✅ `coverage_score` | — |
| P5 selection | ✅ `matched_tags` | ✅ `blocked_by_graph` | ✅ `selection_rationale` | — | ✅ 区分度阈值 |
| P6 node | ✅ `artifacts` 非空 | ✅ 文件路径 stat | ✅ `artifacts[].exists` | — | — |
| P7 phase | ✅ `quality_gate_results` | ✅ `evidence_ref` 路径 | ✅ `node_completion_map` | — | — |
| P8 advance | ✅ 4 条件结构完整 | — | ✅ `recommended_action` | — | — |

## 十一、相关文档

- [00 Server 设计总览](./00_overview.md) — Evidence Schema 总述
- [01 工具规范](./01_tool-specs.md) — 各工具如何接收 evidence 参数
- [03 Validators](./03_validators.md) — V1-V5 如何逐字段校验
- [父文档](../00_index.md) — reflection-server 总索引
