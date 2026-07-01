# 01 — L1 / L2 / L3 存储层完整定义

> 本章展开 `00_overview.md` §一的 L1/L2/L3 三层存储架构，
> 包括各层的完整 schema、字段映射关系、写入路径、查询路由、
> 以及 L1→L2→L3 升级链的详细时序。

## 一、三层总览

```
L1  (pipeline scope)   flow-state.json → user_interventions[]
     ↓  pipeline_complete 触发
     ↓  distiller sub-agent 提炼
L2  (project scope)    .opc/memory/corrections/ → .md 文件
     ↓  用户手动晋升 (opc_corrections action:promote)
L3  (global scope)     ~/.opc/global-corrections.jsonl
```

## 二、L1 — Pipeline 级原始流水

### 2.1 存储位置

`<workspace>/.opc/state/flow-state.json`

### 2.2 Schema

```json
{
  "flow_state": {
    "user_interventions": [
      {
        "id": "ui-<ulid>",
        "pipeline_id": "<pipeline_id>",
        "step": "P1 | P2 | ... | P8",
        "phase": "03-design | 04-implement-design | ...",
        "node_id": "<node_id> | null",
        "trigger": "ask_user_rounds_exceeded | user_initiated",
        "action": "restart | revise | phase_reset | abort | replan | knowledge_update",
        "user_text": "<用户原始输入>",
        "field_changes": { "<field>": "<value>" },
        "resolved_by": "flow_correct | lifecycle | user_reply | skip",
        "recorded_at": "<ISO 8601>",
        "linked_reflection_artifacts": ["<path>"],
        "linked_corrections": ["corr-<ulid>"]
      }
    ]
  }
}
```

### 2.3 两类 trigger

| trigger | 来源 | 典型场景 | 丰富度 |
|---|---|---|---|
| `ask_user_rounds_exceeded` | A3 闭环：reflection rounds 耗尽后 state-server 发 `ask_user`，用户回复 | "这不是任务"、"还要加用户权限" | 高（附带 `linked_reflection_artifacts` 指向 N 轮反思 artifact） |
| `user_initiated` | 用户主动调用 `opc_flow_correct` / `opc_pipeline_lifecycle({action:"replan"})` | 用户主动 revise/restart/phase_reset | 低（只有 field_changes，无反思上下文） |

### 2.4 生命周期

- 写入：每次用户介入事件发生时由 state-server 追加
- 读取：`opc_reflect_admin({action:"record_interventions"})` 在 pipeline 完成时触发提炼
- 保留：pipeline 结束后随 flow-state.json 快照归档

## 三、L2 — 项目级纠正库

### 3.1 存储位置

`<workspace>/.opc/memory/corrections/`

### 3.2 目录布局

```
.opc/memory/corrections/
  <step-unit>/           # 如 intent-analysis
    <section>/            # 如 task-vs-chat
      <subsection>.md     # 如 ambiguous-question.md
  .opc-memory.idx         # 全文搜索索引
```

### 3.3 文件 Schema

每个 `.md` 文件使用 YAML frontmatter + Markdown body：

```yaml
---
id: corr-<ulid>
type: correction | lesson
step: P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8
unit: <step-unit>
section: <section-name>
subsection: <subsection-name>
hotness: 12
frozen: false
source: user | distiller | reflexion | seed
created_at: "2026-06-11T00:00:00Z"
updated_at: "2026-06-11T00:00:00Z"
schema_version: 2
related: [corr-xxx, corr-yyy]
keywords: [agent, ambiguous, single-question]
applies_when:
  - step: P1
  - intent_signals_contains: ["问句无动作"]
deprecated_by: null
---
```

### 3.4 字段详细说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | ULID 唯一标识 |
| `type` | enum | 是 | `correction`（纠正已知错误）或 `lesson`（一般性原则） |
| `step` | enum | 是 | 关联的 reflection point |
| `unit/section/subsection` | string | 是 | 三层目录路径（对应文件系统路径） |
| `hotness` | integer | 是 | 命中次数，每次 +1，每周 ×0.9 衰减 |
| `frozen` | boolean | 是 | `true` 时停止注入但保留可查 |
| `source` | enum | 是 | 来源：`user`（L1 用户介入）、`distiller`（提炼）、`reflexion`（反思发现）、`seed`（冷启动） |
| `schema_version` | integer | 是 | 用于向前兼容升级 |
| `keywords` | string[] | 是 | 用于相似度匹配和全文搜索 |
| `applies_when` | object[] | 否 | TS 可判定的注入条件 |
| `deprecated_by` | string\|null | 否 | 若被新纠正替代，指向新 ID |
| `related` | string[] | 否 | 关联的其他纠正条目 |

### 3.5 Markdown Body 结构

```markdown
# <标题>

## 失败模式
<原始用户介入或反思 objection 的精炼描述>

## 纠正建议
<如何避免/修正，具体可操作>

## 反思 prompt 增强片段
> 当 step={step} 且匹配 keywords 时注入 enhanced_prompt

## 证据 / 原文链接
- L1 source: flow-state.json#user_interventions[3]
- pipeline-id: ...
```

## 四、L3 — 全局通用教训

### 4.1 存储位置

`~/.opc/global-corrections.jsonl`

### 4.2 Schema（每行一条 JSON）

```json
{
  "id": "global-<ulid>",
  "type": "correction | lesson",
  "step": "P3",
  "keywords": ["decomposition", "tight-coupling"],
  "hotness": 5,
  "source_projects": 3,
  "lesson_text": "<脱敏后的通用教训>",
  "applies_when": { "step": "P3", "min_complexity": "medium" },
  "created_at": "2026-06-11T00:00:00Z",
  "promoted_from": "corr-<ulid>",
  "promoted_at": "2026-06-11T00:00:00Z"
}
```

### 4.3 晋升条件

- 用户在 L2 条目上显式标记"通用"→ 触发 `opc_corrections({action:"promote", id:"corr-xxx"})`
- 自动脱敏：替换项目名、文件名等敏感信息为占位符
- L3 条目在 cold-start 时作为 seed 注入新项目

### 4.4 生命周期

- L3 条目不自动过期（由 OPC 维护者或用户手动管理）
- `source_projects` ≥ 5 时，条目被认为"广泛适用"→ 优先注入
- 可手动 `opc_corrections({action:"unlearn"})` 在全局级别屏蔽

## 五、L1→L2→L3 升级时序

```
pipeline_complete
    │
    ▼
opc_reflect_admin({action:"record_interventions"})
    │
    ▼
distiller sub-agent 启动
    │
    ├── 读取 L1 user_interventions[]
    ├── 按 step 分组
    ├── 逐条提炼为 L2 条目
    │       ├── query 现有 L2 by step+keywords
    │       ├── 相似 → merge (hotness+1)
    │       └── 非相似 → new
    └── 写入 L2
            │
            ▼ (用户手动操作)
        opc_corrections({action:"promote"})
            │
            ▼
        L3 (~/.opc/global-corrections.jsonl)
            │
            ▼ (新项目 cold-start)
        Seed 注入到新 workspace
```

## 六、查询路由

| 查询来源 | 查询目标 | 路由 |
|---|---|---|
| `opc_reflect_plan` 注入教训 | step-related corrections | L2 (primary) + L3 (补充，若无 L2 条目) |
| `opc_corrections({action:"query"})` | 用户指定查询 | L2 (默认) 或 L2+L3 (all=true) |
| `opc_reflect_admin({action:"record_interventions"})` | 写入新纠正 | L2 only (distiller) |
| `opc_corrections({action:"promote"})` | 晋升到 L3 | L2→L3 |
| Cold-start 初始化 | 初始教训库 | L3→L2 (seed 注入) |

## 七、相关文档

- [02 Schema 与演化](./02_schema-and-evolution.md) — schema_version 演化规则
- [03 膨胀控制](./03_expansion-controls.md) — C1–C4 防膨胀策略
- [04 Seed Corrections](./04_seed-corrections.md) — 冷启动 seed 库
- [父文档](./00_overview.md) — corrections 存储总览
