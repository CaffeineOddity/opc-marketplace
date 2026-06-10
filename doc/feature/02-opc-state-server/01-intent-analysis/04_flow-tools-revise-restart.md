# 流程工具 · 纠错与前置校验

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 纠错类工具

本篇覆盖 **1 个纠错合并工具 + 所有流程工具共享的前置校验逻辑**。原 `opc_flow_correct({action:"revise"})` / `opc_flow_correct({action:"restart"})` / `opc_flow_correct({action:"phase_reset"})` 3 个工具按 [07-tool-consolidation §2.1](../../07-tool-consolidation/00_overview.md#state-server-flow14--7) 折叠为 **`opc_flow_correct`** 一个工具，通过 `action` discriminator 分流；豁免规则统一（[§4.4](../../07-tool-consolidation/00_overview.md#44-豁免清单更新)：整个 `opc_flow_correct` 工具全部豁免 reflection-registry-guard / pending-question-guard）。

完整工具速览见 [入口与生命周期篇 流程工具总览](02_flow-tools-entry-lifecycle.md#流程工具总览m17g-后-7-工具)。

| 工具 | discriminator | 一句话职责 |
|------|------|----------|
| [`opc_flow_correct`](#opc_flow_correct) | `action: "revise"\|"restart"\|"phase_reset"` | 用户主动纠错（局部修订 / 步骤重做 / 阶段回退），豁免所有 guard |
| [工具调用前置校验](#工具调用前置校验) | — | owner.pid + current_step 校验，避免乱序 |

> Deprecated 别名：`opc_flow_correct({action:"revise"})` → `opc_flow_correct({action:"revise"})`；`opc_flow_correct({action:"restart"})` → `({action:"restart"})`；`opc_flow_correct({action:"phase_reset"})` → `({action:"phase_reset"})`。`opc_phase_adjust` **已删除**（详见 [07-tool-consolidation §2.1 state-server phase](../../07-tool-consolidation/00_overview.md#state-server-phase5--3)，被反思循环自我修正替代）。

---

## 三种"用户回灌入口"对比

容易混淆的三个回灌入口——根据**"谁先开口"**和**"在哪个流程位"**区分：

| 工具 | 谁先开口 | 适用场景 | 是否走 pending-question-guard | 是否清 pending_user_question |
|---|---|---|---|---|
| **`opc_flow_user_reply`**（[详见 03 步骤路由篇](03_flow-tools-step-routing.md#opc_flow_user_reply)） | **state-server 主动**（反思 rounds_exceeded 触发 ask_user） | A3 闭环：反思跑满轮数仍未收敛，state-server 写 `pending_user_question` 后等用户答 | ✅ 唯一登记口（豁免自身） | ✅ 是 |
| **`opc_flow_correct({action:"revise"})`** | **用户主动** | 用户在流程任意时刻发现累积参数错了，主动修改（如 "complexity 应该是 high"） | ❌ 豁免（用户纠错通道永远放行） | ❌ 否（即使有 pending question，revise 也不消费） |
| **`opc_flow_correct({action:"restart"})`** | **用户主动** | 用户要求重做某个步骤（如 "重新分析任务"） | ❌ 豁免（同上） | ❌ 否 |
| **`opc_flow_correct({action:"phase_reset"})`** | **用户主动** | 用户决定回退到某 phase 重新规划，丢弃后续 phase 产出 | ❌ 豁免（同上） | ❌ 否 |

**关键差别**：
- `opc_flow_user_reply` **只能在 state-server 问过之后用**——没有 `pending_user_question` 时调它会被 reject (`no_pending_question`)
- `opc_flow_correct`（任意 action）**任何时候都能用**，不受任何 guard 锁——用户随时可以纠错或重做
- 若同时存在 `pending_user_question` 与用户的主动 `opc_flow_correct`，**correct 不自动清 pending_user_question**——用户答完原问题再走 correct；或显式调 `opc_flow_lifecycle({action:"abort"})` 跑路。这是有意的隔离：避免用户答 X 时被反思的 Y 问题"截胡"

> 完整 A3 闭环契约（5 步流程 + 不变量 + 路由表 + 失败示例）见 [05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md 八·补](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#八补-ask_user-回灌闭环a3-契约)。

---

### opc_flow_correct

**职责**：用户主动纠错合并工具。`action` discriminator 决定走哪个分支：`revise` 局部修订 accumulated；`restart` 从指定步骤重做；`phase_reset` 回退到指定 phase。三个 action 共享同一豁免规则（[§4.4](../../07-tool-consolidation/00_overview.md#44-豁免清单更新)：整个工具全部豁免 reflection-registry-guard / pending-question-guard）。

**Schema**：

```typescript
{
  name: "opc_flow_correct",
  description: "用户主动纠错。action=revise 修改 accumulated 字段并按需自动回退到对应步骤；action=restart 从指定步骤重做并保留前置 accumulated；action=phase_reset 回退到指定 phase 并丢弃后续 phase 产出。整个工具豁免所有 guard——用户随时可以纠错。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: { action: { enum: ["revise", "restart", "phase_reset"] } },
    oneOf: [
      { properties: { action: {const: "revise"}, field: {type: "string"}, value: {} }, required: ["field", "value"] },
      { properties: { action: {const: "restart"}, from_step: {enum: ["intent_analysis", "task_analysis", "task_decomposition", "brief_generation"]}, additional_input: {type: "string"} }, required: ["from_step"] },
      { properties: { action: {const: "phase_reset"}, pipeline_id: {type: "string"}, sub_pipeline_id: {type: "string"}, target_phase: {type: "string"}, reason: {type: "string"} }, required: ["pipeline_id", "sub_pipeline_id", "target_phase"] }
    ]
  }
}
```

#### action=revise

**输入**：`{action: "revise", field, value}`

**行为**：

```
opc_flow_correct({action: "revise", field, value})
  → 校验 active=true 且 current_step ∈ [可修订步骤]
  → 修改 flow-state.json.accumulated[field] = value
  → 判定是否需要回溯：
      · complexity / suggested_phases 改动 →
          - 清空 analysis_result.phase_selection_rationale + analysis_evidence_ref
            （强制 Claude 重新给出理由 + 重跑 P2 反思）
          - 自动重新进入 task_analysis 步骤（不是 brief_generation——因为 phase_plan
            重新校验失败时无法生成有效 brief）
      · scenario / tags 改动 → 仅记录，不回溯（影响后续 phase_start 的 scenario 推荐）
      · knowledge_unit 改动 → 强制回到 task_analysis 重做（影响 unit modify_count
        + phase_plan 重算）
  → 返回 { revised_field, retroactive_step?: <要回到的步骤>,
           cleared_evidence_refs?: [...], next: {...} }
```

#### action=restart

**输入**：`{action: "restart", from_step, additional_input?: string}`

**行为**：

```
opc_flow_correct({action: "restart", from_step, additional_input?})
  → 校验 active=true 且 from_step ∈ ["intent_analysis", "task_analysis",
                                      "task_decomposition", "brief_generation"]
  → 回退 flow-state.json:
      · current_step = from_step
      · accumulated 中保留 < from_step 的字段，清除 ≥ from_step 的字段
      · 把 additional_input（如有）追加到 user_message_history
  → 返回该步骤的指令（含 methodology + schema + next: opc_flow_step_complete({step: from_step})）
  → 反思日志保留作为审计（不清除）
```

#### action=phase_reset

**输入**：`{action: "phase_reset", pipeline_id, sub_pipeline_id, target_phase, reason?}`

**行为**：

```
opc_flow_correct({action: "phase_reset", pipeline_id, sub_pipeline_id, target_phase, reason?})
  → 校验 active=true 且 pipeline 状态允许回退
  → state-server 内部级联：
      · pipeline_id + sub_pipeline_id 命中的 sub-pipeline 回退到 target_phase
      · 走 git checkout + 版本号 +1（不快照倒退，保持线性可审计）—— 与
        [phase_reset & sub-pipeline insertion](../../05-opc-reflection-server/04-reflection-flow/05_phase-reset-interaction.md)
        策略一致
      · 该 phase 之后的所有 phase / node 状态清零，artifacts 移到 opc-logs/discarded/
  → 写 L1 user_interventions[]:
      {trigger: "user_phase_reset", pipeline_id, sub_pipeline_id, target_phase, reason, at: now}
  → 返回 {
      reset: true,
      pipeline_id, sub_pipeline_id, reset_to_phase: target_phase,
      next: {tool: "opc_phase_start", args: {pipeline_id, sub_pipeline_id, phase: target_phase}}
    }
```

> **`opc_phase_adjust` 已删除**：原"运行中调整 phase 配置"的语义被反思循环自我修正替代，详见 [03-phase/04_phase-start.md:182](../03-phase/04_phase-start.md)。如需运行时增删 node / phase，走 `opc_pipeline_lifecycle({action: "replan"})`。

---

### 工具调用前置校验

每个流程工具调用前都强制校验 `flow-state.json.current_step` 是否匹配预期，避免 Claude 乱序调用：

```
任意流程工具调用（含 opc_flow_step_complete / opc_flow_lifecycle 等）:
  → 读 flow-state.json
  → 校验 owner.pid == 当前 pid（防跨 session 误操作）
  → 校验 current_step ∈ expected_steps（该工具+discriminator 允许的前置步骤集）
    若否 → 返回:
      {
        error: "flow_state_mismatch",
        expected_step: ["..."],
        actual_step: "...",
        suggested_action: "调 opc_flow_query 查看当前位置"
      }
  → 更新 last_heartbeat_at
  → 正常处理
```

每个工具的 `expected_steps`（按 `(tool, discriminator_value)` 对查询）见 `prompts/state-machine.md`（路由表实现规范）。**例外**：`opc_flow_correct`（任意 action）跳过 `expected_steps` 校验——用户主动纠错通道不受步骤约束。

---

## 相关文档

- [02_flow-tools-entry-lifecycle.md](02_flow-tools-entry-lifecycle.md) — 入口（`opc_flow_query`）+ 生命周期（`opc_flow_lifecycle`）
- [03_flow-tools-step-routing.md](03_flow-tools-step-routing.md) — 步骤推进类工具（`opc_flow_step_complete` 等）
- [10_flow-state-schema.md](10_flow-state-schema.md) — flow-state.json 字段定义（accumulated 字段说明）
- [07-tool-consolidation/00_overview.md](../../07-tool-consolidation/00_overview.md#44-豁免清单更新) — `opc_flow_correct` 整体豁免规则
