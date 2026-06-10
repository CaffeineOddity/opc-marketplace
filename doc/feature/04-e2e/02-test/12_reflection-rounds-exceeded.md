# 12 反思 rounds 耗尽 → A3 闭环（ask_user 回灌）

> 本文档是 [test 总览](00_overview.md) 的子文档。覆盖 [反思 A3 闭环契约](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#八补-ask_user-回灌闭环a3-契约) 在 P2 task_analysis 步骤的端到端落地：3 轮反思都返回 `objections_remain` → state-server 触发 `rounds_exceeded` → 写 `pending_user_question` → Claude 渲染给用户 → `opc_flow_user_reply` 灌回 → `_skip_reflection_once` 单次旁路避免 ping-pong。

---

**输入**：（场景接力 [05_high-single.md](05_high-single.md)，跑到 P2 `task_analysis` 反思阶段，max_rounds=3 被反复触碰）

**测试意图**：验证 A3（反思死循环兜底）三件套：① rounds-guard 触发 `pending_user_question`；② `pending-question-guard` 在用户未答复前拦截一切写工具；③ `_skip_reflection_once` 保证回灌后不立刻被 rounds-guard 二次拦截，避免无限循环。

---

## 调用链路

```
[01] Claude → opc_flow_step_complete({step:"task_analysis", analysis_result:{complexity:"high", ...}})
            state-server:
              · 写 flow-state.accumulated.task_analysis
              · 计算反思预案：P2 高复杂度 → reflection_budget_hint{max_rounds:3, method:"debate"}
            ← flow_next: opc_reflect_execute({step:"task_analysis", method:"debate", inline:true, ...})

[02] Claude → opc_reflect_execute({step:"task_analysis", method:"debate", inline:true,
                                   artifact:{analysis_evidence-r1}})
            内部:
              · opc_reflect_plan 选 debate（2 debater + 1 judge）
              · Task spawn 3 sub-agents
              · meta-validator 保留 2 条 objection: ["scope 偏大", "knowledge_unit 缺 audit"]
              · 写盘 rfl-P2-r1-01HXYA.json
            ← {
                verdict:"objections_remain",
                kept_objections:[{id:"obj-1",text:"scope 偏大",...},{id:"obj-2",text:"缺 audit unit",...}],
                pending_reflection:{reflection_id:"rfl-P2-r1-01HXYA", artifact_path:"...", must_be_registered_by:"opc_flow_reflect"}
              }

[03] Claude → opc_flow_reflect({reflection_id:"rfl-P2-r1-01HXYA"})
            state-server:
              · 追加 reflection_log[task_analysis][] = {round:1, artifact_path, verdict:"objections_remain"}
              · 清 pending_reflections[]
              · 计算：reflection_log[task_analysis].length(1) < max_rounds(3) → 继续反思
            ← flow_next: opc_reflect_execute（round 2，继续 debate 处理 objections）

[04] Claude → opc_reflect_execute(inline:true, artifact:{修正后的 analysis_evidence-r2 试图回应 obj-1/obj-2})
            内部: meta-validator 仍保留 obj-1（"scope 仍偏大，仅缩小但未拆"）
            写盘 rfl-P2-r2-01HXYB.json
            ← verdict:"objections_remain", pending_reflection: rfl-P2-r2-01HXYB

[05] Claude → opc_flow_reflect({reflection_id:"rfl-P2-r2-01HXYB"})
            state-server:
              · reflection_log[task_analysis].length(2) < max_rounds(3) → 继续
            ← flow_next: opc_reflect_execute（round 3，最后一轮）

[06] Claude → opc_reflect_execute(inline:true, artifact:{analysis_evidence-r3})
            内部: meta-validator 仍保留 obj-1（"scope 边界无法收敛"）
            写盘 rfl-P2-r3-01HXYC.json
            ← verdict:"objections_remain", pending_reflection: rfl-P2-r3-01HXYC

[07] Claude → opc_flow_reflect({reflection_id:"rfl-P2-r3-01HXYC"})
            state-server:
              1. 追加 reflection_log[task_analysis][] = {round:3, ..., verdict:"objections_remain"}
              2. 清 pending_reflections[]
              3. 检测 reflection_log[task_analysis].length(3) == max_rounds(3) && verdict == "objections_remain"
                 → 触发 rounds_exceeded
              4. 校验 pending_user_question == null ✓（hard invariant）
              5. 生成 question_id = "uq-P2-r3-01HXYD"
              6. 写 flow-state.pending_user_question = {
                   question_id: "uq-P2-r3-01HXYD",
                   step_id: "task_analysis",
                   round: 3,
                   reasoning_trace: "3 轮 debate 始终在 'scope 边界' 上分歧",
                   kept_objections: [{id:"obj-1", text:"scope 边界无法收敛", ...}],
                   context_artifacts: [
                     "opc-logs/reflection/sess-xyz/rfl-P2-r1-01HXYA.json",
                     "opc-logs/reflection/sess-xyz/rfl-P2-r2-01HXYB.json",
                     "opc-logs/reflection/sess-xyz/rfl-P2-r3-01HXYC.json"
                   ],
                   asked_at: "2026-06-10T10:00:00Z",
                   expires_at: "2026-06-10T10:30:00Z",
                   must_be_resolved_by: "opc_flow_user_reply"
                 }
            ← {
                verdict: "rounds_exceeded",
                flow_next: {
                  action: "ask_user",
                  question_id: "uq-P2-r3-01HXYD",
                  display_to_user: {
                    summary: "task_analysis 反思已跑满 3 轮仍有未消解的反对意见，需要您裁定",
                    reasoning_trace: "3 轮 debate 始终在 'scope 边界' 上分歧",
                    kept_objections: [{id:"obj-1", text:"scope 边界无法收敛"}]
                  },
                  required_next_tool: "opc_flow_user_reply",
                  why: "用户答复后调 opc_flow_user_reply 灌回；不要调其他工具"
                }
              }

[08] Claude 把 display_to_user 渲染给用户，等待答复

[09] ⚠️ Claude 误操作场景（验证 pending-question-guard）:
     Claude → opc_pipeline_create({...})  ← 越权尝试推进
     state-server pending-question-guard 拦截:
       checkPendingUserQuestion(flowState, "opc_pipeline_create")
       → pending_user_question != null && callerTool !== "opc_flow_user_reply"
       → throw
     ← {
         error: "pending_user_question",
         code: "PENDING_USER_QUESTION",
         message: "存在未回灌的用户问答，无法调用 opc_pipeline_create",
         question_id: "uq-P2-r3-01HXYD",
         asked_at: "2026-06-10T10:00:00Z",
         step_id: "task_analysis",
         required_action: {
           tool: "opc_flow_user_reply",
           args: { question_id: "uq-P2-r3-01HXYD" },
           why: "先回灌用户答复，再推进流程"
         }
       }

[10] 用户答复（自然语言）: "scope 就按 high 走，加 audit unit；obj-1 接受'边界先粗后细'，obj-2 已解"

[11] Claude 把答复转译为结构化 resolution:
     Claude → opc_flow_user_reply({
                question_id: "uq-P2-r3-01HXYD",
                user_reply: "scope 就按 high 走，加 audit unit；obj-1 接受'边界先粗后细'，obj-2 已解",
                resolution: {
                  accumulated_patch: {
                    complexity: "high",
                    knowledge_unit: ["user", "auth", "session", "audit"]
                  },
                  objections_resolved: ["obj-2"],
                  objections_dismissed: ["obj-1"],
                  notes: "用户裁定 scope 边界先粗后细，r4 不再讨论"
                }
              })
            state-server 内部:
              1. 校验 question_id 匹配 pending_user_question.question_id ✓ + 未过期 ✓
              2. 校验 pending_reflections.length == 0 ✓（步骤 [07] 已登记 r3）
              3. 写 L1: flow-state.user_interventions[] 追加 {
                   intervention_id: "iv-01HXYE",
                   trigger: "ask_user_rounds_exceeded",
                   step_id: "task_analysis",
                   question_summary: "...",
                   user_reply: "<原话>",
                   resolution: {accumulated_patch, objections_resolved, objections_dismissed, notes},
                   linked_reflection_artifacts: [
                     "opc-logs/reflection/sess-xyz/rfl-P2-r1-01HXYA.json",
                     "opc-logs/reflection/sess-xyz/rfl-P2-r2-01HXYB.json",
                     "opc-logs/reflection/sess-xyz/rfl-P2-r3-01HXYC.json"
                   ],
                   at: "2026-06-10T10:05:00Z"
                 }
              4. 应用 resolution.accumulated_patch 到 flow-state.accumulated.task_analysis
              5. 清 pending_user_question = null
              6. 按 step_id="task_analysis" 路由 flow_next：
                 → opc_flow_step_complete({step:"task_analysis"}) 带 _skip_reflection_once:true
            ← {
                resolved: true,
                flow_next: {
                  tool: "opc_flow_step_complete",
                  args: {
                    step: "task_analysis",
                    analysis_result: {<打过 patch 的最新版>},
                    _skip_reflection_once: true
                  },
                  why: "用户已裁定，单次跳过反思以避免立即再触发 rounds-guard"
                }
              }

[12] Claude → opc_flow_step_complete({step:"task_analysis", analysis_result:{...}, _skip_reflection_once:true})
            state-server:
              · 写 flow-state.accumulated.task_analysis（覆盖为带 patch 的版本）
              · 检测 _skip_reflection_once=true → 本步跳过反思预案，不写 pending_reflection
              · 消耗 _skip_reflection_once 标志（单次有效，写入 history 防止下游再误用）
            ← flow_next: opc_flow_step_complete({step:"task_decomposition", ...}) 或 brief_generation（视 modify_unit_count）

[13] 后续步骤正常推进（P3 / P4 各自带回自己的反思预案，互不影响）
```

---

## 断言清单

| # | 断言 | 验证位置 |
|---|------|---------|
| 1 | 步骤 [07] state-server 返回的 `verdict` 必须为 `"rounds_exceeded"`（字符串完全匹配） | opc_flow_reflect 响应 body |
| 2 | 步骤 [07] state-server 返回的 `flow_next.action` 必须为 `"ask_user"` | 响应 body |
| 3 | 步骤 [07] state-server 返回的 `flow_next.required_next_tool` 必须为 `"opc_flow_user_reply"` | 响应 body |
| 4 | 步骤 [07] state-server 返回的 `flow_next.question_id` 必须等于 flow-state.pending_user_question.question_id（同源） | flow-state.json |
| 5 | 步骤 [07] 后 `flow-state.pending_user_question` 必须非 null，且 `context_artifacts.length == 3`（3 轮 artifact 全部链入） | flow-state.json |
| 6 | 步骤 [07] 后 `flow-state.pending_reflections.length == 0`（rounds 触发时最后一轮反思必已登记） | flow-state.json |
| 7 | 步骤 [09] guard reject 返回的 `error` 必须为 `"pending_user_question"`，`code` 必须为 `"PENDING_USER_QUESTION"` | 错误响应 body |
| 8 | 步骤 [09] guard reject 返回的 `required_action.tool` 必须为 `"opc_flow_user_reply"`，`required_action.args.question_id` 必须等于步骤 [07] 的 question_id | 错误响应 body |
| 9 | 步骤 [09] guard reject 后 **flow-state.accumulated 未被修改**，**pending_user_question 未被消费** | flow-state.json |
| 10 | 步骤 [11] 后 `flow-state.user_interventions[]` 最后一条 `trigger == "ask_user_rounds_exceeded"` 且 `linked_reflection_artifacts.length == 3` | flow-state.json |
| 11 | 步骤 [11] 后 `flow-state.pending_user_question == null` | flow-state.json |
| 12 | 步骤 [11] 后 `flow-state.accumulated.task_analysis.complexity == "high"` 且 `knowledge_unit` 包含 `"audit"`（patch 已应用） | flow-state.json |
| 13 | 步骤 [12] `opc_flow_step_complete` 调用必须带 `_skip_reflection_once:true`，且 state-server **不写**新的 pending_reflection | flow-state.json + 响应 body |
| 14 | 步骤 [12] 后 `_skip_reflection_once` 标志被消耗，**下一次** `opc_flow_step_complete({step:"task_decomposition"})` 若再触发反思预案，**正常生成** pending_reflection（不被旁路） | flow-state.json |
| 15 | 3 个反思 artifact 文件全部留存在磁盘（`rfl-P2-r1/r2/r3-*.json`），rounds_exceeded 不删 artifact | 文件系统 |

---

## 不变量

| # | 不变量 | 何时检查 |
|---|------|---------|
| 1 | `pending_user_question` 任何时刻最多 1 个（null 或 1 个对象） | 步骤 [07] 后 + 全程 |
| 2 | `pending_reflections` 与 `pending_user_question` 不可同时非空 | 步骤 [07]/[08]/[09] |
| 3 | 同一 `question_id` 不可重复回灌：第二次 `opc_flow_user_reply` → reject `question_already_resolved` | 步骤 [11] 后再调一次 |
| 4 | rounds_exceeded 时若 `pending_user_question != null` → opc_flow_reflect reject `previous_question_unresolved`（防止 race） | 双 P2 跑时验证 |
| 5 | `_skip_reflection_once` 单次有效：消耗后写 history `{event:"reflection_skipped_once", reason:"user_reply"}`，下次同 step 反思预案正常生效 | 步骤 [12] 之后 |
| 6 | `context_artifacts` 必须包含**所有** N 轮 artifact 路径（不只是最后一轮），保证 distiller 有完整上下文 | 步骤 [07] 后 |

---

## 边界场景（同 A3 在其他 step_id 的等价行为）

A3 闭环对 8 个反思点 P1–P8 的行为完全对称，仅 `flow_next` 路由表不同（见 [06_call-sequence-contract.md flow_next 路由表](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#flow_next-路由表按触发-ask_user-的-step_id)）。本测试聚焦 P2 `task_analysis` 的完整端到端；其他 step_id 的 A3 触发通过参数化单测覆盖：

| step_id | 回灌后 flow_next | 参数化单测验证点 |
|---|---|---|
| `intent_analysis` (P1) | `opc_flow_step_complete({step:"intent_analysis", _skip_reflection_once:true})` | resolution.accumulated_patch.intent 被采纳 |
| `task_decomposition` (P3) | `opc_flow_step_complete({step:"task_decomposition", _skip_reflection_once:true})` | sub_pipelines patch 被采纳 |
| `brief_generation` (P4) | `opc_flow_step_complete({step:"brief_generation", _skip_reflection_once:true})` | brief patch 被采纳 |
| `node_selection` (P5) | `opc_phase_confirm({selected_nodes:<resolution>, _skip_reflection_once:true})` | 直接写 state.json.phases[].selected_nodes |
| `node_execution` (P6) | `opc_node_finish({status:"success", evidence:<resolution 裁定>, _skip_reflection_once:true})` | 用户裁定 evidence 通过 |
| `phase_completion` (P7) | `opc_phase_complete({_skip_reflection_once:true})` | 用户裁定 phase 通过 |
| `phase_advance` (P8) | `opc_phase_start(next_phase, _skip_reflection_once:true)` 或 `opc_flow_correct({action:"phase_reset"})`（按 resolution.disposition） | 按用户裁定分流 |

---

## 与 distiller 的下游联动

L1 写入的 `user_interventions[]` 条目带 `trigger:"ask_user_rounds_exceeded"`，distiller sub-agent 在 pipeline 结束时（`opc_reflect_admin({action:"record_interventions"})`）**优先级更高**地处理这类条目——因为它们附带了 `linked_reflection_artifacts`（指向 3 轮反思 artifact 路径），上下文比纯"用户主动纠错"丰富得多，提炼成 corrections 后命中率更高（详见 [06_call-sequence-contract.md 与 distiller 的下游联动](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#与-distiller-的下游联动)）。

本 e2e 不直接验证 distiller 行为（pipeline_complete 阶段才触发），但断言 #10 保证了 distiller 拿到的输入字段完整。

---

## 结论

✓ A3 闭环三件套全部生效：rounds-guard 在 round=max_rounds 时触发 ask_user；pending-question-guard 在用户答复前拦截一切写工具；`_skip_reflection_once` 单次旁路避免立即再被 rounds-guard 拦下形成无限循环。错误返回的 `required_action` 自描述足以让 Claude 自动恢复，过期路径由 `opc_flow_query` 软兜底（30 分钟），不阻塞推进。

---

## 相关文档

- [13_insert-resume.md](13_insert-resume.md) — 下一场景：子管线插队 + 自动 resume
- [11_registry-guard-reject.md](11_registry-guard-reject.md) — 上一场景：反思未登记 guard 拒绝
- [../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md 八](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#八补-ask_user-回灌闭环a3-契约) — A3 契约完整规格 + Hard invariants
- [../../05-opc-reflection-server/02-server-design/00_overview.md 六](../../05-opc-reflection-server/02-server-design/00_overview.md) — `pending_user_question` 字段 schema
