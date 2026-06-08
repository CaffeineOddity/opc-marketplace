# 04 opc_phase_start 与自省评估

阶段执行循环的入口。`opc_phase_start` 返回候选节点 + 自省评估指令，由 Claude 完成排序、自省、置信度打分，再决定路径 A/B/C 推进。

---

## 一、生命周期总览

```
opc_phase_start → 扫描节点 → 匹配排序 → 自省评估 → opc_phase_confirm
    → 逐 node 执行 → opc_phase_complete → 推进/确认

自省评估分叉:
  高置信度 → 自动确认（跳过用户）
  中置信度 → 快速确认（一键通过）
  低置信度 → 反思循环（Claude 调 opc_flow_reflect 持久化 + max_reflection_rounds 兜底）

每个阶段层工具返回里附带 flow_next 字段，告诉 Claude 下一步该调什么工具。
反思循环统一走 opc_flow_reflect，与任务分析反思共享日志格式（flow-state.json）。
```

---

## 二、opc_phase_start — 扫描与返回

```
参数: pipeline_id, sub_pipeline_id, phase

行为（纯确定性，零 LLM）:
  → 校验: pipeline 存在、sub 存在、prev phase completed
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
  max_reflection_rounds: 2,
  min_confidence_for_auto: 0.85,
  methodology: {
    docs: ["prompts/phase-execution.md", "prompts/reflection-node-selection.md"],
    ref: "§5.2 自省评估 4 维度 + §5.2 三种推进路径",
    summary: "语义匹配×0.30 + Scenario对齐×0.25 + 覆盖完整×0.30 + 冗余×0.15"
  },
  flow_next: {
    suggestion: "自行排序 + 自省打分；高置信度直接 opc_phase_confirm；低置信度先调 opc_flow_reflect"
  }
}
```

Claude 拿到后自行语义匹配排序 + 展示给用户，不依赖 state-server 的 LLM。反思循环走 `opc_flow_reflect`，与任务分析反思共用日志格式。

---

## 三、自省评估 4 维度

节点排序完成后，Claude **自省评估**选择质量，给出置信度分数。

| 维度 | 权重 | 0-0.4 (低) | 0.5-0.7 (中) | 0.8-1.0 (高) |
|------|------|-----------|-------------|------------|
| 语义匹配强度 | 0.30 | 多数节点语义相似度 < 0.6 | 多数节点在 0.6-0.8 | 多数节点 > 0.8，高度匹配 |
| Scenario 对齐度 | 0.25 | 选中节点与 scenario 推荐偏差大 | 覆盖大部分推荐，少量偏离 | 完全对齐 scenario 推荐 |
| 覆盖完整性 | 0.30 | 明显遗漏关键关注面 | 覆盖主要关注面，个别可补充 | 全部关注面有对应节点 |
| 节点冗余度 | 0.15 | 多个节点职责重叠严重 | 少量重叠但可接受 | 无冗余，职责分明 |

```
选择置信度 = 语义匹配强度×0.30 + Scenario对齐度×0.25
            + 覆盖完整性×0.30 + 节点冗余度×0.15
```

---

## 四、三种推进路径

**结合 phase 的 `min_confidence_for_auto`：**

```
if 选择置信度 ≥ min_confidence_for_auto:
    → 自动确认锁定（auto_confirm），通知用户节点方案，不等确认
    → 直接调 opc_phase_confirm

elif 选择置信度 ≥ min_confidence_for_auto × 0.75:
    → 快速确认：展示方案 + 置信度分数 + 简要理由，用户可一键确认
    → 调 opc_phase_confirm

else:
    → 进入反思循环：调 opc_flow_reflect(step_id: "node_selection", round: 1, ...)
      opc_flow_reflect 持久化到 state.json.phases[].reflection_log + flow-state.json 留指针，返回下一轮反思指令
      Claude 逐项自查（缺漏/多余/合并拆分），每轮重新打分 + opc_flow_reflect 上报
      判定:
        new_confidence ≥ threshold → 跳出，调 opc_phase_confirm
        round 达 max_reflection_rounds → 强制确认（ask_user）
```

**路径示例：**

```
路径 A — 自动确认（置信度 ≥ threshold）:
  初始方案 → Claude 自省打分 → ≥ 0.85 → 直接 opc_phase_confirm
  例: add-feature + 语义相似度 > 0.9 → "已自动确认 4 个节点（置信度 0.91）"

路径 B — 快速确认（threshold × 0.75 ≤ 置信度 < threshold）:
  初始方案 → Claude 自省打分 → 0.65-0.84 → 展示方案 + 分数 → 用户一键确认/调整

路径 C — 反思循环（置信度 < threshold × 0.75）:
  初始方案 → Claude 自省打分 → < 0.65 → 进入反思循环
  反思内容:
    - 缺漏：是否有该做但未选中的节点？
    - 多余：是否有不必要或重复的节点？
    - 合并/拆分：相似节点合并？过大节点拆分？
  每轮反思后重新自省打分
  达到 max_reflection_rounds 后强制确认
```

---

## 五、自省报告格式

Claude 在 `opc_phase_confirm` 前内部生成：

```json
{
  "selected_nodes": ["api-design", "database-schema", "tdd-implementation"],
  "selection_confidence": 0.88,
  "auto_confirm": true,
  "confidence_detail": {
    "semantic_match_strength": 0.85,
    "scenario_alignment": 0.95,
    "coverage_completeness": 0.80,
    "redundancy": 0.95
  },
  "self_check_summary": "add-feature 场景完美命中，API+DB+实现三个关注面完整覆盖，无冗余节点",
  "warnings": ["未选中 security-review（置信度 0.68 低于阈值），如需安全审查请手动添加"]
}
```

---

## 六、反思循环示例

```
第 1 轮: 初始方案 → 置信度 0.58 → 缺 database-schema（覆盖完整性低）
          → 补选 database-schema → 置信度 0.72 → 仍低于 0.85

第 2 轮: 方案调整 → 置信度 0.72 → 检查是否有多余节点
          → 无冗余 → 置信度 0.78（scenario 对齐度提升）→ 仍低于 0.85

第 3 轮: 方案确认 → 置信度 0.82 → 接近但未达阈值
          → max_reflection_rounds=4 → 继续

第 4 轮: 最终检查 → 置信度 0.82 → 达到上限
          → 强制确认："以下方案经 4 轮优化，置信度 0.82，请确认"
```

调整仍通过 `opc_phase_adjust(pipeline_id, sub_id, phase, nodes: [...])` 重新生成预览。与旧设计不同的是，**大部分常规任务的调整由 Claude 在自省循环中自行完成**，用户只在低置信度或达到上限时介入。

---

## 相关文档

- [02_node-selection.md](02_node-selection.md) — 节点匹配 + 反思轮次 + 置信度阈值
- [05_phase-confirm-execute.md](05_phase-confirm-execute.md) — `opc_phase_confirm` + 执行
- [../01-intent-analysis/02_flow-tools-entry-lifecycle.md](../01-intent-analysis/02_flow-tools-entry-lifecycle.md) — `opc_flow_reflect` 工具
