# 06 管线生命周期

创建 → 执行 → 完成 / 取消 / 恢复。所有状态迁移由 MCP 工具驱动，不允许直接编辑 JSON。

---

## 一、创建（MCP 状态机驱动）

```
用户消息
  → UserPromptSubmit hook 注入一行指令：先调 opc_flow_query
  → Claude → opc_flow_query() → 返回 active=false + suggested_actions（含 opc_flow_start）
  → Claude 判断任务消息 → opc_flow_start({user_message}) → 返回 intent_analysis 指令
  → Claude 判断 intent=task → opc_intent_complete
  → opc_intent_complete 路由 task 分支 → 返回 task_analysis 指令 + prerequisites:[opc_knowledge_list]
  → Claude 调 opc_knowledge_list → 7 步分析 + 收集 task_analysis_evidence → opc_task_analysis_complete
  → opc_task_analysis_complete 按 P2 V1-V5 + complexity + modify_unit_count 路由
  → (需修改 unit ≥ 2: 路由 task_decomposition → Claude 拆分 → opc_decomposition_complete → 路由)
  → opc_task_analysis_complete / opc_decomposition_complete 路由 brief_generation → Claude 生成 brief → opc_brief_complete
  → opc_brief_complete 返回 next:opc_pipeline_create（预填全部参数）
  → Claude 调 opc_pipeline_create
    → state-server: 写入 pipeline-plan.json + brief.md + state.json + 更新 flow-state.json
    → 返回 { pipeline_id, flow_next: opc_knowledge_open }
  → Claude 按 flow_next 调 opc_knowledge_open
    → 返回 { units, related, flow_next: opc_phase_start }
  → 进入阶段执行循环（每个阶段/节点工具调用都更新 flow-state.current_pipeline_pointer）
```

---

## 二、执行

子管线按 `execution_order` 严格串行执行。同一时刻只有一条子管线在执行；当前 sub 全部 phase completed 后，由 `opc_phase_complete` 返回 `next_sub_pipeline` 引导下一条 sub 启动。每条子管线内部按 phases 顺序执行。

阶段执行循环详见 [phase.md](../03-phase/00_overview.md)。

---

## 三、完成

全部子管线 completed → `opc_pipeline_complete`：

- 校验全部子管线状态
- 生成 `manifest.md`（汇总所有子管线的产物清单）
- 释放 owner（knowledge 历史保留在 git，不做物理清理）

---

## 四、取消

`opc_pipeline_abort`：级联终止。

- `pipeline-plan.json`: status → `aborted`
- 所有 `in_progress` 子管线 / phase / node → `aborted`
- 下游 `pending` 保持 `pending`（不再推进）
- 释放 owner（knowledge 历史保留在 git）

工具规范详见 [09_tools.md opc_pipeline_abort](09_tools.md#opc_pipeline_abort)。

---

## 五、恢复

```
Session 启动后用户首次发消息:
  UserPromptSubmit hook → "先调 opc_flow_query"
  Claude → opc_flow_query()
    → 读 .opc/sessions/<id>/flow-state.json 检查流程中断
    → 扫描 .opc/pipelines/*/pipeline-plan.json 找孤儿管线
    → 返回（活跃 owner 死 = 孤儿）:
      {
        active: true, owner: {pid: 12345, alive: false}, orphan: true,
        snapshot: {...},
        suggested_actions: [
          {intent: "恢复流程", next: {tool: "opc_flow_recover"}},
          {intent: "放弃并开新流程", next: {tools: ["opc_flow_abort", "opc_flow_start"]}}
        ],
        orphan_pipelines: [
          {id: "pipeline-001", last_active: "...", suggest: "opc_pipeline_recover"}
        ]
      }

用户决定恢复:
  Claude → opc_flow_recover()
    → owner.pid 接管 → 若 current_pipeline_pointer 非空 → 内部调 opc_pipeline_recover
      · 检测 in_progress node 超时（默认 30 min 无心跳）→ 自动标 failed (error.type: timeout)
    → 返回 { resume_step, resume_pointer, next, recoverable_nodes }
    → 继续执行
```

---

## 相关文档

- [09_tools.md](09_tools.md) — 7 个管线级工具的完整规范
- [../01-intent-analysis/02_flow-tools-entry-lifecycle.md](../01-intent-analysis/02_flow-tools-entry-lifecycle.md) — 13 个流程层工具
- [../03-phase/00_overview.md](../03-phase/00_overview.md) — 阶段执行循环
