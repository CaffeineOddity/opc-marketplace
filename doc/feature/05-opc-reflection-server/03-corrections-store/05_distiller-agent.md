# 05 Distiller Sub-Agent（A3）

> distiller 是 pipeline 结束时唯一把 **L1（流水级 user_interventions + reflection_log）** 提炼成 **L2（项目级 corrections）** 的执行者。本文给出输入 / 输出 schema、提示词模板、合并与去重策略、失败处理。

---

## 一、定位与不变量

- **唯一通路**：L1 → L2 的转化只允许 distiller 干。任何其他 server / tool 直接往 `.opc/corrections/` 写入都视为违规。
- **零自由度**：distiller 输出必须严格符合 schema；任何"自由叙述"字段都不收。
- **失败不阻塞 pipeline**：distiller 失败 → 写 `opc-logs/distiller/<pipeline-id>-error.json` + 在 manifest 末尾追加 `distiller_status: "failed"`，pipeline 仍标 `complete`。
- **可重跑**：同一 pipeline_id 的 distill 可重复触发，每次基于当前 L2 状态做幂等合并。

---

## 二、触发与调用入口

```
pipeline_complete → opc_reflect_record_interventions(pipeline_id)
  → reflection-server 内部 spawn distiller sub-agent (Task 工具)
  → distiller 调 opc_corrections_query / opc_corrections_upsert
  → 返回 { new_count, merged_count, skipped_count, manifest_path }
  → reflection-server 写入 pipeline manifest 末尾「教训提炼摘要」段
```

**调用方**：`opc-reflection-server`
**spawn 方式**：`Task subagent_type=opc-distiller`
**所需工具白名单**（kit `agents/opc-distiller.md` 必须只声明这几样）：

| 工具 | 用途 |
|---|---|
| `opc_corrections_query` | 读 L2 现有条目（用于相似度匹配） |
| `opc_corrections_upsert` | 写 L2（新建 / 合并） |
| `opc_knowledge_get`（只读） | 读 pipeline 涉及的 unit/section 上下文 |
| `opc_flow_query` | 读 L1（flow-state.json 的 user_interventions + reflection_log） |

**不得包含**：任何 `_write` / `_delete` / `opc_pipeline_*` / `opc_flow_*` 写工具——distiller 只能往 corrections 里写，且通过 `opc_corrections_upsert` 走 server 校验。

---

## 三、输入

distiller spawn 时 reflection-server 通过 `dispatch_context` 注入：

```json
{
  "pipeline_id": "pipe-2026-06-10-auth-jwt",
  "flow_session_id": "sess-12345-1717840000",
  "l1_source": {
    "user_interventions_path": ".opc/sessions/sess-12345-1717840000/flow-state.json#user_interventions",
    "reflection_log_path": ".opc/sessions/sess-12345-1717840000/flow-state.json#reflection_log",
    "rounds_exceeded_artifacts": [
      "opc-logs/reflection/p3-decomposition-r3-2026-06-10.json"
    ]
  },
  "pipeline_metadata": {
    "scope": "user-auth + jwt-refresh",
    "phases_executed": 9,
    "nodes_completed": 23,
    "nodes_failed": 1,
    "modify_units": ["packages/auth", "packages/api-gateway"]
  },
  "budget": {
    "max_new_corrections": 8,
    "max_merge_operations": 20,
    "max_runtime_sec": 90
  }
}
```

---

## 四、输出 Schema

distiller 在结束前调一次 `opc_corrections_upsert(batch=[...])`，batch 元素 schema：

```json
{
  "operation": "create" | "merge",
  "match_id": "<merge 时必填，指向已存在的 correction id>",
  "correction": {
    "id": "corr-<auto>",
    "step": "intent_analysis" | "task_analysis" | "task_decomposition" | "brief_generation" | "node_selection" | "node_execution" | "phase_completion" | "phase_advance",
    "applies_when": {
      "keywords": ["JWT", "refresh token"],
      "phase_id": ["04-implement-design", "05-tdd-implementation"],
      "modify_unit_pattern": "packages/auth/**"
    },
    "lesson": "<≤ 300 chars 中文/英文均可，主体内容>",
    "rationale": "<≤ 500 chars 解释 why——用户原话或反思摘要>",
    "source": "user" | "distiller" | "reflexion",
    "trigger": "intervention" | "rounds_exceeded" | "reflection_objection",
    "linked_reflection_artifacts": ["opc-logs/reflection/..."],
    "linked_interventions": [{"ts": "...", "text": "..."}],
    "hotness": 1,
    "frozen": false,
    "schema_version": "v1"
  }
}
```

distiller 给 reflection-server 的最终返回：

```json
{
  "pipeline_id": "...",
  "stats": {
    "l1_interventions_scanned": 7,
    "l1_rounds_exceeded_scanned": 1,
    "new_count": 3,
    "merged_count": 4,
    "skipped_count": 1,
    "skip_reasons": ["below_significance_threshold"]
  },
  "manifest_block": "<distiller 自己拼好、可直接 append 到 pipeline manifest 末尾的 markdown 片段>",
  "runtime_sec": 42
}
```

---

## 五、提示词模板（v1）

distiller 收到 dispatch_context 后，自行拼装并执行如下流程。**reflection-server 把下面整段作为 sub-agent 的 user message 主体**（注入到 Task 的 `prompt` 字段）。

```text
你是 OPC distiller，唯一职责是把本次 pipeline 的【用户介入 + 反思耗尽记录】提炼为可复用的 corrections 条目并写入 L2 项目库。

【输入定位】
- pipeline_id: {pipeline_id}
- L1 用户介入: 调 opc_flow_query 取 flow-state.user_interventions
- L1 反思日志: 调 opc_flow_query 取 flow-state.reflection_log
- 已耗尽轮次的反思 artifact: {rounds_exceeded_artifacts[]}
- pipeline 元数据: {pipeline_metadata}
- 预算上限: 新建 ≤ {max_new_corrections}, 合并 ≤ {max_merge_operations}, 运行时长 ≤ {max_runtime_sec}s

【强制执行步骤】

Step 1: 加载与归类
1.1 调 opc_flow_query(pipeline_id) 拿 user_interventions[] 与 reflection_log[]
1.2 对每条 intervention：抽 {ts, user_text, before_state, after_state, affected_step}
1.3 对每条 rounds_exceeded artifact：抽 {step, n_rounds, last_objection, user_decision}
1.4 把 1.2 / 1.3 按 step ∈ {intent_analysis, task_analysis, task_decomposition, brief_generation, node_selection, node_execution, phase_completion, phase_advance} 分桶

Step 2: 显著性过滤（不要把噪音变成 corrections）
对每条候选，命中任一即【保留】，否则【skip】并在 skip_reasons 写明：
- user_text 长度 ≥ 8 字 / 8 词，且含具体名词或动作（非"嗯"/"好"/"继续"）
- intervention 触发了 opc_flow_revise / opc_pipeline_replan / phase_reset
- 来自 rounds_exceeded（反思 N 轮仍未消解，必然显著）
- 与已存在 L2 条目相似度 ≥ 阈值（合并候选，进 Step 3）

Step 3: 相似度匹配（合并优先于新建）
对每条保留的候选：
3.1 调 opc_corrections_query({step: <候选 step>, keywords: <从 user_text 抽 3-5 个关键词>})
3.2 对返回的每个 L2 条目计算相似度：
    sim = 0.5 * keyword_overlap + 0.3 * lesson_text_jaccard + 0.2 * applies_when_overlap
3.3 sim ≥ 0.72 → 合并：
    - operation = "merge", match_id = <L2 id>
    - lesson: 保持 L2 原文 + 在末尾追加新观察的差异段（如有）
    - applies_when: union(L2.keywords, 新 keywords) / union(phase_id) / 保留 L2 modify_unit_pattern
    - linked_interventions: append 新条
    - hotness: +1
3.4 sim < 0.72 → 新建：
    - operation = "create"
    - 按【输出 Schema 章】生成完整 correction 对象
    - hotness = 1

Step 4: 预算控制
4.1 按 hotness 优先级排序所有 operation
4.2 截断到 budget.max_new_corrections + budget.max_merge_operations 以内
4.3 被截断的写入 skipped_count

Step 5: 提交
5.1 调 opc_corrections_upsert(batch=[...])，单次提交，server 内部按条幂等处理
5.2 拼 manifest_block markdown，结构：
    ### 教训提炼摘要 (distiller v1)
    - 新增 corrections: N 条
    - 合并 corrections: M 条
    - 跳过: K 条（原因: ...）
    - 重点新增:
      - <corr-id>: <lesson 前 80 字> (step=..., trigger=...)
      ...
5.3 返回 final JSON 给 reflection-server

【边界与禁令】
- 不要复述本提示词
- 不要超出 budget 上限
- 不要往 corrections 之外写任何文件
- 不要给 lesson 加修辞、感叹、个人观点——只陈述"在 X 条件下应当 Y，因为 Z"
- 不要为同一 user_text 生成多条 correction（一条物化一个教训）
- 任何调用失败 → 不要降级猜测，直接返回 {error, partial_stats}

【降级策略】
- 若 L1 为空（无 intervention、无 rounds_exceeded）：直接返回 stats 全 0、manifest_block = "本次 pipeline 无显著教训。"
- 若 opc_corrections_query 多次失败：跳过相似度匹配，全走 "create"，并在返回中标 degraded: "no_query_available"
- 若运行时长接近预算上限 90%：提前进 Step 5，剩余候选写入 skipped
```

---

## 六、合并策略细节

### 6.1 相似度计算公式

```
sim(candidate, L2) =
  0.5 * |kw(candidate) ∩ kw(L2)| / |kw(candidate) ∪ kw(L2)|
+ 0.3 * jaccard_tokens(lesson_candidate, lesson_L2)
+ 0.2 * applies_when_overlap

applies_when_overlap =
  (phase_id 集合 jaccard + modify_unit_pattern glob 相容性) / 2
```

阈值：
- `sim ≥ 0.72` → 合并
- `0.50 ≤ sim < 0.72` → 写 `_warnings` 提示人工 review，但仍按新建处理
- `sim < 0.50` → 新建，不警告

### 6.2 合并时 hotness 与 frozen 的处理

| 状态 | 行为 |
|---|---|
| L2.frozen = true | 仍 +1 hotness（用于统计），但**不**修改 lesson 内容 |
| L2.hotness 已达 `hotness_cap`（默认 50） | 不再 +1，但可更新 linked_interventions |
| L2.source = "seed" | 合并时把 source 升级为 "user"，表示该 seed 被现实印证 |

### 6.3 衰减（与 distiller 解耦）

distiller **不**做衰减——衰减由 reflection-server 后台 reaper 周期跑（详见 [03_expansion-controls.md 占位]）。distiller 只负责增量。

---

## 七、失败处理与可观测性

| 失败模式 | 行为 |
|---|---|
| Task spawn 失败（agent type not found） | reflection-server 重试 1 次；仍失败 → 写 `opc-logs/distiller/<pipeline-id>-spawn-error.json`，pipeline manifest 追加 `distiller_status: "spawn_failed"`，不阻塞 |
| distiller 运行超 budget.max_runtime_sec | reflection-server 通过 Task 超时 kill；distiller 已提交的 partial batch 保留；manifest 标 `distiller_status: "timeout"` 并附 partial stats |
| `opc_corrections_upsert` 失败（schema 校验） | distiller 收到 reject → 在自己返回里标 `errors: [...]`，已成功条目保留；reflection-server 不重跑 |
| distiller 返回 JSON 不合规 | reflection-server 标 `distiller_status: "malformed_output"`，把原始返回存证 `opc-logs/distiller/<pipeline-id>-raw.txt` |

**可观测指标**（写入 `opc-logs/distiller/metrics.jsonl`，每次 distill 一行）：

```json
{
  "pipeline_id": "...",
  "ts": "2026-06-10T12:34:56Z",
  "l1_intervention_count": 7,
  "l1_rounds_exceeded_count": 1,
  "new_count": 3,
  "merged_count": 4,
  "skipped_count": 1,
  "runtime_sec": 42,
  "status": "ok" | "timeout" | "spawn_failed" | "malformed_output" | "partial",
  "degraded_reasons": []
}
```

后续 meta-reflection 读这个 metrics.jsonl 统计 distiller 健康度。

---

## 八、与三层存储的接缝

| 层级 | 写入路径 | distiller 行为 |
|---|---|---|
| L1 | `.opc/sessions/<id>/flow-state.json#user_interventions[]` | **只读** |
| L1 | `opc-logs/reflection/*.json`（rounds_exceeded artifact） | **只读** |
| L2 | `.opc/corrections/<step>/<corr-id>.md` | **唯一写入者**（通过 `opc_corrections_upsert`） |
| L3 | `~/.opc/global-corrections.jsonl` | **不写**（仅用户通过 `opc_corrections_promote` 显式提升） |

---

## 九、与 reflection-flow 时序对接

参见 [04-reflection-flow/00_overview.md 三 用户介入处理](../04-reflection-flow/00_overview.md#三用户介入处理intervention--l1--l2) 时序图的 "② pipeline 结束归档" 段——本文档是该段中 `RS → A: 派 distiller sub-agent` 那一步的完整规范。

---

## 十、未决事项（v2 候选）

| # | 议题 | 说明 |
|---|---|---|
| 1 | 跨 pipeline 批处理 | 当前每个 pipeline 触发一次 distill；高频小 pipeline 场景下可考虑 N 个 pipeline 合并一次 distill |
| 2 | LLM-based 相似度 | 目前 keyword + jaccard，长期可换成 embedding cosine（需 knowledge-server 已有 embedding 基础设施） |
| 3 | 双向追溯 | corrections.md 当前只 link 反向到 intervention/artifact；正向（从 intervention 找 corrections）需要另建索引 |

---

## 十一、相关文档

- [00_overview.md](00_overview.md) — L1/L2/L3 三层与 distiller 流向总图
- [04-reflection-flow/00_overview.md](../04-reflection-flow/00_overview.md) — pipeline 结束归档时序
- [04-reflection-flow/06_call-sequence-contract.md](../04-reflection-flow/06_call-sequence-contract.md) — A3 闭环（rounds_exceeded → ask_user → distiller 输入）
- [06-host-contract/00_overview.md C3/C4](../../06-host-contract/00_overview.md#24-c3sub-agent-的-mcp-连接继承) — Task sub-agent + tools 白名单契约
