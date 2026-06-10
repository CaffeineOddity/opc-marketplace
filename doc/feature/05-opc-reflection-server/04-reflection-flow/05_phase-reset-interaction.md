# 05 — 与 phase_reset 的交互

> 本章定义 `opc_flow_correct({action:"phase_reset"})` 与反思状态的边界：
> 各回退层级如何影响 reflection_log、pending_reflection、corrections、
> 以及回退后反思重新执行的行为。

## 一、核心原则

**反思状态只追加、不回滚**。phase_reset 会回退 pipeline 状态（phase/node），
但反思日志、纠正条目、pending_reflection 的处理遵循"保留证据、重做反思"原则，
不删除任何历史反思记录。

理由：
- 教训不可丢失：一次有价值的 objection 即使所在 phase 被回退，仍应可查
- 审计可追溯：reflection_log 是完整审计链，删改会破坏可解释性
- 纠正不应回滚：corrections 是知识沉淀，与 phase 状态解耦

## 二、回退层级与反思状态处理

### 2.1 L0 — 仅当前 phase

```
opc_flow_correct({action:"phase_reset", level: "L0"})
```

| 维度 | 处理 |
|---|---|
| 当前 phase 的 reflection_log | 保留。新增条目继续追加到同 phase 的 log |
| pending_reflection | 若存在 → 失效（phase 状态已回退，旧 pending 已无意义）。清理前写 `status: expired_due_to_phase_reset` |
| corrections（L2）| 不受影响 |
| corrections（L1 user_interventions）| 保留 |
| 新一轮反思 | 从头开始（plan → execute → complete），不参考旧 reflection_log（状态不同，旧日志无参考价值）|

### 2.2 L1 — 当前 + 下游 phase

```
opc_flow_correct({action:"phase_reset", level: "L1"})
```

| 维度 | 处理 |
|---|---|
| 当前及下游 phase 的 reflection_log | 保留。标记 `superseded: true` |
| pending_reflection | 全部失效（状态已回退，旧 pending 无意义）。清理前写 `status: expired_due_to_phase_reset` |
| corrections（L2）| 不受影响 |
| meta-reflection pipeline 日志 | 若 pipeline 未完成则无；若已完成则保留 |
| 新一轮反思 | 重新执行所有被回退 phase 的 per-step 反思 |

### 2.3 L2 — 跨 sub-pipeline 下游

```
opc_flow_correct({action:"phase_reset", level: "L2"})
```

反射状态处理同 L1。额外影响：
- 涉及多个 sub-pipeline 时，各 sub 的 reflection_log 分别标记 `superseded: true`
- 跨 sub 的 corrections 不受影响（corrections 是项目级的，不按 sub 隔离）

### 2.4 L3 — 整个 pipeline

```
opc_flow_correct({action:"phase_reset", level: "L3"})
```

| 维度 | 处理 |
|---|---|
| 整个 pipeline 的 reflection_log | 全部保留，标记 `superseded: true` |
| pending_reflection | 全部失效（状态已回退，旧 pending 无意义）。清理前写 `status: expired_due_to_phase_reset` |
| user_interventions[]（L1）| 保留。不随 pipeline 回退而删除 |
| corrections（L2）| 不受影响 |
| 新一轮反思 | 从 P1 开始全部重新执行。先前积累的 corrections 可被新反思注入（历史教训用于新回合）|

## 三、Pending Reflection 的失效处理

### 3.1 失效流程

```
opc_flow_correct({action:"phase_reset"})
    │
    ├── ① 检查 flow_state.pending_reflections[]
    ├── ② 对每个 pending:
    │       ├── 写 reflection_log 条目：
    │       │   { verdict: "expired_due_to_phase_reset",
    │       │     reflection_id: "<原 id>",
    │       │     artifact_path: "<原路径>" }
    │       └── 从 pending_reflections[] 移除
    └── ③ 执行 phase 状态回退
```

### 3.2 已写盘的 Artifact

phase_reset 不清除已写盘的 `opc-logs/reflection/<session_id>/<reflection_id>.json`。
文件保留在磁盘上供审计，7 天后由日志清理策略移除。

## 四、Corrections 的跨回退持久性

### 4.1 不回滚原则

corrections 存储在 `opc-memory/corrections/`，与 `flow-state.json` 物理隔离。
phase_reset 操作 flow-state.json 中的 phase/node 状态，
不触及 corrections 文件。

### 4.2 回退后反思的 corrections 注入

新反思执行时，`opc_reflect_plan` 查询 corrections：

```
opc_reflect_plan({step: "P3", ...})
    │
    ├── opc_corrections({action:"query", step: "P3"})
    │       └── 返回所有 P3 的活跃条目（含回退前产生的条目）
    └── 拼入 enhanced_prompt
```

这意味着：第一次尝试中产生的纠正，在回退后的第二次尝试中就能被注入。
**反思质量随回退迭代提升**——历史教训立即生效。

### 4.3 重复矫正的防护

若回退后同一问题再次被 distiller 提炼为 L2 条目，C1 合并策略（相似度检测）
会将其合并到已有条目，hotness +1，不会重复创建。

## 五、Reflection Log 的标记规范

### 5.1 superseded 标记

```json
{
  "reflection_id": "rfl-P5-r2-01HXY8",
  "step": "P5",
  "method": "M4-critique",
  "verdict": "objections_remain",
  "superseded": true,
  "superseded_by": "phase_reset_L1",
  "superseded_at": "2026-06-11T10:00:00Z"
}
```

### 5.2 查询时过滤

`opc_reflect_admin({action:"explain"})` 默认过滤 `superseded: true` 的条目。
传 `include_superseded: true` 可查看完整历史。

## 六、回退决策中的反思角色

### 6.1 P8 回退决策

P8（阶段推进）的 M4 Critique + M5 Debate 本身就负责判断"该推进还是回退"。
当 debate 结论为 `con` 或 `inconclusive` 时，建议 phase_reset。

详见 [01-method-theory/02_step-method-mapping.md](../01-method-theory/02_step-method-mapping.md#p8--阶段推进)。

### 6.2 用户否决反思建议的回退

```
用户选择回退 ← ask_user 给出回退建议
    但 reflection 结论为 "clean"（建议推进）
    
→ 回退生效，reflection_log 追加 note: "user_overrode: phase_reset despite clean verdict"
→ 后续可查询"用户否决反思建议"的统计
```

## 七、相关文档

- [00 反思流程总览](./00_overview.md) — 回退交互在整体时序中的位置
- [02 用户自治](./02_user-autonomy.md) — skip/on_demand 与 phase_reset 的配合
- [03 介入归档](./03_intervention-archival.md) — 回退后 L1 条目的处理
- [02-state-server/03-phase](../../02-opc-state-server/03-phase/00_overview.md) — phase_reset 的 state-server 侧实现
- [父文档 五](./00_overview.md#五与-opc_flow_correctactionphase_reset-的交互) — 回退交互总览
