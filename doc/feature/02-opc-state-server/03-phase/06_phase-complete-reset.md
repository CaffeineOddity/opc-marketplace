# 06 opc_phase_complete、opc_flow_correct(phase_reset) 与分层回退

阶段完成与回退。完成时自动计算推进策略；reset 通过 git checkout 把 knowledge 恢复到 phase confirm 时的内容快照（**写为新 version**，不倒退），下游级联 pending。

> 阶段回退入口已折叠为 `opc_flow_correct({action:"phase_reset"})` 的 discriminator 分支（state-server 内部仍调用 PhaseServer.reset 完成实际写入）。

---

## 一、opc_phase_complete — 阶段完成

> ⚠️ **reflection-registry-guard 前置校验**：本工具受 registry-guard 保护。若 `flow-state.json.pending_reflections[]` 非空，则 reject 并返回 `required_action`。完整契约见 [05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md)。

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  ⓪ registry-guard 前置校验 → pending_reflections 非空时 reject
  → 校验该 phase 全部 node completed
  → 写入 state.json phases[].status = completed
  → 计算下一 phase + 是否 auto_advance
  → 计算 pipeline_progress（含 next_sub_pipeline、failed downstream 等）
  → 更新 flow-state.json:
      · 若 next_phase 存在 + auto_advance → current_pipeline_pointer = { sub_pipeline_id, phase: next_phase, node: null }
      · 若 next_phase 为 null + next_sub_pipeline 非空 → current_pipeline_pointer = { sub_pipeline_id: next_sub_pipeline.id, phase: null, node: null }
      · 若全部完成 → current_pipeline_pointer 保留为最后位置，等待 opc_pipeline_lifecycle({action:"complete"})
      · last_heartbeat_at 刷新

返回:
{
  phase: "04-implement-design",
  status: "completed",
  next_phase: "05-implement",
  auto_advance: true,
  next_phase_message: "进入 05-implement 编码阶段",
  pipeline_progress: {
    current_sub: "sub-1",
    current_sub_status: "in_progress",
    next_sub_pipeline: null,          ← execution_order 顺序下一个 blocked_by 满足且非 failed downstream 的子管线
    pending_sub_pipelines: ["sub-3"]
  },
  flow_next: {
    tool: "opc_phase_start",
    args: {pipeline_id, sub_pipeline_id, phase: "05-implement"},
    why: "auto_advance=true → 直接进入下一 phase"
  }
}
```

调用方根据 `auto_advance` + `pipeline_progress` 决定下一步：
- `next_phase != null` 且 `auto_advance: true` → 直接调 `opc_phase_start` 推进当前子管线
- `next_phase != null` 且 `auto_advance: false` → 提示用户确认后推进
- `next_phase == null` 且 `next_sub_pipeline != null` → 启动下一条子管线
- `next_phase == null` 且 `next_sub_pipeline == null` + 全部 sub completed → 调 `opc_pipeline_lifecycle({action:"complete"})`

---

## 二、auto_advance 计算规则

```
auto_advance = (
    task.complexity != "high"
    AND 当前 phase 所有 node 100% completed（无 retry 兜底完成）
    AND 当前 phase 的 P5 selection_evidence 通过 V1-V5 validator
        + meta-validator 未保留严重 objections
    AND 下一 phase 在 state.json.phase_plan.selected 中（按 selected 顺序查找，
        不是 available 全集——确保跳过的 phase 不会被拉回来）
)
```

任一条件不满足即 `auto_advance: false`，由用户确认。

> selection_evidence + V1-V5 的契约见 [05-opc-reflection-server/02-server-design 三 Deterministic Validator](../../05-opc-reflection-server/02-server-design/00_overview.md#三deterministic-validatorv1v5--三个工程兜底)；
> phase_plan.selected 顺序由 `opc_pipeline_create` 写入时跑偏序校验，详见
> [02-pipeline/04_state-json.md 六](../02-pipeline/04_state-json.md#六phase_plan-校验规则deterministic)。

---

## 三、opc_flow_correct({action:"phase_reset"}) — 阶段重置

```
参数: { action: "phase_reset", pipeline_id, sub_pipeline_id, phase }

行为:
  → 查 state.json.phases[phase].confirm_commit_ref
    ├── 有 → 对该 phase 涉及的每个 output.knowledge 路径:
    │        ① 读 git show <commit>:.opc/knowledge/<path>  →  base 内容
    │        ② 读当前 .opc/knowledge/<path>                →  current 内容、current_version
    │        ③ 若 base == current → 跳过（无需回退）
    │        ④ 否则 opc_knowledge_write({
    │              content: base,
    │              base_version: current_version,        # 走标准乐观锁
    │              metadata: { reset_from_commit, reset_phase }
    │           })
    │        ⑤ 写入结果 v = current_version + 1（version 永远向前）
    └── 无 → 报错（phase 从未 confirm 过）
  → 该 phase → pending（node 全部重置）
  → 下游 phase → pending
  → 不再生成"新快照"；下次 opc_phase_confirm 自然写新的 confirm_commit_ref

返回:
{
  reverted_paths: [{path, from_version: N, to_version: N+1}],
  skipped_paths:  [...],                           ← base == current 的
  conflict_paths: [...],                           ← merge_status=conflict 时
  next_phase_status: "pending"
}

限制:
  - 仅对 .opc/knowledge/ 下的 .md 操作，不碰 src/
  - 管线 aborted 后不可 reset（confirm_commit_ref 仍可读，但状态机已关闭）
  - 若 reset 期间某 path 触发 merge conflict（用户手工改了 .md 与 base 重叠）→
    返回 conflict_paths，让 Claude 走 suggested_actions（同 § 2.10）
```

> **为什么走 git 而不是文件快照**：
> 1. version 永远向前，`base_version` 探测器始终工作（详见 [../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md § 2.10](../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md#210-版本冲突与-3-way-diff-and-merge-契约)）
> 2. 历史可审计（`git log .opc/knowledge/<path>`）
> 3. 不需要自建 `.opc-knowledge-history/` 副本目录
> 4. reset 的"撤销"也走 git（恢复 reset 前的 commit），无特殊路径
>
> phase confirm 时由 `opc_phase_confirm` 把 knowledge 当时的内容 `git add .opc/knowledge/ && git commit -m "phase confirm: <phase>"`，把 commit hash 记入 `state.json.phases[phase].confirm_commit_ref`，作为 reset 锚点。详见 [05_phase-confirm-execute.md](05_phase-confirm-execute.md)。

---

## 四、分层回退策略

| 层 | 场景 | 工具 | 实现 |
|----|------|------|------|
| L0 | 调整节点选择 | 反思循环内 Claude 自行重排（无显式工具） / `opc_pipeline_lifecycle({action:"replan"})` 细粒度修节点 | 改 state.json 节点列表 |
| L1 | 重做单个产出 | `opc_node_finish({status:"retry"})`（级联重置下游） | 节点级 retry |
| L2 | 废弃整个 phase 知识 | `opc_flow_correct({action:"phase_reset"})` | `git checkout` phase confirm 锚点 → 以 `v+1` 写回 knowledge |
| L3 | 全量回退（知识+代码） | git checkout/revert（OPC 不封装） | 用户直接操作 git |

L0–L2 是 OPC 内建的回退能力；L3 完全交给 git。**L2 与 L3 共享 git 基础设施**，只是 L2 由 OPC 自动定位 phase 锚点 commit，L3 由用户挑 commit。

---

## 相关文档

- [05_phase-confirm-execute.md](05_phase-confirm-execute.md) — confirm 时写 `confirm_commit_ref`
- [08_tools-and-automation.md](08_tools-and-automation.md) — 自动机制完整列表
- [../04-node/05_execution-and-retry.md](../04-node/05_execution-and-retry.md) — L1 `opc_node_finish({status:"retry"})`
- [../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md § 2.10](../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md#210-版本冲突与-3-way-diff-and-merge-契约) — reset 复用的 diff-and-merge 契约
