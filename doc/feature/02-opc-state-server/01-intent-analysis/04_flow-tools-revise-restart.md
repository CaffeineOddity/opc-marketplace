# 流程工具 · 修订与重启

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 修订/重启类工具

本篇覆盖 **2 个纠错类工具 + 所有流程工具共享的前置校验逻辑**。完整工具速览见 [入口与生命周期篇 §流程工具总览](02_flow-tools-entry-lifecycle.md#流程工具总览)。

| 工具 | 一句话职责 |
|------|----------|
| [`opc_flow_revise`](#opc_flow_revise) | 局部修订 accumulated 字段，自动判定是否回溯 |
| [`opc_flow_restart`](#opc_flow_restart) | 从指定步骤重做，保留前置 accumulated，可附补充输入 |
| [工具调用前置校验](#工具调用前置校验) | owner.pid + current_step 校验，避免乱序 |

---

### opc_flow_revise

**职责**：局部修订 accumulated 字段，自动判定是否需要回溯到对应步骤重做。

**输入**：`{field, value}`

**行为**：

```
opc_flow_revise({field, value})
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

---

### opc_flow_restart

**职责**：从指定步骤重做，保留前置 accumulated 字段，可附加补充输入。

**输入**：`{from_step, additional_input?: string}`

**行为**：

```
opc_flow_restart({from_step, additional_input?})
  → 校验 active=true 且 from_step ∈ ["intent_analysis", "task_analysis",
                                      "task_decomposition", "brief_generation"]
  → 回退 flow-state.json:
      · current_step = from_step
      · accumulated 中保留 < from_step 的字段，清除 ≥ from_step 的字段
      · 把 additional_input（如有）追加到 user_message_history
  → 返回该步骤的指令（含 methodology + schema + next）
  → 反思日志保留作为审计（不清除）
```

---

### 工具调用前置校验

每个流程工具调用前都强制校验 `flow-state.json.current_step` 是否匹配预期，避免 Claude 乱序调用：

```
任意流程工具调用:
  → 读 flow-state.json
  → 校验 owner.pid == 当前 pid（防跨 session 误操作）
  → 校验 current_step ∈ expected_steps（该工具允许的前置步骤集）
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

每个工具的 `expected_steps` 见 `prompts/state-machine.md`（路由表实现规范）。

---

## 相关文档

- [02_flow-tools-entry-lifecycle.md](02_flow-tools-entry-lifecycle.md) — 入口/启动/终结/恢复
- [03_flow-tools-step-routing.md](03_flow-tools-step-routing.md) — 步骤推进类工具
- [10_flow-state-schema.md](10_flow-state-schema.md) — flow-state.json 字段定义（accumulated 字段说明）
