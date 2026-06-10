# 14 反思工具面：5 步 ritual + 3 步 inline 对照

> 本文档是 [test 总览](00_overview.md) 的子文档。覆盖 [reflection 工具面](../../05-opc-reflection-server/02-server-design/00_overview.md) 的两种调用模式：（A）完整 5 步 ritual（适合 high 复杂度 + 长 method 如 M5/M6 ToT，每步可观察）；（B）3 步 inline 折叠（适合 medium 复杂度 + 短 method 如 M3/M4，减少工具往返）。**两种模式登记锁、artifact 写盘、meta-validator 行为完全一致**，只是步骤数不同。

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名。`opc_reflect_plan` / `opc_reflect_execute` / `opc_reflect_complete` 是反思工具面 3 件套；`opc_flow_reflect` 是登记/路由入口。

---

**输入**：（场景接力 [05_high-single.md](05_high-single.md)，跑到 P5 `node_selection` 反思阶段）

**测试意图**：
1. 验证 5 步 ritual 完整可观察：`opc_reflect_plan` → `opc_reflect_execute({inline:false})` → `Task spawn` → `opc_reflect_complete` → `opc_flow_reflect`，每步独立 artifact / 中间状态可断言；
2. 验证 3 步 inline：`opc_flow_step_complete` → `opc_reflect_execute({inline:true})` → `opc_flow_reflect`，工具往返从 5 次降到 3 次，但 artifact 内容/meta-validator/registry-guard 行为与 5 步等价；
3. 验证两种模式产物**同一份 artifact schema**（reflection-server 单一真相源）。

---

## 模式 A：5 步 ritual（P5 / M5-ToT，high 复杂度）

```
当前: opc_phase_start("05-implement") 已返回候选 nodes + reflection_budget_hint{method:"M5-ToT", max_rounds:2}
     flow_next: opc_reflect_plan({step:"node_selection"})

[A1] Claude → opc_reflect_plan({
              step: "node_selection",
              context: {
                candidate_nodes: ["tdd-implementation","backend-endpoint","security-review","audit-logger"],
                complexity: "high",
                pipeline_id: "pipeline-001", sub_pipeline_id:"sub-1"
              }
            })
            reflection-server:
              · 读 reflection_budget_hint
              · 选 method = "M5-ToT"（Tree of Thoughts，3 branch × 2 depth）
              · 计算 prompt_template、sub-agent 规格
            ← {
                plan_id: "rpl-P5-r1-01HXYE",
                method: "M5-ToT",
                spec: {
                  branches: 3,
                  depth: 2,
                  validators: ["V1-evidence-shape", "V2-knowledge-ref", "V5-objection-distinct"],
                  prompt_template_ref: "templates/m5-tot-node-selection.md"
                },
                flow_next: {tool:"opc_reflect_execute", args:{plan_id:"rpl-P5-r1-01HXYE", inline:false}}
              }

[A2] Claude → opc_reflect_execute({plan_id:"rpl-P5-r1-01HXYE", inline:false})
            reflection-server:
              · 不内置 Task spawn（inline:false 表示外部驱动）
              · 准备 sub-agent 启动参数 + reflection_id 占位
            ← {
                reflection_id: "rfl-P5-r1-01HXYF",
                execution_mode: "external",
                agents_to_spawn: [
                  {role:"tot-explorer-1", prompt:"...", allowed_tools:["opc_knowledge_read"]},
                  {role:"tot-explorer-2", prompt:"...", allowed_tools:["opc_knowledge_read"]},
                  {role:"tot-explorer-3", prompt:"...", allowed_tools:["opc_knowledge_read"]}
                ],
                aggregator: {role:"tot-judge", prompt:"...", allowed_tools:[]},
                flow_next: {
                  tool: "<Task spawn>",
                  why: "由 Claude 主体调度 Task 工具 spawn agents_to_spawn 后调 opc_reflect_complete"
                }
              }

[A3] Claude → Task(tot-explorer-1) ∥ Task(tot-explorer-2) ∥ Task(tot-explorer-3)
              → 3 个 agent 并行返回各自的 selection_branch
              → Claude 收齐 3 个 branch_result
       Claude → Task(tot-judge, {branches:[...]})
              → judge 返回 final_evidence + objections

[A4] Claude → opc_reflect_complete({
              reflection_id: "rfl-P5-r1-01HXYF",
              artifact: {
                method: "M5-ToT",
                branches: [3 个 branch_result],
                final_evidence: {selected_nodes, rationale, knowledge_refs},
                kept_objections: [{id:"obj-1", text:"audit-logger 与 security-review 职责重叠", ...}]
              }
            })
            reflection-server:
              1. 跑 meta-validator V1-evidence-shape + V2-knowledge-ref + V5-objection-distinct
              2. 假设 V5 保留 1 条 objection → verdict = "objections_remain"
              3. 写盘 opc-logs/reflection/sess-xyz/rfl-P5-r1-01HXYF.json（含完整 branches + judge_result）
              4. 写 flow-state.pending_reflections.push({
                   reflection_id: "rfl-P5-r1-01HXYF",
                   artifact_path: "opc-logs/reflection/sess-xyz/rfl-P5-r1-01HXYF.json",
                   step_id: "node_selection",
                   expires_at: "...",
                   must_be_registered_by: "opc_flow_reflect"
                 })
            ← {
                verdict: "objections_remain",
                kept_objections: [{id:"obj-1", text:"...", evidence_ref:"..."}],
                pending_reflection: {
                  reflection_id: "rfl-P5-r1-01HXYF",
                  artifact_path: "opc-logs/reflection/sess-xyz/rfl-P5-r1-01HXYF.json",
                  must_be_registered_by: "opc_flow_reflect"
                },
                next_step_hint: {
                  suggested_tool: "opc_flow_reflect",
                  suggested_args: {reflection_id: "rfl-P5-r1-01HXYF"}
                }
              }

[A5] Claude → opc_flow_reflect({reflection_id: "rfl-P5-r1-01HXYF"})
            state-server:
              1. 校验 reflection_id ∈ pending_reflections[] ✓
              2. 读 artifact_path 验证文件存在 ✓
              3. 追加 reflection_log[node_selection][] = {round:1, artifact_path, verdict:"objections_remain"}
              4. 从 pending_reflections[] 移除（length=0）
              5. round(1) < max_rounds(2) → 继续反思
            ← flow_next: {tool:"opc_reflect_plan", args:{step:"node_selection", round:2, prev_objections:[...]}}

[A6] Claude → opc_reflect_plan(...) → opc_reflect_execute(inline:false) → Task → opc_reflect_complete
            假设 round 2 verdict="clean" → pending_reflection rfl-P5-r2-01HXYG
     Claude → opc_flow_reflect({reflection_id:"rfl-P5-r2-01HXYG"})
            → flow_next: opc_phase_confirm
```

**5 步 ritual 特点**：
- 每步独立的工具调用，便于在中途插入 inspect / debug
- `opc_reflect_plan` 输出 spec 可被人 review 后再决定是否 execute
- `opc_reflect_execute({inline:false})` 仅返回 agents_to_spawn 规格，**不内置 Task**，Claude 主体保留对 Task 的完全控制
- 适合 M5-ToT / M6-MAD 等高成本 method（值得 4 次工具往返）

---

## 模式 B：3 步 inline（P5 / critique，medium 复杂度）

```
当前: 同样 opc_phase_start("05-implement") 但 reflection_budget_hint{method:"critique", max_rounds:1}

[B1] Claude → opc_reflect_execute({
              step: "node_selection",
              method: "critique",
              inline: true,
              artifact: {selection_evidence:{...}}
            })
            reflection-server:
              · 内置 opc_reflect_plan 选 critique（不返回 plan_id 给外部）
              · 内置 Task spawn critic agent（1 个，short-running）
              · 收到 critic 输出后内置跑 meta-validator V1+V2+V5
              · 假设 V5 保留 1 条 objection → verdict="objections_remain"
              · 写盘 rfl-P5-r1-01HXYH.json
              · 写 flow-state.pending_reflections.push({...})
            ← {
                verdict: "objections_remain",
                kept_objections: [{id:"obj-1", ...}],
                pending_reflection: {
                  reflection_id: "rfl-P5-r1-01HXYH",
                  artifact_path: "opc-logs/reflection/sess-xyz/rfl-P5-r1-01HXYH.json",
                  must_be_registered_by: "opc_flow_reflect"
                },
                next_step_hint: {suggested_tool:"opc_flow_reflect", suggested_args:{reflection_id:"rfl-P5-r1-01HXYH"}},
                _inline_internal_log: {  ← 调试可观察字段
                  plan_id_internal: "rpl-P5-r1-01HXYI",
                  spawned_tasks: ["critic-agent"],
                  validator_runs: ["V1","V2","V5"]
                }
              }

[B2] Claude → opc_flow_reflect({reflection_id:"rfl-P5-r1-01HXYH"})
            state-server: 同模式 A 步骤 [A5]
            → round(1) == max_rounds(1) && verdict=="objections_remain"
            → 触发 rounds_exceeded（A3 闭环；见 [12_reflection-rounds-exceeded.md](12_reflection-rounds-exceeded.md)）

     或者假设 round 1 verdict="clean":
            ← flow_next: opc_phase_confirm
```

**3 步 inline 特点**：
- 工具往返从 5 → 3 次（plan/execute/Task/complete 4 步折叠成 1 个 `opc_reflect_execute`）
- artifact / pending_reflection / registry-guard 行为**完全一致**（同一份 schema）
- 通过 `_inline_internal_log` 字段保留可观察性（调试时可看到内部 plan_id 和 spawned tasks）
- 适合 M3-debate / critique 等短链 method（节省 token 与延迟）

---

## 模式 A vs B 等价性断言

| # | 字段 / 行为 | 模式 A (5 步) | 模式 B (3 步 inline) | 必须等价 |
|---|---|---|---|---|
| 1 | `pending_reflection.reflection_id` 格式 | `rfl-<step_short>-r<N>-<ulid>` | 同 | ✓ |
| 2 | `pending_reflection.artifact_path` 写盘路径模板 | `opc-logs/reflection/<sess>/<reflection_id>.json` | 同 | ✓ |
| 3 | `pending_reflection.must_be_registered_by` | `"opc_flow_reflect"` | `"opc_flow_reflect"` | ✓ |
| 4 | artifact JSON schema（method/branches/final_evidence/kept_objections 字段） | 完整 | 完整 | ✓ |
| 5 | meta-validator 运行集合（V1/V2/V5） | 完整 | 完整 | ✓ |
| 6 | flow-state.pending_reflections 写入时机 | `opc_reflect_complete` 后 | `opc_reflect_execute(inline:true)` 返回前 | ✓ |
| 7 | reflection-registry-guard 拦截行为（11_registry-guard-reject 验证） | 一致 | 一致 | ✓ |
| 8 | rounds-guard 触发条件（reflection_log.length == max_rounds） | 一致 | 一致 | ✓ |
| 9 | 工具往返次数 | 5 | 3 | ✗（差异点） |
| 10 | 中途可 inspect / debug 的步骤数 | 4 个间隙 | 1 个间隙（仅 inline 调用前） | ✗（差异点） |

---

## 模式选择决策表

| 触发条件 | 选模式 | reflection_budget_hint.execution_mode |
|---|---|---|
| method ∈ {M5-ToT, M6-MAD} | A (5 步) | `"external"`（默认） |
| method ∈ {M3-debate, critique} 且 max_rounds ≤ 2 | B (3 步 inline) | `"inline"` |
| complexity == "high" 且 step ∈ {P3 task_decomposition, P4 brief_generation} | A (5 步)（重决策值得透明) | `"external"` |
| step ∈ {P6 node_execution, P7 phase_completion}（已由 Validator-only 路径覆盖） | **不走反思工具面** | n/a（见 [P6/P7 决策](../../05-opc-reflection-server/02-server-design/00_overview.md#p6p7-validator-only-路径)） |
| 用户在 corrections.jsonl 中标记某 step 需要"全展开调试" | A (5 步)（强制 override) | `"external"` |

`execution_mode` 字段由 state-server 在返回 `reflection_budget_hint` 时携带，Claude 据此选 inline 参数：
- `execution_mode == "external"` → Claude 必须走 5 步 ritual（调 `opc_reflect_plan` 起步，且 `opc_reflect_execute` 必须传 `inline:false`）
- `execution_mode == "inline"` → Claude 可直接调 `opc_reflect_execute({inline:true})` 折叠

---

## 断言清单

| # | 断言 | 验证位置 |
|---|------|---------|
| 1 | 模式 A [A1] 返回的 `plan_id` 必须以 `rpl-` 开头 + ULID | 响应 body |
| 2 | 模式 A [A2] 返回的 `agents_to_spawn` 是数组，每项含 role / prompt / allowed_tools | 响应 body |
| 3 | 模式 A [A2] 必须**不内置 Task spawn**（reflection-server 进程未启动子 agent） | 进程列表 + 日志 |
| 4 | 模式 A [A4] 写盘 artifact 与模式 B [B1] 写盘 artifact 的 JSON schema 完全一致（同 jsonschema 验证通过） | 文件系统 |
| 5 | 模式 A [A4] 后 flow-state.pending_reflections.length == 1；模式 B [B1] 后同样 == 1 | flow-state.json |
| 6 | 模式 A [A5] / 模式 B [B2] 调用 `opc_flow_reflect` 后 pending_reflections.length == 0 | flow-state.json |
| 7 | 模式 B `_inline_internal_log.plan_id_internal` 必须存在（可观察性兜底），但**不写入 pending_reflection** 字段（避免污染主路径） | 响应 body + flow-state.json |
| 8 | 模式 A 与模式 B 在同一 step 下被 11_registry-guard-reject 测试**完全等价**地拦截（reject 错误体一致） | 11_registry-guard-reject.md 复用 |
| 9 | `reflection_budget_hint.execution_mode` 字段必须 ∈ `{"external", "inline"}`；缺省值 = `"external"` | state-server `opc_phase_start` 响应 |
| 10 | 模式 B 调用 `opc_reflect_execute({inline:true})` 时若 `execution_mode == "external"`，应被 reject `inline_not_allowed_for_method` | reflection-server 入口校验 |
| 11 | 模式 A 调用 `opc_reflect_execute({inline:false})` 时若 `execution_mode == "inline"`，应**允许**（external 是 inline 的超集，可降级） | reflection-server 入口校验 |
| 12 | 两模式 artifact 中 `kept_objections[].evidence_ref` 必须指向 knowledge/branches 的具体节点 ID（V2 验证） | artifact 文件 |

---

## 不变量

| # | 不变量 | 何时检查 |
|---|------|---------|
| 1 | reflection-server 是 artifact 与 pending_reflection 的**唯一写入者**（state-server 只读 + 路由 + guard） | 全程 |
| 2 | inline 模式不能减少 meta-validator 跑的 V 数量；只能折叠工具往返 | 模式 B 跑完后比对 validator_runs |
| 3 | inline 模式的 `_inline_internal_log` 字段仅用于调试，**不参与决策**（state-server 不读它） | flow-state.json 不含此字段 |
| 4 | 两模式同 step 同 round 的 reflection_id 命名空间相同（不区分模式），保证 reflection_log 顺序连续 | 同 session 内混用模式时验证 |
| 5 | A3 rounds_exceeded 触发与模式无关，只看 reflection_log.length（见 12） | 12_reflection-rounds-exceeded 复用 |

---

## 边界场景：混合模式

同一 session 内不同 step 走不同模式是合法的：
```
P2 task_analysis → 模式 A (M5-ToT, high)
P3 task_decomposition → 模式 A (M5-ToT, high)
P4 brief_generation → 模式 B (critique, medium)
P5 node_selection (sub-1) → 模式 A (M6-MAD, high)
P5 node_selection (sub-2) → 模式 B (critique, medium)
```
断言：每个 step 各自的 `execution_mode` 独立决定，state-server 不强制统一；reflection_log 在 step 维度分别累积，互不影响。

---

## 结论

✓ 反思工具面提供**两套等价 API**：5 步 ritual 给 high 复杂度 / 长 method 留充分可观察空间；3 步 inline 给 medium 复杂度 / 短 method 减少工具往返。两者在 artifact schema / pending_reflection 锁 / registry-guard / rounds-guard 等关键不变量上完全一致，只差工具调用次数。`execution_mode` 字段由 state-server 推荐，Claude 据此选模式，inline 不可用于 `external` 强制的 method（防止透明度降级），但 external 允许在 `inline` 推荐时降级（便于调试）。

---

## 相关文档

- [11_registry-guard-reject.md](11_registry-guard-reject.md) — registry-guard 在两种模式下行为等价
- [12_reflection-rounds-exceeded.md](12_reflection-rounds-exceeded.md) — A3 闭环（rounds 计数与模式无关）
- [../../05-opc-reflection-server/02-server-design/00_overview.md](../../05-opc-reflection-server/02-server-design/00_overview.md) — 工具面 schema + execution_mode 字段
- [../../05-opc-reflection-server/04-reflection-flow/01_per-step-sequence.md](../../05-opc-reflection-server/04-reflection-flow/01_per-step-sequence.md) — 每个 step 的 method 推荐
- [../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md) — 5 步 / 3 步的完整契约
