# 13 sub-pipeline 插队 + 自动 resume

> 本文档是 [test 总览](00_overview.md) 的子文档。覆盖 [11_insert-resume.md](../../02-opc-state-server/02-pipeline/11_insert-resume.md) 的端到端落地：长管线跑到中途，用户提"先插一个日志中间件"→ `opc_pipeline_lifecycle({action:"replan", add_sub_pipeline, execution_priority:"immediate"})` 入队 → node 边界 paused → 插队 sub 完整跑完 → 自动 `opc_pipeline_lifecycle({action:"resume"})` → 一致性探测 → 续跑。

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名。`opc_pipeline_replan` / `opc_pipeline_resume` / `opc_pipeline_abort` 全部已并入 `opc_pipeline_lifecycle({action})`；discriminator 为 `replan` / `resume` / `abort` / `complete`。

---

**输入**：（场景接力 [06_split-3-sub.md](06_split-3-sub.md)，跑到 sub-2 的 `05-implement/backend-endpoint` 节点）

**测试意图**：验证插队**不打断 sub-agent**——`opc_pipeline_lifecycle({action:"replan"})` 只是入队，状态翻转由 `opc_node_finish` 在 node 边界完成；插队 sub 完整跑完后自动 `opc_pipeline_lifecycle({action:"resume"})`；resume 不主动覆盖文件，由 `base_version` 探测器兜底冲突。

---

## 调用链路

```
[01] 现状: sub-2.status="in_progress"，正在跑 05-implement/backend-endpoint 节点
     active_sub_pipeline_id = "sub-2"
     pipeline-plan.json.sub_pipelines = [
       {id:"sub-1", status:"completed"},
       {id:"sub-2", status:"in_progress", current_phase:"05-implement", current_node:"backend-endpoint"},
       {id:"sub-3", status:"pending"}
     ]

[02] 用户: "在继续之前，先加一个日志中间件"

[03] Claude → opc_pipeline_lifecycle({
              action: "replan",
              pipeline_id: "pipeline-001",
              changes: {
                add_sub_pipeline: [{
                  id: "sub-insert-1",
                  knowledge_unit: ["logging"],
                  execution_priority: "immediate",
                  phase_plan: {phases: ["01-context", "04-implement-design", "05-implement", "06-testing"]},
                  inserted_at: "2026-06-10T11:00:00Z"
                }]
              }
            })
            state-server:
              · 校验 knowledge_unit["logging"] 与 active sub-2.knowledge_unit 不重叠 ✓
              · 写 pipeline-plan.json:
                  sub_pipelines.push({id:"sub-insert-1", status:"pending",
                                      execution_priority:"immediate", inserted_at:"..."})
              · ⚠️ **未改 active_sub_pipeline_id**（仍是 sub-2，等 node 边界）
              · ⚠️ **未给当前 sub-agent 发任何信号**（不打断）
            ← {
                replanned: true,
                added: ["sub-insert-1"],
                active_sub_pipeline_id: "sub-2",  ← 未变
                message: "已入队；当前 node 跑完后自动切换"
              }

[04] Claude → 继续推进 sub-2/backend-endpoint（当前 node 跑完）
     sub-agent → 完成代码 + 自验
     Claude → opc_node_finish({status:"success", node_name:"backend-endpoint", evidence:{...}})
            state-server:
              1. validate_node_completion + V1-V5
              2. 写 state.json: backend-endpoint.status → success
              3. **node 边界检查**: 扫描 pipeline-plan.json
                 → 发现 sub-insert-1.status=="pending" && execution_priority=="immediate"
                 → 触发切换:
                    · sub-2.status → "paused"
                    · sub-2.paused_at = {
                        at: "2026-06-10T11:10:00Z",
                        phase: "05-implement",
                        node_after: "backend-endpoint",
                        next_node_was: "security-review"
                      }
                    · sub-insert-1.status → "in_progress"
                    · flow-state.active_sub_pipeline_id = "sub-insert-1"
                    · flow-state.history 追加 {event:"sub_paused", sub_id:"sub-2", reason:"insert_immediate"}
                    · flow-state.history 追加 {event:"sub_activated", sub_id:"sub-insert-1"}
            ← {
                node_finished: true,
                flow_next: {
                  tool: "opc_phase_start",
                  args: {sub_pipeline_id: "sub-insert-1", phase: "01-context"},
                  why: "immediate sub 已被激活，开始执行插队任务"
                }
              }

[05] Claude → opc_phase_start({sub_pipeline_id:"sub-insert-1", phase:"01-context"})
            → 正常 phase 循环（01-context → 04-implement-design → 05-implement → 06-testing）
            → 每个 phase 内部正常走 P5 node_selection 反思（与 11_registry-guard-reject 同套契约）

[06] Claude → opc_phase_complete({sub_pipeline_id:"sub-insert-1", phase:"06-testing"})  ← 最后一个 phase
            state-server:
              1. 写 state.json: phase status → completed
              2. **管线进度检查**: sub-insert-1 所有 phase completed
                 → sub-insert-1.status → "completed"
              3. **paused 扫描**: pipeline-plan.json 有 status=="paused" sub
                 → 自动触发 resume（state-manager 内部调）:
                    · 等价 opc_pipeline_lifecycle({action:"resume", sub_pipeline_id:"sub-2"})
              4. resume 内部:
                 a. 一致性探测: 读 sub-2 在 paused 时各 phase 的 confirm_commit_ref，
                    `git show <ref>:opc-knowledge/<path>` vs 当前 .md → dirty_paths
                 b. 假设无 L3 用户手工编辑 → dirty_paths == []
                 c. sub-2.status → "in_progress"
                 d. 清 paused_at（落入 history.paused_events = [{paused_at, resumed_at, dirty_paths}]）
                 e. flow-state.active_sub_pipeline_id = "sub-2"
                 f. 计算 resume_pointer: sub-2.paused_at.phase="05-implement"，
                    next_node_was="security-review" 仍在 selected_nodes 且 status=pending
                    → resume_pointer = {phase:"05-implement", node:"security-review"}
            ← {
                phase_completed: true,
                sub_pipeline_completed: true,
                auto_resumed: {
                  resumed_sub_pipeline_id: "sub-2",
                  resume_pointer: {phase:"05-implement", node:"security-review"},
                  dirty_paths: [],
                  consistency: "clean"
                },
                flow_next: {
                  tool: "opc_node_start",
                  args: {sub_pipeline_id:"sub-2", phase:"05-implement", node:"security-review"}
                }
              }

[07] Claude → opc_node_start({sub_pipeline_id:"sub-2", phase:"05-implement", node:"security-review"})
            → 续跑 sub-2 剩余节点 → 直至 sub-2 全部 completed
            → 自动推进 sub-3

[08] 边界场景：L3 漂移
     假设步骤 [06] 一致性探测发现 dirty_paths != []（用户在挂起期间手工 git rebase 改了 sub-2 的某 .md）:
     ← {
         auto_resumed: {
           resumed_sub_pipeline_id: "sub-2",
           resume_pointer: {phase:"05-implement", node:"security-review"},
           dirty_paths: ["opc-knowledge/units/auth/session.md"],
           consistency: "drift_detected",
           message: "resume 不主动覆盖；续跑 node 中 opc_knowledge_write 命中 base_version 冲突时走 3-way diff-and-merge"
         },
         flow_next: {tool:"opc_node_start", args:{...}}
       }
     续跑 security-review node 调 opc_knowledge_write({base_version:N})
     → base_version 探测命中冲突 → 走 [02_core-tools §2.10](../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md#210-版本冲突与-3-way-diff-and-merge-契约) 标准 3-way merge
```

---

## 断言清单

| # | 断言 | 验证位置 |
|---|------|---------|
| 1 | 步骤 [03] `opc_pipeline_lifecycle({action:"replan"})` 返回后，flow-state.active_sub_pipeline_id 仍为 "sub-2"（未立即切换） | flow-state.json |
| 2 | 步骤 [03] 返回后，sub-insert-1.status == "pending"（未立即激活） | pipeline-plan.json |
| 3 | 步骤 [03] 后**当前 sub-agent 进程仍存活**，未收到任何信号（ps 验证 pid 仍在） | 进程列表 |
| 4 | 步骤 [04] `opc_node_finish` 后 sub-2.status == "paused"，sub-2.paused_at 含 phase/node_after/next_node_was 字段 | pipeline-plan.json |
| 5 | 步骤 [04] 后 sub-insert-1.status == "in_progress"，flow-state.active_sub_pipeline_id == "sub-insert-1" | flow-state.json + pipeline-plan.json |
| 6 | 步骤 [04] flow-state.history 追加两条事件：`{event:"sub_paused"}` 和 `{event:"sub_activated"}` | flow-state.json |
| 7 | 步骤 [04] flow_next.tool == "opc_phase_start" 且 args.sub_pipeline_id == "sub-insert-1" | 响应 body |
| 8 | 步骤 [06] sub-insert-1 完成最后一个 phase 后，state-manager **自动**触发 resume，无需 Claude 显式调 opc_pipeline_lifecycle({action:"resume"}) | 响应 body 中 auto_resumed 字段 |
| 9 | 步骤 [06] auto_resumed.resume_pointer.node == "security-review"（= sub-2.paused_at.next_node_was，且该 node 仍 pending） | 响应 body |
| 10 | 步骤 [06] sub-2.status 翻回 "in_progress"，sub-2.paused_at 清零，sub-2.history.paused_events 追加 1 条 {paused_at, resumed_at, dirty_paths} | pipeline-plan.json |
| 11 | 步骤 [06] 一致性探测 dirty_paths 字段始终存在（即使为空数组），且 consistency ∈ {"clean", "drift_detected"} | 响应 body |
| 12 | 步骤 [06] resume **不主动覆盖任何 .md 文件**（即使 dirty，文件内容保持用户编辑后的状态） | 文件系统 |
| 13 | 步骤 [08] drift 场景下，后续 `opc_knowledge_write` 在 base_version 冲突时返回 `merge_status` 字段（走 3-way merge 而非 reject） | opc_knowledge_write 响应 |
| 14 | 整条链路中**同一时刻最多 1 个 sub 处于 in_progress**（paused 不计数） | pipeline-plan.json 任意时刻快照 |

---

## 不变量

| # | 不变量 | 何时检查 |
|---|------|---------|
| 1 | `opc_pipeline_lifecycle({action:"replan", execution_priority:"immediate"})` 调用后到下次 `opc_node_finish` 之间，**当前节点不被打断**，active sub 不变 | 步骤 [03] → [04] |
| 2 | 状态翻转**仅发生在 node 边界**（`opc_node_finish` 内部），不在 phase 边界、不在 reflection 边界 | 步骤 [04] |
| 3 | `paused` sub 视同活跃参与 owner 持有；孤儿检测仍生效（pid 死 → recover 流程会扫到 paused sub） | 全程 |
| 4 | 栈式叠加：若插队 sub 跑到一半又被插入另一个 immediate sub，paused 栈深度可 ≥2；resume 时按后进先出 | 二次插队验证 |
| 5 | resume 不写文件、不改 knowledge version；只翻 status + 探测漂移 | 步骤 [06] |
| 6 | `knowledge_unit` 重叠校验在 replan 入口拒绝（不到 node 边界才发现）：`opc_pipeline_lifecycle({action:"replan"})` 直接返回 `error:"knowledge_unit_overlap_with_active_sub"` | replan 入口 |

---

## 边界场景

### A. 二次插队（栈式）
```
sub-A (in_progress) → replan insert sub-B → node 边界切换:
  sub-A → paused; sub-B → in_progress
sub-B 跑到中途 → replan insert sub-C → node 边界切换:
  sub-B → paused; sub-C → in_progress
sub-C 完成 → 自动 resume sub-B（栈顶）
sub-B 完成 → 自动 resume sub-A
```
断言：`pipeline-plan.json.sub_pipelines` 中同时存在 2 个 `status:"paused"`，resume 顺序按 `paused_at` 倒序（后入先出）。

### B. 插队 sub 自身 abort
插队 sub 跑到一半用户决定放弃这次插入：
```
Claude → opc_pipeline_lifecycle({action:"abort", sub_pipeline_id:"sub-insert-1", scope:"sub"})
  → sub-insert-1.status → aborted
  → 扫描 paused → 自动 resume sub-2（即使 insert 没跑完也回到 sub-2）
```
断言：abort 路径与 complete 路径在 resume 触发上**完全对称**（都通过"sub 终态 + paused 扫描"触发）。

### C. 用户主动 resume
若 state-manager 自动 resume 失败（如 dirty_paths 过大用户想先手工合并），用户可手工调：
```
Claude → opc_pipeline_lifecycle({action:"resume", sub_pipeline_id:"sub-2"})
```
断言：手工 resume 与自动 resume 行为等价，dirty_paths 探测同样执行。

---

## 结论

✓ 插队不是中断而是调度：`opc_pipeline_lifecycle({action:"replan", execution_priority:"immediate"})` 只入队，`opc_node_finish` 在 node 边界翻状态。插队 sub 完成后**自动** `opc_pipeline_lifecycle({action:"resume"})`，无需 Claude 显式调。一致性探测 + `base_version` 探测器构成两道防线：resume 不写文件，冲突由 3-way merge 在 `opc_knowledge_write` 时兜底。栈式插队天然支持，abort 路径与 complete 路径在 resume 触发上对称。

---

## 相关文档

- [14_reflection-tool-surface.md](14_reflection-tool-surface.md) — 下一场景：反思工具面 5 步 + 3 步 inline 对照
- [../../02-opc-state-server/02-pipeline/11_insert-resume.md](../../02-opc-state-server/02-pipeline/11_insert-resume.md) — sub-pipeline 插队 / 挂起 / 恢复契约（设计文档）
- [../../02-opc-state-server/02-pipeline/03_pipeline-plan.md](../../02-opc-state-server/02-pipeline/03_pipeline-plan.md) — sub_pipelines 字段（paused / execution_priority / paused_at）
- [../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md#210](../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md#210-版本冲突与-3-way-diff-and-merge-契约) — 一致性探测之后的写入路径
