# 04 opc_phase_start 与 P5 evidence 反思

阶段执行循环的入口。`opc_phase_start` 返回候选节点 + evidence 收集指令，由 Claude 完成排序、收集 `selection_evidence`，再由 reflection-server **P5 反思位点**的 V1-V5 validator + meta-validator 决定路径。

---

## 一、生命周期总览

```
opc_phase_start → 扫描节点 → 匹配排序 → 收集 selection_evidence
    → V1-V5 validator + meta-validator 判定 → opc_phase_confirm
    → 逐 node 执行 → opc_phase_complete → 推进/确认

判定分叉:
  V1-V5 pass + 无严重 objection  → 自动确认（跳过用户）
  V1-V5 pass + 中等 objection    → 快速确认（一键通过，附 reasoning_trace）
  V1-V5 fail 或 严重 objection   → 反思循环（Claude 调 opc_flow_reflect 持久化 + rounds-guard 兜底）

每个阶段层工具返回里附带 flow_next 字段，告诉 Claude 下一步该调什么工具。
反思循环统一走 opc_flow_reflect，与任务分析反思共享日志格式（差异：node_selection 反思持久化到 state.json.phases[].reflection_log，并在 flow-state.json 留指针）。
```

---

## 二、opc_phase_start — 扫描与返回

```
参数: pipeline_id, sub_pipeline_id, phase

行为（纯确定性，零 LLM）:
  → 校验: pipeline 存在、sub 存在、prev phase completed、phase ∈ state.json.phase_plan.selected
  → 扫描 phases/<phase>/nodes/*.md + opc-nodes/<phase>/nodes/*.md
  → 解析每个 node 的 frontmatter
  → tag 交集过滤（纯规则）
  → 标记 recommend 节点（来自 scenario）
  → 标记 phase: in_progress
  → 更新 flow-state.json:
      · current_step = "phase_execution"
      · current_pipeline_pointer = { sub_pipeline_id, phase, node: null }
      · last_heartbeat_at 刷新

返回:
{
  phase: "04-implement-design",
  task_tags: ["backend", "auth", "database"],
  scenario: "add-feature",
  available_nodes: [
    {
      name: "api-design",
      tags: ["api", "backend"],
      description: "设计 API 端点、请求/响应格式、错误码",
      agents: { primary: ["backend-engineer"] },
      input: [...],
      output: [...],
      quality_gates: null,
      recommended: true
    },
    // ... 全部符合条件的节点
  ],
  reflection_budget_hint: {
    max_rounds: 2,                 // rounds-guard 上限（按 phase + complexity 配置）
    primary_method: "M4-Critique",
    secondary_method: "M5-Debate"  // 仅 complexity ≥ medium 启用
  },
  methodology: {
    docs: ["prompts/phase-execution.md", "prompts/reflection-node-selection.md"],
    ref: "三 selection_evidence schema + 四 三种路径 + 05-opc-reflection-server 二/三",
    summary: "语义匹配 + Scenario 对齐 + 覆盖完整 + 无冲突 → 收集 selection_evidence 提交 V1-V5"
  },
  flow_next: {
    suggestion: "自行排序 + 收集 selection_evidence；validator pass 直接 opc_phase_confirm；fail 先调 opc_flow_reflect"
  }
}
```

Claude 拿到后自行语义匹配排序 + 收集 evidence，不依赖 state-server 的 LLM。反思循环走 `opc_flow_reflect`，按 step_id="node_selection" 持久化到 `state.json.phases[].reflection_log`。

---

## 三、selection_evidence schema

节点排序完成后，Claude 收集 `selection_evidence` 提交给 reflection-server P5 验证（详见 [05-opc-reflection-server/02-server-design/00_overview.md 二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)）。

| 字段 | 说明 |
|------|------|
| `matched_tags[]` | 每个选中 node 命中的 task_tags 列表（V4 coverage 检查依据） |
| `scenario_hits[]` | 选中 node 中被 scenario 标记 `recommended:true` 的集合 |
| `file_domain_conflicts[]` | 选中 node 之间检测到的文件域冲突（V5 discrimination 依据） |
| `blocked_by_graph` | 输出→输入推导出的依赖图（V2 referential 依据） |
| `coverage_gaps[]` | task_tags 中未被任何选中 node 覆盖的标签（V4 coverage 触发项） |

> V1-V5 验证规则、primary/secondary 方法选择见 [05-opc-reflection-server/02-server-design/00_overview.md 三](../../05-opc-reflection-server/02-server-design/00_overview.md#三validators) + [01-method-theory/00_overview.md 五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

---

## 四、三种推进路径（由 V1-V5 + meta-validator 决定）

```
if V1-V5 全部 pass + meta-validator 无严重 objection:
    → 自动确认锁定（auto_confirm），通知用户节点方案，不等确认
    → 直接调 opc_phase_confirm
    （配合 auto_advance 4 条件之一：当前 phase 的 P5 selection_evidence 通过）

elif V1-V5 pass + meta-validator 中等 objection:
    → 快速确认：展示方案 + reasoning_trace + 主要 objection，用户可一键确认
    → 调 opc_phase_confirm

else (V1-V5 fail 或 严重 objection):
    → 进入反思循环：调 opc_flow_reflect(step_id: "node_selection", round: 1, evidence_diff, validator_result, ...)
      opc_flow_reflect 持久化到 state.json.phases[].reflection_log + flow-state.json 留指针，返回下一轮反思指令
      primary 方法 = M4 Critique（critic sub-agent 只读复审）
      secondary 方法 = M5 Debate（complexity ≥ medium 启用，pro/con 派多视角辩论）
      Claude 逐项调整（缺漏/多余/合并拆分），每轮重新收集 evidence + opc_flow_reflect 上报
      判定:
        validator_result 全部 ok + objections_kept_by_meta == 0 → 跳出，调 opc_phase_confirm
        rounds-guard 触发（reflection_log[step].length == max_rounds 且仍 objections_remain） → 强制确认（ask_user，附 reasoning_trace）
```

**路径示例：**

```
路径 A — 自动确认（V1-V5 pass + 无严重 objection）:
  初始方案 → 收集 evidence → validator 全 ok → 直接 opc_phase_confirm
  例: add-feature + matched_tags 覆盖 100% + 无冲突 → "已自动确认 4 个节点（P5 evidence 通过 V1-V5）"

路径 B — 快速确认（V1-V5 pass + 中等 objection）:
  初始方案 → 收集 evidence → V1-V5 全 ok，meta-validator 保留 1 条中等 objection
  → 展示方案 + 该 objection + reasoning_trace → 用户一键确认/调整

路径 C — 反思循环（V1-V5 fail 或 严重 objection）:
  初始方案 → 收集 evidence → V4 coverage fail（coverage_gaps 非空）
  → 进入 P5 反思（primary=M4 Critique）
  反思内容（由 critic sub-agent 提示）:
    - 缺漏：coverage_gaps 中的标签需要补哪些 node？
    - 多余：是否有 file_domain_conflicts 触发的节点应该删？
    - 合并/拆分：相似节点合并？过大节点拆分？
  每轮反思后重新收集 evidence + opc_flow_reflect 上报 evidence_diff
  达到 rounds-guard 上限后强制确认
```

---

## 五、自省报告格式（提交给 opc_phase_confirm 的 evidence 部分）

Claude 在 `opc_phase_confirm` 前内部生成；evidence_artifact 由 reflection-server 单独存储，selection_evidence_ref 写入 state.json.phases[].evidence_refs：

```json
{
  "selected_nodes": ["api-design", "database-schema", "tdd-implementation"],
  "selection_evidence": {
    "matched_tags": [
      {"node": "api-design", "tags": ["api", "backend"]},
      {"node": "database-schema", "tags": ["database", "backend"]},
      {"node": "tdd-implementation", "tags": ["backend"]}
    ],
    "scenario_hits": ["api-design", "database-schema"],
    "file_domain_conflicts": [],
    "blocked_by_graph": [
      {"from": "tdd-implementation", "to": ["api-design", "database-schema"]}
    ],
    "coverage_gaps": []
  },
  "auto_confirm": true,
  "self_check_summary": "add-feature 场景完美命中，API+DB+实现三个关注面完整覆盖，无冗余节点",
  "warnings": ["未选中 security-review（matched_tags 仅 1/3），如需安全审查请手动添加"]
}
```

---

## 六、反思循环示例

```
第 1 轮: 初始方案 → 收集 evidence → V4 coverage fail（coverage_gaps: ["database"]）
          → opc_flow_reflect(step_id="node_selection", round=1, evidence_diff={removed:[], added:[], modified:[]}, validator_result={V4:"fail"})
          → 补选 database-schema → V4 ok，但 V5 discrimination warn（轻微冗余）

第 2 轮: 方案调整 → 重新收集 evidence → V5 warn 由 meta-validator 评为非严重
          → opc_flow_reflect(round=2, evidence_diff={added:["database-schema"]}, validator_result={V1-V5:"ok"}, objections_kept_by_meta=1)
          → V1-V5 全 ok + meta-validator 保留 1 条非严重 objection → 路径 B 快速确认

调整仍通过 `opc_phase_adjust(pipeline_id, sub_id, phase, nodes: [...])` 重新生成预览。与旧设计不同的是，**大部分常规任务的调整由 Claude 在反思循环中自行完成**，用户只在严重 objection 或 rounds 耗尽时介入。
```

---

## 相关文档

- [02_node-selection.md](02_node-selection.md) — 节点匹配算法 + selection_evidence 字段补充
- [05_phase-confirm-execute.md](05_phase-confirm-execute.md) — `opc_phase_confirm` + 执行
- [06_phase-complete-reset.md](06_phase-complete-reset.md) — auto_advance 4 条件（含 P5 evidence 通过）
- [../01-intent-analysis/02_flow-tools-entry-lifecycle.md](../01-intent-analysis/02_flow-tools-entry-lifecycle.md) — `opc_flow_reflect` 工具
- [../../05-opc-reflection-server/02-server-design/00_overview.md](../../05-opc-reflection-server/02-server-design/00_overview.md) — evidence schema + V1-V5 validator
- [../../05-opc-reflection-server/01-method-theory/00_overview.md](../../05-opc-reflection-server/01-method-theory/00_overview.md) — M4 Critique / M5 Debate 方法
