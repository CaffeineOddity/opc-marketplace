# 11 反思未登记 → registry-guard 拒绝（负向测试）

> 本文档是 [test 总览](00_overview.md) 的子文档。覆盖 [reflection-registry-guard](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#防御-3reflection-registry-guard工程层) 的拦截行为：P5 反思 artifact 已写盘但 Claude 跳过 `opc_flow_reflect` 登记，直接调 `opc_phase_confirm` 应被强制返回 `pending_reflection_unregistered` 错误码。

---

**输入**：（场景接力 [04_medium-single.md](04_medium-single.md)，跑到 `opc_phase_start("05-implement")` 后的 P5 节点选择反思）

**测试意图**：验证三层防御中的工程层（防御 3）是兜底拦截，不依赖 Claude 自觉。Claude 即使被引导跳过登记，guard 也必须 reject。

---

## 调用链路

```
[01] Claude → opc_phase_start("05-implement")
            ← 候选: [tdd-implementation, backend-endpoint, security-review]
              + reflection_budget_hint{max_rounds: 3}
              + flow_next: opc_reflect_execute({step:"node_selection"})

[02] Claude → opc_reflect_execute({
              step:"node_selection", method:"M4-critique", inline:true,
              artifact:{selection_evidence}
            })
            内部:
              · opc_reflect_plan 选 M4-critique
              · Task spawn critic agent
              · meta-validator 保留 1 条 objection: "backend-endpoint 与 auth 节点文件域冲突"
              · 写盘 opc-logs/reflection/sess-xyz/rfl-P5-r1-01HXY8.json
            ← {
                verdict: "objections_remain",
                kept_objections: [{id:"obj-1", text:"backend-endpoint 冲突", evidence_ref:"..."}],
                next_step_hint: {
                  suggestion: "调 opc_flow_reflect 登记本轮反思",
                  suggested_tool: "opc_flow_reflect",
                  suggested_args: { reflection_id: "rfl-P5-r1-01HXY8" }
                },
                pending_reflection: {
                  reflection_id: "rfl-P5-r1-01HXY8",
                  artifact_path: "opc-logs/reflection/sess-xyz/rfl-P5-r1-01HXY8.json",
                  expires_at: "...",
                  must_be_registered_by: "opc_flow_reflect"
                }
              }
            （state-server 收到回值后写入 flow-state.pending_reflections[0]）

[03] ⚠️ Claude 误判（或被恶意提示）跳过 opc_flow_reflect → 直接调 opc_phase_confirm
     Claude → opc_phase_confirm({pipeline_id, sub_pipeline_id:"sub-1", phase:"05-implement",
                                 selected_nodes:["tdd-implementation","backend-endpoint","security-review"]})

[04] state-server 入口 reflection-registry-guard 拦截:
       checkPendingReflection(flowState, "opc_phase_confirm")
       → flow_state.pending_reflections.length == 1
       → callerTool ("opc_phase_confirm") !== pending.must_be_registered_by ("opc_flow_reflect")
       → throw

     ← 返回（HTTP 400 等价于工具错误）:
        {
          error: "pending_reflection_unregistered",
          code: "PENDING_REFLECTION",
          message: "存在未登记的反思记录，无法调用 opc_phase_confirm",
          pending_reflection_id: "rfl-P5-r1-01HXY8",
          pending_artifact_path: "opc-logs/reflection/sess-xyz/rfl-P5-r1-01HXY8.json",
          pending_step_id: "node_selection",
          required_action: {
            tool: "opc_flow_reflect",
            args: { reflection_id: "rfl-P5-r1-01HXY8" },
            why: "先登记反思记录，再推进流程"
          }
        }

[05] Claude 收到错误码 → 按 required_action 补登记
     Claude → opc_flow_reflect({reflection_id: "rfl-P5-r1-01HXY8"})
            state-server:
              1. 校验 reflection_id ∈ pending_reflections[] ✓
              2. 读 artifact_path 验证文件存在 ✓
              3. 追加到 flow-state.reflection_log[] {reflection_id, artifact_path, verdict, registered_at}
              4. 从 pending_reflections[] 移除（length=0）
              5. verdict=objections_remain 且 round=1 < max_rounds=3
              → flow_next: opc_reflect_execute（再跑 1 轮处理 objection-1）
            ← { flow_next: {tool:"opc_reflect_execute", args:{step:"node_selection", method:"M4-critique", inline:true, artifact:{修正后 evidence}}} }

[06] Claude 调整 selection_evidence（移除 backend-endpoint）
     Claude → opc_reflect_execute(...) → verdict=clean → pending_reflection rfl-P5-r2-01HXY9
     Claude → opc_flow_reflect({reflection_id: "rfl-P5-r2-01HXY9"})
            → flow_next: opc_phase_confirm

[07] Claude → opc_phase_confirm({...修正后的 selected_nodes...})
            guard 校验: pending_reflections.length == 0 ✓ → 放行
            ← { phase_confirmed: true, confirm_commit_ref: "...", resolver: {...} }
```

---

## 断言清单

| # | 断言 | 验证位置 |
|---|------|---------|
| 1 | 步骤 [04] reject 返回的 `error` 字段必须为 `"pending_reflection_unregistered"`（字符串完全匹配）| 错误响应 body |
| 2 | 步骤 [04] reject 返回的 `code` 字段必须为 `"PENDING_REFLECTION"`（uppercase enum，client SDK 用于 catch）| 错误响应 body |
| 3 | 步骤 [04] reject 返回的 `required_action.tool` 必须为 `"opc_flow_reflect"` | 错误响应 body |
| 4 | 步骤 [04] reject 返回的 `required_action.args.reflection_id` 必须等于步骤 [02] 收到的 `pending_reflection.reflection_id` | 错误响应 body |
| 5 | 步骤 [04] reject 时 **artifact 文件未被删除**，可以 stat 到 `opc-logs/reflection/sess-xyz/rfl-P5-r1-01HXY8.json` | 文件系统 |
| 6 | 步骤 [04] reject 时 **state.json.phases[].selected_nodes 未被写入** | state.json |
| 7 | 步骤 [04] reject 时 **flow-state.history 追加一条 `event: "guard_reject"` + `tool: "opc_phase_confirm"` + `reason: "pending_reflection_unregistered"`** | flow-state.json |
| 8 | 步骤 [05] 补登记后 `flow-state.pending_reflections.length == 0` | flow-state.json |
| 9 | 步骤 [05] 补登记后 `flow-state.reflection_log[]` 最后一条的 `reflection_id` 等于 `rfl-P5-r1-01HXY8` | flow-state.json |
| 10 | 步骤 [07] guard 放行后 `opc_phase_confirm` 成功，并写入 `confirm_commit_ref` | state.json |

---

## 边界场景扩展（同一 guard 的其他保护工具）

guard 保护清单见 [06_call-sequence-contract.md 七 防御 3](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#受-reflection-registry-guard-保护的工具清单唯一真相源)。本测试聚焦 `opc_phase_confirm` 一个工具的 reject 路径；其他工具（`opc_flow_step_complete({step:"task_analysis"})` / `opc_flow_step_complete({step:"task_decomposition"})` / `opc_flow_step_complete({step:"brief_generation"})` / `opc_pipeline_create` / `opc_node_start` / `opc_phase_complete` / `opc_pipeline_lifecycle({action:"complete"})`）的行为通过 9 张参数化单测覆盖，错误码、required_action shape 完全一致——本 e2e 不重复展开。

豁免清单（永远放行）：

| 工具 | 验证：步骤 [04] 同样状态下调用 → 应**成功**而非 reject |
|---|---|
| `opc_flow_correct({action:"abort"})` 等价 `opc_flow_lifecycle({action:"abort"})` | 用户跑路权 |
| `opc_flow_correct({action:"revise"})` | 纠错通道 |
| `opc_pipeline_lifecycle({action:"replan"})` | 同上 |
| `opc_node_finish({status:"success"})` | sub-agent 回报通道 |

---

## 不变量

| # | 不变量 | 何时检查 |
|---|------|---------|
| 1 | guard reject 不消耗 `pending_reflections[]` 项（pending 仍可被 `opc_flow_reflect` 登记） | 步骤 [04] 后 |
| 2 | guard reject 不写 `reflection_log[]`（避免重复登记 race） | 步骤 [04] 后 |
| 3 | artifact 文件归 reflection-server 写，guard reject 不触动它 | 步骤 [04] 后 |
| 4 | 同一 `reflection_id` 第二次 `opc_flow_reflect` 必返回 `reflection_already_registered`（A4 不变量） | 步骤 [05] 之后重复调用 |

---

## 结论

✓ guard 是工程层兜底，Claude 即使绕过文档（防御 1）和 `next_step_hint`（防御 2），也无法在反思未登记时推进流程。错误返回的 `required_action` 自描述足以让 Claude 自动恢复，不需要用户介入。

---

## 相关文档

- [12_reflection-rounds-exceeded.md](12_reflection-rounds-exceeded.md) — 下一场景：反思 rounds 耗尽 A3 闭环
- [../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md) — registry-guard 三层防御 + 不变量
- [../../05-opc-reflection-server/02-server-design/00_overview.md 五](../../05-opc-reflection-server/02-server-design/00_overview.md) — `pending_reflection` 字段 schema
