# 03 — 介入归档链（L1 → L2 → L3）

> 本章展开 `00_overview.md` §三的完整归档链路：从用户介入事件到 L1 原始记录，
> 经 distiller sub-agent 提炼到 L2 项目纠正库，再到用户晋升到 L3 全局教训。
> 包含 distiller 提示词模板、合并策略、以及归档时机。

## 一、归档链路总览

```
用户介入（任意时刻）
    │
    ▼
L1 实时写入：flow-state.json → user_interventions[]
    │  trigger: ask_user_rounds_exceeded | user_initiated
    │  含 user_text、field_changes、linked_reflection_artifacts、linked_corrections
    │
    ▼  pipeline_complete 触发
opc_reflect_admin({action:"record_interventions"})
    │
    ▼
distiller sub-agent 启动
    │
    ├── ① 读取 L1 user_interventions[]
    ├── ② 按 step 分组
    ├── ③ 逐条提炼：提取失败模式 + 纠正建议 + keywords
    ├── ④ opc_corrections({action:"query"}) 查相似条目
    │       ├── 相似度 > SIM_THRESH → 合并 (hotness+1)
    │       └── 不相似 → 新建 L2 条目
    ├── ⑤ 写 L2（opc-memory/corrections/）
    └── ⑥ 返回 distiller manifest
            │
            ▼ （用户手动操作，可选）
        opc_corrections({action:"promote", id:"corr-xxx"})
            │
            ▼
        L3: ~/.opc/global-corrections.jsonl
```

## 二、L1 — 实时介入记录

### 2.1 写入时机与来源

| 来源 | 写入者 | trigger 值 | 丰富度 |
|---|---|---|---|
| A3 闭环：reflection rounds 耗尽 → state-server 发 ask_user → 用户回复 | state-server 内部 | `ask_user_rounds_exceeded` | 高（附带 `linked_reflection_artifacts`）|
| 用户主动调 `opc_flow_correct` | state-server 内部 | `user_initiated` | 低（只有 field_changes，无反思上下文）|
| 用户主动调 `opc_pipeline_lifecycle({action:"replan"})` | state-server 内部 | `user_initiated` | 低（仅含 replan 意图）|

### 2.2 L1 条目结构

```json
{
  "id": "ui-<ulid>",
  "pipeline_id": "pl-<ulid>",
  "step": "P1..P8",
  "phase": "03-design | 04-implement-design | ...",
  "node_id": "<node_id> | null",
  "trigger": "ask_user_rounds_exceeded | user_initiated",
  "action": "restart | revise | phase_reset | abort | replan | knowledge_update",
  "user_text": "<用户原始输入>",
  "field_changes": { "<field>": "<value>" },
  "resolved_by": "flow_correct | lifecycle | user_reply | skip",
  "recorded_at": "<ISO 8601>",
  "linked_reflection_artifacts": ["opc-logs/reflection/..."],
  "linked_corrections": ["corr-<ulid>"]
}
```

### 2.3 生命周期

- **写入**：用户介入事件发生时由 state-server 实时追加
- **读取**：distiller 在 pipeline 完成时读取
- **保留**：pipeline 结束后随 flow-state.json 快照归档，7 天后可清理

## 三、Distiller Sub-Agent

### 3.1 触发时机

```
opc_pipeline_lifecycle({action:"complete"})
    │
    ▼
state-server 返回 flow_next: opc_reflect_admin({action:"record_interventions"})
    │
    ▼
Host 调用 opc_reflect_admin({action:"record_interventions", pipeline_id})
    │
    ▼
reflection-server 派 distiller sub-agent
```

distiller 是 pipeline 级 agent（非 per-step），每个 pipeline 结束时运行一次。

### 3.2 Distiller 提示词模板

```
你是 OPC distiller。请从以下用户介入记录中提炼可复用的纠正条目。

## Pipeline 上下文
- pipeline_id: {pipeline_id}
- 总介入次数: {intervention_count}
- pipeline 类型: {pipeline_type}
- 复杂度: {complexity}

## 用户介入记录（L1）
{逐条 user_interventions，含 user_text、step、trigger、linked_reflection_artifacts}

## 提炼要求

对每条介入记录：
1. 提取「失败模式」：用户纠正的是什么问题？用一句话精炼描述。
2. 提取「纠正建议」：如何避免这个问题？给出具体可操作的建议。
3. 提取 keywords[]：3-5 个用于检索的关键字。
4. 确定 step：该纠正关联的 reflection point（P1-P8）。
5. 确定 unit/section/subsection：按三层模型归类。

对多条相关的介入记录：
- 如果 2+ 条介入指向同一类问题 → 合并为一条 L2 条目
- 如果某条介入太模糊（无法提炼出具体建议）→ 跳过并记录日志

## 输出格式

对每条提炼结果，返回：
{
  "action": "create | merge | skip",
  "step": "P1..P8",
  "unit": "<unit>",
  "section": "<section>",
  "subsection": "<subsection>",
  "title": "<简短标题>",
  "failure_pattern": "<失败模式>",
  "correction_advice": "<纠正建议>",
  "reflection_snippet": "<反思 prompt 增强片段>",
  "keywords": ["kw1", "kw2"],
  "source_intervention_ids": ["ui-xxx"],
  "skip_reason": "<跳过原因> | null",
  "merge_target_id": "corr-xxx | null"
}
```

### 3.3 合并策略

distiller 在写 L2 前必须先查询现有 L2：

```
对每条提炼结果:
    step_keywords = extract_keywords(user_text)
    existing = opc_corrections({action:"query", step, keywords: step_keywords})

    if existing 非空:
        similarity = compute_similarity(新条目, existing)
        if similarity > SIM_THRESH:
            opc_corrections({action:"record", merge_with: existing.id})
            // hotness += 1, updated_at = now
            // body 追加 "## 补充案例\n<新 case>"
        else:
            opc_corrections({action:"record", ...})  // 新建
    else:
        opc_corrections({action:"record", ...})      // 新建
```

### 3.4 优先级处理

distiller 优先处理 `trigger: "ask_user_rounds_exceeded"` 的介入记录，
因为这类记录附带 `linked_reflection_artifacts`（指向 N 轮反思 artifact 路径），
上下文丰富度远高于纯用户主动纠错，提炼为 corrections 后命中率与召回率更高。

处理顺序：
1. 先处理所有 `trigger=ask_user_rounds_exceeded` 的条目
2. 再处理 `trigger=user_initiated` 的条目
3. 同类问题在后处理时发现与前序结果相似 → 合并

### 3.5 Distiller Manifest

distiller 完成后返回 manifest：

```json
{
  "pipeline_id": "pl-<ulid>",
  "interventions_total": 5,
  "interventions_processed": 5,
  "distilled": {
    "created": 2,
    "merged": 1,
    "skipped": 2
  },
  "skipped_reasons": {
    "too_vague": 1,
    "no_actionable_advice": 1
  },
  "new_corrections": [
    { "id": "corr-new1", "title": "...", "step": "P3" },
    { "id": "corr-new2", "title": "...", "step": "P5" }
  ],
  "merged_corrections": [
    { "id": "corr-existing", "hotness_after": 8 }
  ]
}
```

## 四、L2 — 项目纠正库写入

### 4.1 目录结构自动创建

distiller 按三层模型自动创建目录：

```
opc-memory/corrections/
  <unit>/               # distiller 自动创建
    <section>/           # distiller 自动创建
      <subsection>.md    # distiller 写入
```

无需手动创建目录，distiller 在写入前 `mkdir -p`。

### 4.2 写入内容

每个 `.md` 文件包含 YAML frontmatter + Markdown body，完整 schema 见
[03-corrections-store/01_storage-layers.md](../03-corrections-store/01_storage-layers.md#三l2--项目级纠正库)。

### 4.3 索引更新

每次写入后自动重建 `.opc-memory.idx`（全文搜索索引），
确保 `opc_corrections({action:"query"})` 能立即命中新条目。

## 五、L3 — 用户晋升到全局

### 5.1 晋升条件

用户判断某条 L2 纠正适用于所有项目时：

```
opc_corrections({action:"promote", id:"corr-xxx"})
```

晋升前可预览脱敏后的内容：

```
opc_corrections({action:"promote", id:"corr-xxx", preview: true})
→ 返回脱敏预览，用户确认后再执行 promote
```

### 5.2 脱敏处理

distiller（或独立的 desensitizer）执行：

| 原始内容 | 脱敏后 |
|---|---|
| 项目名 "my-saas-app" | `<project>` |
| 文件路径 "/home/user/projects/my-app/src/auth.ts" | `<workspace>/src/auth.ts` |
| API key / token | `<redacted>` |
| 公司名 / 用户名 | `<org>` / `<user>` |

脱敏后写入 `~/.opc/global-corrections.jsonl`：

```json
{
  "id": "global-<ulid>",
  "promoted_from": "corr-xxx",
  "promoted_at": "<ISO 8601>",
  "lesson_text": "<脱敏后的通用教训>",
  "source_projects": 1,
  "keywords": ["..."]
}
```

### 5.3 L3 回注（冷启动）

新项目创建时，L3 条目作为 seed 注入 L2，详见
[03-corrections-store/04_seed-corrections.md](../03-corrections-store/04_seed-corrections.md)。

## 六、归档时机与幂等性

### 6.1 归档时机

| 事件 | 动作 |
|---|---|
| `opc_pipeline_lifecycle({action:"complete"})` | state-server 返回 `flow_next: opc_reflect_admin({action:"record_interventions"})` |
| 用户手动触发 | `opc_reflect_admin({action:"record_interventions", pipeline_id})` 可在 pipeline 完成后任意时刻调用 |

### 6.2 幂等性

distiller 处理是幂等的：同一 pipeline 重复调用 `record_interventions` 不会产生重复条目。
实现方式：

```
对每条 user_intervention:
    检查 L2 中是否已有 source_intervention_id 引用该 L1 条目
    ├── 已存在 → 跳过（不重复提炼）
    └── 不存在 → 正常提炼
```

### 6.3 部分成功

若 distiller 在处理中途失败（sub-agent 超时等），已写入的 L2 条目不回滚。
重新调用 `record_interventions` 时，未处理的 L1 条目继续提炼，
已处理的跳过（幂等性保证）。

## 七、相关文档

- [01 存储层定义](../03-corrections-store/01_storage-layers.md) — L1/L2/L3 完整 schema
- [04 Seed Corrections](../03-corrections-store/04_seed-corrections.md) — L3→L2 冷启动注入
- [05 Distiller Agent](../03-corrections-store/05_distiller-agent.md) — distiller 完整实现规范
- [02 用户自治](./02_user-autonomy.md) — 用户如何控制介入与反思
- [父文档](./00_overview.md) — 介入归档在反思流程中的位置
