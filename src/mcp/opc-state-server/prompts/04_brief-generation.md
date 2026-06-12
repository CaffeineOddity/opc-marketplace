# Brief Generation Method (P4)

> Methodology for `opc_brief_complete`. Loaded as a docs reference
> when Claude is at `current_step = brief_generation`. Spec source:
> [doc/feature/02-opc-state-server/01-intent-analysis/08_brief-generation.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/08_brief-generation.md).

## 1. Purpose

Assemble a fixed-section markdown brief (`brief.md`) that captures
the task contract for the pipeline. Brief is an **assembly** of
upstream `task_analysis` + `decomposition` results — it introduces
no new decisions, so P4 reflection is the lightest in the stack
(1 round default).

## 2. When this step fires

ONLY for `complexity ∈ {medium, high}`. Triggered by:

- `opc_task_analysis_complete` when no decomposition is needed
  (modify count ≤ 1), OR
- `opc_decomposition_complete` after decomposition passed P3.

For `complexity = low`, brief generation is skipped entirely —
quick_dispatch path has no pipeline and no brief.

## 3. The 8-section template

Output `brief_content` as markdown matching this template
EXACTLY (section headers verbatim, table columns in order):

```markdown
# 任务工作单

## 问题描述
[user request distilled to one sentence — verbatim from
 analysis_result.description, NO expansion]

## 基本信息
| 属性 | 值 |
|------|-----|
| 管线 ID | {pipeline_id} |
| 复杂度 | medium / high |
| 涉及阶段 | 04-implement-design → 05-implement → 06-testing |
| 关联 Scenario | {scenario} |

## 范围
### 包含
- [in-scope items derived from tags + description]

### 不包含
- [out-of-scope, err on the side of listing more]

## 约束
[user-stated constraints only; if none, write "无特殊约束"]

## 阶段计划
> 阶段选择理由：{phase_selection_rationale from analysis_result}

| 阶段 | 目标 | 关键节点 |
|------|------|---------|
| 04-implement-design | 实现设计 | api-design, database-schema |
| 05-implement | 编码实现 | tdd-implementation |
| 06-testing | 验证测试 | integration-test |

## 关联知识
| 知识路径 | 操作 | 当前状态 | 说明 |
|---------|------|---------|------|
| user-auth/login/api | update | v2 | 需补充新接口 |
| payment/ | create | — | 全新 domain |

## 准入检查
- [ ] 知识库 opc_knowledge_list 已执行
- [ ] 知识库 opc_knowledge_open 已执行
- [ ] 目标 unit 已创建
- [ ] 用户约束已确认
```

The 8 fixed sections (in order):

1. 问题描述
2. 基本信息
3. 范围 (with 包含 / 不包含 subsections)
4. 约束
5. 阶段计划
6. 关联知识
7. 准入检查
8. (no 8th — sections 1–7 + the title block constitute the contract)

## 4. Generation rules

| Section | Rule |
|---|---|
| 问题描述 | One sentence verbatim from `analysis_result.description`. No paraphrase, no expansion. |
| 基本信息.复杂度 | Exactly `medium` or `high` (low never reaches this step). |
| 基本信息.涉及阶段 | Joined `→` of `analysis_result.suggested_phases` in order. |
| 范围.包含 | Derived from tags + description. |
| 范围.不包含 | Err on the side of listing more — explicit non-scope reduces P5 drift. |
| 约束 | ONLY explicit user constraints. NEVER invent constraints. If none, write `无特殊约束`. |
| 阶段计划 | First line MUST be `> 阶段选择理由：{phase_selection_rationale}` (taken verbatim from `analysis_result`). Keeps brief consistent with `state.json.phase_plan.selection_rationale`. |
| 关联知识 | One row per `knowledge_plan[]` entry. Fold paths to existing subsection level when possible (`user-auth/login/api` not `user-auth/login/api.md`). |
| 准入检查 | EXACTLY the 4 baseline items — no additions, no removals. |
| Post-write | brief.md is immutable after generation; pipeline execution NEVER mutates it. Use `opc_pipeline_replan` for scope changes. |

## 5. Evidence schema (OPTIONAL — brief is assembly, not decision)

```json
{
  "brief_evidence": {
    "coverage_check": [
      {"section": "阶段计划", "source_ref": "analysis_evidence_ref:r-…", "covered": true},
      {"section": "关联知识", "source_ref": "analysis_evidence_ref:r-…", "covered": true}
    ],
    "constraint_completeness": {
      "user_quotes_scanned": ["实现登录页面", "用 jwt 认证"],
      "missing_constraint_signals": []
    }
  }
}
```

- `coverage_check[].source_ref` reuses upstream P2 / P3
  evidence_ref — brief contributes no new evidence, just confirms
  it propagated.
- `constraint_completeness.user_quotes_scanned[]` MUST be verbatim
  substrings retrievable from `state.user_message_history`.
- `missing_constraint_signals[]` non-empty → flag for user
  short-confirm before pipeline_create.

Submitting `brief_evidence` is OPTIONAL but RECOMMENDED for
`complexity = high` — P4 rounds-guard treats absence as soft
warning, not hard failure.

## 6. Routing by validator result

P4 is intentionally light — rounds-guard default = 1.

| V1–V5 + meta result | Effect |
|---|---|
| All pass + no severe objection | Direct route to `pipeline_create` |
| Pass + medium objection | Route through; `step_instruction` shows reasoning_trace |
| Fail or severe objection | Single P4 reflection round (primary=M3 CoVe, secondary=M4 Critique). Exhausted → `ask_user` |

Method definitions:
[05-opc-reflection-server/01-method-theory/00_overview.md](../../../../doc/feature/05-opc-reflection-server/01-method-theory/00_overview.md).

## 7. Output contract

```json
{
  "brief_content": "# 任务工作单\n\n## 问题描述\n...",
  "brief_evidence": { ... },
  "next": { "tool": "opc_brief_complete" }
}
```

`opc_brief_complete` enforces:

- Markdown contains all 7 section headers in the correct order.
- `阶段计划` section's first line matches the
  `> 阶段选择理由：…` pattern AND text equals
  `analysis_result.phase_selection_rationale`.
- `关联知识` table has the 4-column header `| 知识路径 | 操作 | 当前状态 | 说明 |`.
- `准入检查` contains exactly the 4 baseline items.

Drift from any of the above is a hard validation error (no
reflection retry — fix the markdown and resubmit).

## 8. Correction commands (post-brief, pre-pipeline)

| User phrase | Tool to call |
|---|---|
| "改 brief" / "重新写 brief" | `opc_flow_restart({from_step:"brief_generation"})` |
| "加约束: X" | `opc_flow_revise({field:"constraints", append:["X"]})` then re-enter brief_generation |
| "改范围" | `opc_flow_revise({field:"scope", value:{...}})` |
| "就这样" / "继续" | Honor previous `flow_next` (typically `opc_pipeline_create`); no flow tool needed |
