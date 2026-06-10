# 08 节点来源、MCP 工具与自动机制

---

## 一、节点来源

`opc_phase_start` 扫描两个来源，同名节点项目覆盖内置：

| 来源 | 位置 | 说明 |
|------|------|------|
| 内置节点 | `phases/<phase>/nodes/` | 随 marketplace 分发 |
| 项目节点 | `opc-nodes/` | 同目录结构，同名覆盖 |

详细优先级与目录布局见 [../04-node/06_source-and-override.md](../04-node/06_source-and-override.md)。

---

## 二、阶段级 MCP 工具（3 个）

| # | 工具 | 说明 |
|---|------|------|
| 10 | `opc_phase_start` | 扫描 node，返回候选列表 |
| 11 | `opc_phase_confirm` | 锁定节点计划，写入 state，记 git commit 锚点（`confirm_commit_ref`） |
| 12 | `opc_phase_complete` | 标记完成，返回推进指令 |

> 历史名 `opc_phase_adjust` 已删除（节点调整改由反思循环内 Claude 自行重排，必要时走 `opc_pipeline_lifecycle({action:"replan"})` 细粒度修改）。
>
> 历史名 `opc_flow_correct({action:"phase_reset"})` 已折叠为 `opc_flow_correct({action:"phase_reset"})`（流程层统一入口，state-server 内部仍调用 PhaseServer.reset）。

各工具完整规范散落在：
- `opc_phase_start` → [04_phase-start.md](04_phase-start.md)
- `opc_phase_confirm` → [05_phase-confirm-execute.md](05_phase-confirm-execute.md)
- `opc_phase_complete` / `opc_flow_correct({action:"phase_reset"})` → [06_phase-complete-reset.md](06_phase-complete-reset.md)

---

## 三、自动机制

### 3.1 阶段自动推进

`opc_phase_complete` 后按 auto_advance 计算规则决定推进策略：

```
auto_advance = (
    task.complexity != "high"
    AND 当前 phase 所有 node 100% completed（无 retry 兜底完成）
    AND 当前 phase 的 P5 selection_evidence 通过 V1-V5 validator
        + meta-validator 未保留严重 objections
    AND 下一 phase 在 state.json.phase_plan.selected 中
)
```

- `auto_advance: true` → Claude 直接调 `opc_phase_start` 进入下一 phase
- `auto_advance: false` → 提示用户确认后推进
- `next_phase == null` + `next_sub_pipeline != null` → Claude 启动下一条子管线
- `next_phase == null` + `next_sub_pipeline == null` + 全部 sub completed → 调 `opc_pipeline_lifecycle({action:"complete"})`

### 3.2 节点选择反思持久化

每轮反思通过 `opc_flow_reflect({action:"plan"|"execute"|"complete"})` 写入 `state.json.phases[].reflection_log`，同时在 `flow-state.json` 留指针，crash 后 `opc_flow_lifecycle({action:"recover"})` 可续传从指定 round 继续。

### 3.3 跨子管线 next 检测

`opc_phase_complete` 返回 `pipeline_progress.next_sub_pipeline`，state-manager 按 execution_order 顺序找第一个 `status=pending` 且 `blocked_by` 全 `completed` 且 upstream 无 `failed` 的 sub；若无则返回 `null`。

---

## 相关文档

- [04_phase-start.md](04_phase-start.md) — `opc_phase_start` 完整规范
- [06_phase-complete-reset.md](06_phase-complete-reset.md) — auto_advance 规则
- [../01-intent-analysis/02_flow-tools-entry-lifecycle.md](../01-intent-analysis/02_flow-tools-entry-lifecycle.md) — `opc_flow_reflect` 流程工具
- [../../07-tool-consolidation/00_overview.md](../../07-tool-consolidation/00_overview.md) — 54→28 工具合并方案
