# 02-2 管线

管线的创建、编排、状态管理和生命周期。管线是 opc-state-server 的核心数据模型，所有管线工具直接操作 pipeline-plan.json 和 state.json。

---

## 一、两层 Plan 模型

| Plan | 位置 | 生成时机 | 内容 |
|------|------|---------|------|
| **管线编排计划** | `pipeline-plan.json` | `opc_pipeline_create` | 子管线列表、依赖关系、执行分组 |
| **阶段节点计划** | `state.json` → `phases[].nodes[]` | `opc_phase_confirm` | 当前 phase 选中的 node 列表、blocked_by、分组 |

---

## 二、目录结构

```
.opc/pipelines/<id>/
├── pipeline-plan.json               # 管线编排计划
├── manifest.md                      # 产物清单（管线结束时汇总）
├── snapshots/                       # 知识快照（每 phase 确认时自动生成）
│   └── sub-1/
│       └── 04-implement-design/
│           ├── user-auth/login/api.md
│           └── user-auth/session/api.md
└── sub-pipelines/
    └── sub-1/                       # 单管线仅一条；拆分管线有 sub-1, sub-2...
        ├── state.json               # 子管线状态机
        ├── brief.md                 # 任务工作单
        └── phases/                  # 逐阶段摘要
            ├── 04-implement-design.md
            ├── 05-implement.md
            └── 06-testing.md
```

---

## 三、pipeline-plan.json

### 3.1 单管线

```json
{
  "id": "pipeline-20260530-001",
  "description": "实现用户认证系统",
  "complexity": "medium",
  "status": "in_progress",
  "knowledge_unit": ["user-auth"],
  "owner": {
    "session_id": "session-abc-001",
    "pid": 12345,
    "since": "2026-05-30T10:00:00Z"
  },
  "sub_pipelines": [
    {
      "id": "sub-1",
      "title": "用户认证系统",
      "knowledge_unit": ["user-auth"],
      "status": "in_progress",
      "blocked_by": [],
      "started_at": "2026-05-30T10:01:00Z"
    }
  ],
  "execution_order": [
    {"group": 1, "parallel": ["sub-1"]}
  ]
}
```

### 3.2 拆分管线

```json
{
  "id": "pipeline-ecommerce-001",
  "description": "电商系统：商品管理 + 购物车 + 下单支付 + 用户中心",
  "complexity": "high",
  "status": "in_progress",
  "knowledge_unit": ["product", "cart", "order", "payment", "user-center"],
  "sub_pipelines": [
    {"id": "sub-1", "title": "商品管理",    "knowledge_unit": ["product"],     "status": "completed",   "blocked_by": []},
    {"id": "sub-2", "title": "用户中心",    "knowledge_unit": ["user-center"], "status": "in_progress",  "blocked_by": []},
    {"id": "sub-3", "title": "购物车",      "knowledge_unit": ["cart"],        "status": "pending",     "blocked_by": ["sub-1", "sub-2"]},
    {"id": "sub-4", "title": "下单与支付",  "knowledge_unit": ["order", "payment"], "status": "pending", "blocked_by": ["sub-3", "sub-2"]}
  ],
  "execution_order": [
    {"group": 1, "parallel": ["sub-1", "sub-2"]},
    {"group": 2, "sequential": ["sub-3"]},
    {"group": 3, "sequential": ["sub-4"]}
  ]
}
```

### 3.3 字段说明

| 字段 | 说明 |
|------|------|
| `id` | 管线唯一 ID |
| `complexity` | `medium` / `high` |
| `status` | 整体状态，由子管线状态自动聚合 |
| `knowledge_unit` | 全部涉及的 unit |
| `owner` | 当前占用管线的 session_id + pid + since |
| `sub_pipelines[].id` | 子管线 ID |
| `sub_pipelines[].knowledge_unit` | 该子管线负责的 unit |
| `sub_pipelines[].status` | `pending` / `in_progress` / `completed` / `failed` |
| `sub_pipelines[].blocked_by` | 依赖的其他子管线 ID |
| `execution_order` | 执行分组。`parallel` 可并行；group 之间串行 |

### 3.4 状态聚合规则

| 条件 | 整体 status |
|------|-----------|
| 全部 completed | `completed` |
| 任意 aborted | `aborted` |
| 任意 failed | `failed` |
| 任意 in_progress | `in_progress` |
| 全部 pending | `pending` |
| 部分 completed + 其余 pending | `in_progress` |

### 3.5 owner 字段 — 并发隔离

```
→ 扫描 .opc/pipelines/*/pipeline-plan.json
→ 发现 status: in_progress 的管线
→ 检查 owner.pid：
  ├── 进程存活 → 跳过（其他 session 正在跑）
  └── 进程已死 → 孤儿管线 → 提示用户恢复
```

---

## 四、state.json

位于 `sub-pipelines/<name>/state.json`。

### 4.1 完整结构

```json
{
  "id": "sub-1",
  "title": "商品管理",
  "task": {
    "description": "实现商品管理功能（CRUD + 分类 + 搜索）",
    "tags": ["backend", "database", "api"],
    "complexity": "medium",
    "knowledge_unit": ["product"],
    "scenario_hints": ["add-feature"]
  },
  "status": "in_progress",
  "phases": [
    {
      "phase": "04-implement-design",
      "status": "completed",
      "nodes": [
        {
          "name": "api-design",
          "status": "completed",
          "agent": "backend-engineer",
          "blocked_by": [],
          "input": [
            {"type": "knowledge", "path": "product/api"}
          ],
          "output": [
            {"type": "knowledge", "path": "product/api", "version": 1}
          ],
          "error": null,
          "timeout_minutes": 30,
          "retry_count": 0,
          "max_retries": 3
        }
      ]
    }
  ]
}
```

### 4.2 字段说明

| 字段 | 说明 |
|------|------|
| `task.complexity` | `low` / `medium` / `high` |
| `task.knowledge_unit` | 本条子管线负责的 unit 列表 |
| `phases[].status` | `pending` / `in_progress` / `completed` / `blocked` |
| `phases[].nodes[].status` | `pending` / `in_progress` / `completed` / `failed` |
| `phases[].nodes[].blocked_by` | 依赖的前置 node name |
| `phases[].nodes[].input` | 输入项，含 `type` + `path` |
| `phases[].nodes[].output` | 实际产出，knowledge 带 `version` |
| `phases[].nodes[].error` | 失败时写入，含 `message` + `type` |
| `phases[].nodes[].retry_count` | 已重试次数 |
| `phases[].nodes[].max_retries` | 重试上限，默认 3 |

---

## 五、状态枚举

| 层级 | 可选值 |
|------|--------|
| pipeline | `pending` → `in_progress` → `completed` / `failed` / `aborted` |
| phase | `pending` → `in_progress` → `completed` / `blocked` |
| node | `pending` → `in_progress` → `completed` / `failed` |

### 5.1 input/output 规则

| 状态 | 规则 |
|------|------|
| **pending** | 不写入 input/output |
| **in_progress** | 写入 input（与 node 定义一致） |
| **completed** | 写入 output（实际产出路径 + evidence 摘要） |
| **failed** | 保留 input，output 为空或部分写入，附加 error |

### 5.2 error 类型

| error.type | 说明 |
|-----------|------|
| `agent_error` | Agent 执行异常，可 retry |
| `test_failure` | 测试未通过 |
| `dependency_failure` | 前置节点失败 |
| `quality_gate_failed` | L1/L2 校验不通过，node 保持 in_progress |
| `timeout` | 超时，retry_count 未达上限时自动重试 |
| `user_abort` | 用户通过 opc_pipeline_abort 中断 |

---

## 六、单管线 vs 拆分管线

### 6.1 拆分触发条件

task-analysis 输出中需要**修改**的 unit 数量 ≥ 2 时，触发 task-decomposition：

- 修改的 unit 互相独立 → 拆分为独立子管线
- 修改的 unit 有 `_refs` 依赖 → 合并或建立 blocked_by

### 6.2 单管线

只有 1 条子管线（sub-1），blocked_by 为空，1 个 execution group。跳过拆分环节。

### 6.3 knowledge_unit 按子管线分配

每条子管线独立加载自己的 knowledge_unit。`_refs` 关联的 unit 自动标记为可读。

---

## 七、管线生命周期

### 7.1 创建（MCP 状态机驱动）

```
用户消息
  → UserPromptSubmit hook 注入一行指令：先调 opc_flow_query
  → Claude → opc_flow_query() → 返回 active=false + suggested_actions（含 opc_flow_start）
  → Claude 判断任务消息 → opc_flow_start({user_message}) → opc_flow_start 返回 intent_analysis 指令
  → Claude 判断 intent=task → opc_intent_complete
  → opc_intent_complete 路由 task 分支 → 返回 task_analysis 指令 + prerequisites:[opc_knowledge_list]
  → Claude 调 opc_knowledge_list → 7 步分析 + 自省 → opc_task_analysis_complete
  → opc_task_analysis_complete 按 confidence + complexity + modify_count 路由
  → (需修改 unit ≥ 2: opc_task_analysis_complete 路由 task_decomposition → Claude 拆分 → opc_decomposition_complete → opc_decomposition_complete 路由)
  → opc_task_analysis_complete/opc_decomposition_complete 路由 brief_generation → Claude 生成 brief → opc_brief_complete
  → opc_brief_complete 返回 next:opc_pipeline_create（预填全部参数）
  → Claude 调 opc_pipeline_create
    → state-server: 写入 pipeline-plan.json + brief.md + state.json + 更新 flow-state.json
    → 返回 { pipeline_id, flow_next: opc_knowledge_open }
  → Claude 按 flow_next 调 opc_knowledge_open
    → 返回 { units, related, flow_next: opc_phase_start }
  → 进入阶段执行循环（每个阶段/节点工具调用都更新 flow-state.current_pipeline_pointer）
```

### 7.2 执行

按 `execution_order` 分组推进。group 内 `parallel` 的子管线可并行执行；group 之间严格串行。每条子管线内部按 phases 顺序执行。

### 7.3 完成

全部子管线 completed → `opc_pipeline_complete`：
- 校验全部子管线状态
- 生成 manifest.md（汇总所有子管线的产物清单）
- 释放 owner、清理快照

### 7.4 取消

`opc_pipeline_abort`：级联终止。
- pipeline-plan.json: status → aborted
- 所有 in_progress 子管线/phase/node → aborted
- 下游 pending 保持 pending（不再推进）
- 清理快照

### 7.5 恢复

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

## 八、跨管线依赖

### 8.1 blocked_by 语义

sub-3 声明 `blocked_by: ["sub-1", "sub-2"]`，则 sub-3 必须等 sub-1 和 sub-2 都 completed 后才能启动。

### 8.2 execution_order 分组

- `parallel`：组内子管线可同时执行
- `sequential`：按顺序执行
- group 之间严格串行

`execution_order` 必须与 `blocked_by` 推导的拓扑排序一致，`opc_pipeline_create` 时校验。

### 8.3 失败传播

子管线 failed 阻塞所有依赖它的子管线。failed 子管线不出现在 `ready_sub_pipelines` 中。

---

## 九、多 Feature 并行

```
.opc/pipelines/
├── pipeline-20260530-001/    # user-auth
└── pipeline-20260530-002/    # subscription
```

每个管线独立目录、owner、状态。`/opc-status` 展示所有活跃管线。

---

## 十、管线状态展示

### 10.1 单管线

```
管线: user-auth (pipeline-20260530-001)
状态: in_progress

▸ sub-1: 用户认证系统  ⟳
  04-implement-design  ✓ (2/2 nodes)
    api-design         ✓  backend-engineer
    database-schema    ✓  database-engineer
  05-implement  ⟳ (1/4 nodes)
    tdd-implementation ⟳  backend-engineer     ← 当前
    auth-integration   ○  (等待 tdd-implementation)
    security-review    ○  (等待 tdd-implementation)
  06-testing  ○
```

### 10.2 拆分管线

```
管线: 电商系统 (pipeline-ecommerce-001)
状态: in_progress

▸ sub-1: 商品管理         ✓  completed
▸ sub-2: 用户中心         ⟳  in_progress
    04-implement-design  ✓ (2/2 nodes)
    05-implement  ⟳ (1/3 nodes)
      tdd-implementation ⟳  backend-engineer     ← 当前
▸ sub-3: 购物车           ○  pending (等待 sub-1, sub-2)
▸ sub-4: 下单与支付       ○  pending (等待 sub-3, sub-2)
```

---

## 十一、MCP 工具

### 流程层工具

13 个 `opc_flow_*` 工具，完整规范见 [02-1 §三 流程工具](02-1_intent-analysis.md#三流程工具)。本文档只描述管线级工具如何与流程层协作。

### 管线级工具（6 个）

| # | 工具 | 说明 |
|---|------|------|
| 1 | `opc_pipeline_create` | 创建管线：opc_brief_complete 路由触发，参数已预填；写入文件并返回 flow_next |
| 2 | `opc_pipeline_status` | 读取管线状态（支持子管线筛选） |
| 3 | `opc_pipeline_recover` | 手动恢复指定孤儿管线（通常由 opc_flow_recover 内部调用） |
| 4 | `opc_pipeline_complete` | 管线完成：校验 + manifest.md |
| 5 | `opc_pipeline_abort` | 管线取消：级联终止 + kill in_progress sub-agent + 同步调用 opc_flow_abort |
| 6 | `opc_pipeline_replan` | 管线修改：细粒度增删节点、阶段，调整子管线列表和执行顺序 |

### opc_pipeline_create

```
触发: opc_brief_complete opc_brief_complete 返回 next 字段预填全部参数

参数: description, tags, complexity, knowledge_unit, suggested_phases, scenario,
      brief_content, sub_pipelines[], execution_order[]

行为:
  → 生成 pipeline ID，创建 .opc/pipelines/<id>/
  → 写入 pipeline-plan.json（含 sub_pipelines + execution_order + owner）
  → 写入 brief.md（内容由 Claude 提供）
  → 写入 state.json（初始空 phases）
  → 校验 execution_order 与 blocked_by 的拓扑一致性
  → 更新 .opc/sessions/<id>/flow-state.json：
      · pipeline_id = <新 ID>
      · current_step = "pipeline_created"

返回:
{
  pipeline_id: "pipeline-xxx",
  created_at: "...",
  flow_next: {
    tool: "opc_knowledge_open",
    args: { units: [...聚合所有 sub_pipelines.knowledge_unit] },
    why: "管线已创建，下一步初始化知识单元"
  }
}
```

### opc_pipeline_status

```
参数: pipeline_id, sub_pipeline_id? (可选)

带 sub_pipeline_id → state.json 完整内容 + node 状态 + unblocked_nodes
不带 → 各子管线状态聚合 + ready_sub_pipelines（blocked_by 全满足且非 failed downstream）
```

### opc_pipeline_recover

```
参数: pipeline_id

行为:
  → 检查 owner.pid 是否存活
    ├── 存活 → 拒绝
    └── 已死 → 更新 owner 为当前 session
  → 检查 in_progress node 超时（默认 30 分钟无心跳）→ 自动标记 failed (error.type: timeout)
  → 返回可恢复的 in_progress + failed node 列表
  → 同时更新 flow-state.json：标记 step: pipeline_recovered

返回:
{
  pipeline_id, owner_taken,
  recoverable_nodes: [{name, status, suggested_action: "opc_node_retry"|"opc_node_start"}]
}
```

### opc_pipeline_abort

```
参数: pipeline_id, kill_agents?: boolean (默认 true), reason?

行为:
  → pipeline-plan.json status → aborted
  → 全部 in_progress sub_pipelines/phases/nodes 标记 aborted
  → kill_agents=true → 向所有 in_progress node 的 sub-agent 发 SIGTERM（pid 存于 node.agent_pid）
  → 写入 abort_reason
  → 清理 .opc/snapshots/
  → 若 flow-state.status=in_progress + pipeline_id 匹配 → 同步调用 opc_flow_abort

返回:
{
  aborted_pipeline_id, killed_agent_pids: [...], freed_snapshots: int
}
```

### opc_pipeline_replan（细粒度）

```
参数: pipeline_id, changes: {
  add_phase_node?: [{phase, node, blocked_by?}],     // 增加节点到指定阶段
  remove_phase_node?: [{phase, node}],               // 移除节点（仅 pending 状态可移除）
  replace_phase_node?: [{phase, old_node, new_node}],// 替换节点
  add_phase?: [{phase, after?: "..."}],              // 新增阶段插入位置
  remove_phase?: [phase],                            // 移除阶段（仅 pending 可移）
  update_complexity?: "low"|"medium"|"high",         // 修改复杂度（影响后续 phase 推进策略）
  update_suggested_phases?: [...],                   // 重排阶段顺序（仅 pending 可重排）
  add_sub_pipeline?: [{id, title, knowledge_unit, blocked_by}],
  remove_sub_pipeline?: [id],                        // 仅 pending 可移
  update_execution_order?: [...]
}, reason?: string

行为:
  ① 校验:
     · 已 completed 的 sub_pipelines/phases/nodes 不可删除/重排/替换
     · 已 in_progress 的 phase/node 不可修改其结构
     · 增加节点：tag 必须与该 phase 兼容；blocked_by 节点必须存在
     · 增加阶段：必须在 suggested_phases 已知列表中
     · update_execution_order 必须与 blocked_by 拓扑一致
  ② 应用 changes 到 pipeline-plan.json + state.json
  ③ 重新触发 node-resolver 校验依赖关系
  ④ 追加 replan_history[] 到 pipeline-plan.json
  ⑤ 更新 flow-state.json.history

返回:
{
  pipeline_id,
  applied_changes: {...},
  rejected_changes: [{change, reason}],
  updated_phases: ["..."],
  updated_sub_pipelines: ["..."],
  replan_history_id: "replan-001"
}

约束:
  · 当前正在执行的 node 不受影响（继续按原计划跑完）
  · 受影响的下游 pending 节点立即根据新计划生效
  · complexity 升级 (medium→high) 会自动把后续 phase 的 auto_advance 改为 false
```

---

## 十二、完整调用链路

### 单管线

```
用户: "实现用户认证系统"

① Hook 注入"先调 opc_flow_query"指令
② Claude → opc_flow_query → opc_flow_query 返回 active=false + suggested_actions
③ Claude → opc_flow_start → opc_flow_start 返回 intent_analysis 指令 + methodology
④ Claude → 判断 intent=task → opc_intent_complete({intent: "task", confidence: 0.85})
⑤ opc_intent_complete 路由 → 返回 task_analysis 指令
⑥ Claude → opc_knowledge_list → 7 步分析 + 自省 → opc_task_analysis_complete
⑦ opc_task_analysis_complete 判定: high confidence + medium + modify=1 → 路由 brief_generation
⑧ Claude → 生成 brief → opc_brief_complete → opc_brief_complete 返回预填的 pipeline_create 参数
⑨ Claude → opc_pipeline_create → state-server 写入文件
⑩ 返回 flow_next → Claude → opc_knowledge_open
⑪ 返回 flow_next → Claude → opc_phase_start("04-implement-design")
⑫ opc_phase_adjust / opc_phase_confirm → 锁定（同步更新 current_pipeline_pointer）
⑬ 逐 node: opc_node_start → 按 node_body 执行 → opc_node_complete
⑭ opc_phase_complete → auto_advance + pipeline_progress
⑮ 回到 ⑪ → 进入 05-implement → 重复
⑯ opc_pipeline_complete → manifest.md
```

### 拆分管线

```
用户: "实现电商系统：商品+购物车+支付+用户中心"

① Hook 注入"先调 opc_flow_query"
② Claude → opc_flow_query → 返回 active=false + suggested_actions
③ Claude → opc_flow_start → opc_flow_start 返回 intent_analysis 指令
④ Claude → 判断 intent=task → opc_intent_complete
⑤ opc_intent_complete 路由 → task_analysis 指令
⑥ Claude → opc_knowledge_list → 7 步分析 → opc_task_analysis_complete
⑦ opc_task_analysis_complete 判定: 修改 unit=5 ≥ 2 → 路由 task_decomposition
⑧ Claude → 拆分 4 条子管线 → opc_decomposition_complete({..., decomp_confidence: 0.87})
⑨ opc_decomposition_complete 判定: 0.87 ≥ 0.8 → 自动推进，路由 brief_generation
⑩ Claude → 生成 brief → opc_brief_complete
⑪ opc_brief_complete → 返回预填的 pipeline_create 参数
⑫ Claude → opc_pipeline_create → 写入 pipeline-plan.json
⑬ 返回 flow_next → opc_knowledge_open → 返回 flow_next → 进入阶段
⑭ 按 execution_order 执行: Group1(sub-1∥sub-2) → sub-3 → sub-4
⑮ 全部 completed → opc_pipeline_complete
```

### 其他意图

```
project_question → opc_intent_complete 路由 → action: respond_with_knowledge + prerequisites:[opc_knowledge_search]
                 → opc_intent_complete 内部标记 flow-state.status=completed
                 → Claude 调 search 后注入上下文回答（不创建管线）
general_question / chat → opc_intent_complete 路由 → done: true → 内部标记 status=completed → Claude 直接回答
task / complexity=low → opc_task_analysis_complete 路由 → action: opc_quick_dispatch (opc_quick_dispatch) → 内部标记 status=completed
                       → Agent 直接执行（无管线/无 phases/无 state），写入 .opc/quick-history.jsonl
```

### 异常路径

```
中断恢复:
  Session 启动后用户首次发消息 → UserPromptSubmit hook → opc_flow_query
    → 流程层 owner.pid 已死 + active=true → orphan: true
    → 返回 suggested_actions: [opc_flow_recover / opc_flow_abort+opc_flow_start]
    → 同时返回 orphan_pipelines（管线层孤儿）
取消:     opc_flow_abort → 自动级联 opc_pipeline_abort（含 kill in_progress sub-agent）
回退:     opc_phase_reset → 快照恢复 → 下游 pending → 立即重生快照
重跑:     opc_node_retry → 级联重置下游 → 重跑当前 node
修订:     opc_flow_revise → 修改 accumulated 字段 → 按需自动回溯
重做:     opc_flow_restart(from_step) → 回退到指定步骤 → 保留前置数据
管线改造: opc_pipeline_replan → 细粒度增删节点/阶段/子管线 → 不影响 in_progress
```

---

## 十三、相关文档

- [02-1 意图分析](02-1_intent-analysis.md) — 管线入口与任务分析
- [02-3 阶段](02-3_phase.md) — 阶段执行与节点选择
- [02-4 节点](02-4_node.md) — 节点执行与质量门
