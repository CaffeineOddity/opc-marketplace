# 管线状态（opc-state-server）

## 两种 Plan

OPC 有两层 plan，对应不同粒度的执行计划：

| Plan | 位置 | 生成时机 | 内容 | 生成者 |
|------|------|---------|------|--------|
| **管线编排计划** (pipeline plan) | `pipeline-plan.json` | `opc_pipeline_start` 末尾 | 子管线列表、依赖关系、执行分组 | state-manager |
| **阶段节点计划** (phase nodes plan) | `state.json` → `phases[].nodes[]` | `opc_phase_confirm` | 当前 phase 选中的 node 列表、`blocked_by` 依赖、分组 | node-resolver |

**管线 plan** 回答"这个需求拆成几条子管线、谁依赖谁、哪组可以并行"。
**阶段 nodes plan** 回答"这个 phase 跑哪些 node、按什么顺序、谁和谁能并行"。

两者都在各自层级用 `blocked_by` + 分组来表达依赖和并行。

---

## 目录结构（统一）

所有管线使用同一结构。单管线 = 只有 1 条子管线。

```
.opc/pipelines/<id>/
├── pipeline-plan.json               # 管线编排计划（始终存在）
├── manifest.md             # 产物清单（管线结束时汇总）
├── snapshots/              # 知识快照（每 phase 确认时自动生成）
│   └── sub-1/
│       └── 04-implement-design/     # 该 phase 产出的 knowledge 快照
│           ├── user-auth/login/api.md
│           └── user-auth/session/api.md
└── sub-pipelines/
    └── sub-1/              # 单管线仅此一条；拆分管线有 sub-1, sub-2...
        ├── state.json      # 子管线状态机（含阶段节点计划）
        ├── brief.md        # 任务工作单
        └── phases/         # 逐阶段摘要
            ├── 04-implement-design.md
            ├── 05-implement.md
            └── 06-testing.md
```

单管线和拆分管线的区别仅在 `pipeline-plan.json`：
- 单管线：`sub_pipelines` 数组只有 1 个元素，`blocked_by` 为空，`execution_order` 只有 1 个 group
- 拆分管线：`sub_pipelines` 数组有 N 个元素，含依赖关系和多个执行组

## MCP 工具

| 工具 | 说明 |
|------|------|
| `opc_pipeline_start` | 启动管线：意图识别 → 知识列表 → 任务分析 → 知识打开 → 工作单 → state |
| `opc_pipeline_init_sub` | 初始化单条子管线：knowledge_open → brief → state.json |
| `opc_pipeline_status` | 读取管线当前状态（支持 sub_pipeline_id 筛选） |
| `opc_pipeline_recover` | 手动恢复孤儿管线 |
| `opc_pipeline_complete` | 管线完成：校验全部子管线 + 生成 manifest.md |
| `opc_pipeline_abort` | 取消管线，标记 aborted |
| `opc_phase_start` | 进入 phase，扫描 node，返回候选列表 |
| `opc_phase_adjust` | 反思中调整节点列表，重新生成预览 |
| `opc_phase_confirm` | 确认选定 node 列表，resolver 解析依赖并锁定 |
| `opc_phase_complete` | 标记 phase 完成，返回推进指令 {next_phase, auto_advance} |
| `opc_phase_reset` | 重置 phase：从快照恢复 knowledge，下游 phase/node → pending |
| `opc_node_start` | node 开始执行，写入 input |
| `opc_node_complete` | node 完成，写入 output |
| `opc_node_fail` | node 失败，写入 error |
| `opc_node_retry` | 失败节点重试，failed → in_progress |

opc-state-server 内部自动处理：
- 依赖解锁（node 完成 → 自动解锁 blocked_by 它的 node）
- 阶段推进（phase 完成 → 检测下一 phase，高置信度自动推进）
- 管线恢复（SessionStart → 扫描未完成管线 → 提示恢复）

## state.json（含阶段节点计划）

位于 `sub-pipelines/<name>/state.json`。单管线和拆分管线的子管线格式相同。

`phases[].nodes[]` 即为**阶段节点计划**：由 `opc_phase_confirm` 调用 node-resolver 后写入，包含选中节点、`blocked_by` 依赖、执行分组。

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
  "created_at": "2026-05-30T10:00:00Z",
  "updated_at": "2026-05-30T10:30:00Z",

  "phases": [
    {
      "phase": "04-implement-design",
      "status": "completed",
      "started_at": "2026-05-30T10:00:00Z",
      "completed_at": "2026-05-30T10:15:00Z",
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
          "started_at": "2026-05-30T10:01:00Z",
          "completed_at": "2026-05-30T10:10:00Z"
        }
      ]
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 子管线 ID（单管线为 `"sub-1"`） |
| `title` | string | 子管线标题 |
| `task.description` | string | 任务一句话描述 |
| `task.complexity` | enum | `low` / `medium` / `high` |
| `task.knowledge_unit` | string[] | 本管线负责的 unit 列表 |
| `phases[].nodes[].input` | object[] | 输入项，含 `type` + `path` + `resolved` |
| `phases[].nodes[].output` | object[] | 实际产出，knowledge 带 `version` |
| `phases[].nodes[].error` | object\|null | 失败时写入，含 `message` + `type` |

## pipeline-plan.json（管线编排计划）

始终存在于管线根目录。单管线和拆分管线格式统一。在 `opc_pipeline_start` 末尾由 state-manager 写入。

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
  "created_at": "2026-05-30T10:00:00Z",
  "updated_at": "2026-05-30T10:30:00Z",

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

拆分管线示例（电商系统）：

```json
{
  "id": "pipeline-ecommerce-001",
  "description": "电商系统：商品管理 + 购物车 + 下单支付 + 用户中心",
  "complexity": "high",
  "status": "in_progress",
  "knowledge_unit": ["product", "cart", "order", "payment", "user-center"],
  "owner": {
    "session_id": "session-xyz-002",
    "pid": 67890,
    "since": "2026-05-30T10:00:00Z"
  },
  "created_at": "2026-05-30T10:00:00Z",
  "updated_at": "2026-05-30T14:30:00Z",

  "sub_pipelines": [
    {
      "id": "sub-1",
      "title": "商品管理",
      "knowledge_unit": ["product"],
      "status": "completed",
      "blocked_by": [],
      "started_at": "2026-05-30T10:05:00Z",
      "completed_at": "2026-05-30T12:00:00Z"
    },
    {
      "id": "sub-2",
      "title": "用户中心",
      "knowledge_unit": ["user-center"],
      "status": "in_progress",
      "blocked_by": [],
      "started_at": "2026-05-30T10:05:00Z"
    },
    {
      "id": "sub-3",
      "title": "购物车",
      "knowledge_unit": ["cart"],
      "status": "pending",
      "blocked_by": ["sub-1", "sub-2"]
    },
    {
      "id": "sub-4",
      "title": "下单与支付",
      "knowledge_unit": ["order", "payment"],
      "status": "pending",
      "blocked_by": ["sub-3", "sub-2"]
    }
  ],

  "execution_order": [
    {"group": 1, "parallel": ["sub-1", "sub-2"]},
    {"group": 2, "sequential": ["sub-3"]},
    {"group": 3, "sequential": ["sub-4"]}
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 管线 ID |
| `complexity` | enum | 整体复杂度 |
| `status` | enum | 整体状态，由子管线状态自动聚合 |
| `knowledge_unit` | string[] | 全部涉及的 unit |
| `owner.session_id` | string | 当前占用管线的 session ID |
| `owner.pid` | number | 当前占用进程的 PID，用于判断进程是否存活 |
| `owner.since` | string | 占用开始时间 |
| `sub_pipelines[].id` | string | 子管线 ID |
| `sub_pipelines[].knowledge_unit` | string[] | 该子管线负责的 unit |
| `sub_pipelines[].status` | enum | `pending` / `in_progress` / `completed` / `failed` |
| `sub_pipelines[].blocked_by` | string[] | 依赖的其他子管线 ID |
| `execution_order` | object[] | 执行分组。`parallel` 数组内可并行；group 之间串行 |

### 状态聚合规则

`pipeline-plan.json` 的整体 `status` 由子管线状态自动计算：

| 条件 | 整体 status |
|------|-----------|
| 全部 completed | `completed` |
| 任意 aborted | `aborted`（全局中止） |
| 任意 failed | `failed`（暂停，不推进后续 group） |
| 任意 in_progress | `in_progress` |
| 全部 pending | `pending` |
| 部分 completed + 其余 pending | `in_progress`（第一组执行中） |

## 状态枚举

| 层级 | 可选值 |
|------|--------|
| pipeline | `pending` → `in_progress` → `completed` / `failed` / `aborted` |
| phase | `pending` → `in_progress` → `completed` / `blocked` |
| node | `pending` → `in_progress` → `completed` / `failed` |

无关阶段不写入 phases 数组，由 task-analyzer 输出的 `suggested_phases` 决定哪些 phase 参与管线。

## 生命周期

```
用户消息
  → opc_pipeline_start（MCP 内部串行）
      intent-analysis → knowledge_list → task-analyzer
      → (需修改 unit ≥ 2: task-decomposition → 用户确认)
      → opc_pipeline_init_sub（每条子管线: knowledge_open → brief → state）
      → state-manager 写入 pipeline-plan.json        ← 管线编排计划
  → opc_phase_start: 扫描 node、匹配、生成候选列表
  → 用户反思（可多次 opc_phase_adjust 调整节点）
  → opc_phase_confirm: node-resolver 解析依赖
      → 写入 state.json phases[].nodes[]     ← 阶段节点计划
      → 快照该 phase 节点的 output.knowledge 路径（用于 opc_phase_reset）
  → 逐 node:
      opc_node_start (写入 input, status → in_progress)
      → Agent 执行
      → 成功: opc_node_complete | 失败: opc_node_fail
      → 失败后可 opc_node_retry 重试
  → 全部 node completed → opc_phase_complete
  → 下一 phase: 根据 opc_phase_complete 返回的 {next_phase, auto_advance} 推进
  → 全部 phase completed → opc_pipeline_complete → manifest.md
```

## 阶段重置（Phase Reset）

回退采用分层策略，覆盖不同粒度的"重来"需求：

| 层 | 场景 | 机制 | 工具 |
|----|------|------|------|
| L0 | 调整节点选择 | 反思中修改节点列表 | `opc_phase_adjust`（已有） |
| L1 | 重做单个知识产出 | 重跑 node，version 正常递增 | `opc_node_retry`（已有） |
| L2 | 废弃整个 phase 的知识 | 从快照恢复 knowledge 文件 | `opc_phase_reset`（新增） |
| L3 | 废弃知识+代码，全量回退 | git checkout / git revert | 不封装，用户自行操作 |

### 快照机制

`opc_phase_confirm` 锁定节点计划时，自动快照该 phase 所有节点的 `output.knowledge` 路径：

```
opc_phase_confirm → 快照:
  ① 扫描 nodes[].output.knowledge 路径
  ② 复制 opc-knowledge/<path>.md → .opc/snapshots/<pipeline>/<sub>/<phase>/
  ③ 文件不存在则跳过（该 knowledge 是新建的）
```

快照目录：`.opc/snapshots/<pipeline_id>/<sub_pipeline_id>/<phase>/`

每条快照只复制几 KB 的 .md 文件，存储成本极低。管线 `completed` 或 `aborted` 时自动清理快照。

### `opc_phase_reset`

```
工具: opc_phase_reset
参数: pipeline_id, sub_pipeline_id, phase
行为:
  ① 检查 .opc/snapshots/<pipeline_id>/<sub>/<phase>/ 有无快照
     → 有 → 复制快照文件回 opc-knowledge/ 对应路径
     → 无 → 报错："该 phase 无快照，请确认 phase_confirm 已执行"
  ② 该 phase → pending（node 全部重置为 pending）
  ③ 下游 phase → pending
  ④ 返回 reset_phases: ["04-implement-design", "05-implement", ...]
限制:
  - 仅操作 opc-knowledge/ 下的知识文件，不碰 src/ 等代码
  - 管线 aborted 后不可 reset（快照已清理）
  - 不依赖 git，未 commit 也能用
```

## 管线恢复与并发隔离

每条 `pipeline-plan.json` 包含 `owner` 字段，记录当前占用管线的 session 和进程 PID。恢复时通过 PID 判断管线是否为孤儿：

```
SessionStart
  → opc-state-server 扫描 .opc/pipelines/*/pipeline-plan.json
  → 发现 status: in_progress 的管线
  → 检查 owner.pid：
    ├── 进程存活 → 跳过（其他 session 正在跑，不打扰）
    └── 进程已死 → 孤儿管线 → 提示用户恢复
        → 用户确认 → 更新 owner → 定位 in_progress 的 node → 恢复执行
```

这样 A、B 两个 session 同时在跑管线时，C 启动不会误抢——只有真正的孤儿管线（进程已死）才会进入恢复流程。

## 状态变更规则

| 事件 | 操作 |
|------|------|
| 管线启动 | `opc_pipeline_start` — 意图识别 + 知识列表 + 任务分析 → (需求拆分建议) → `opc_pipeline_create` 写入 pipeline-plan.json + 逐条 init_sub |
| 管线恢复 | `opc_pipeline_recover` — 检查 owner.pid → 更新 owner → 返回可恢复的 node 列表 |
| 管线取消 | `opc_pipeline_abort` — 全部 in_progress 子管线/phase/node → aborted |
| 管线完成 | `opc_pipeline_complete` — 校验 + 生成 manifest.md + 解除 owner |
| phase 开始 | `opc_phase_start` — 写入 `phase.status: in_progress` + `started_at`，扫描 node 返回候选列表 |
| phase 调整 | `opc_phase_adjust` — 重新生成节点计划预览（不锁定） |
| phase 确认 | `opc_phase_confirm` — node-resolver 解析依赖 → **写入阶段节点计划** (state.json `phases[].nodes[]` + `blocked_by`) |
| phase 完成 | `opc_phase_complete` — 写入 `phase.status: completed` + `completed_at`，返回 {next_phase, auto_advance} |
| phase 重置 | `opc_phase_reset` — 从快照恢复该 phase 的 knowledge 文件，下游 phase/node → pending |
| node 开始 | `opc_node_start` — 写入 `input` + `status: in_progress` + `agent` + `started_at` |
| node 完成 | `opc_node_complete` — 写入 `output` + `status: completed` + `completed_at`，自动解锁依赖 |
| node 失败 | `opc_node_fail` — 写入 `status: failed` + `error` |
| node 重试 | `opc_node_retry` — 写入 `status: in_progress`（仅允许 failed 节点） |

### input/output 写入规则

- **pending**: 不写入 `input`/`output`。这些信息在 node 定义文件中。
- **in_progress**: 写入 `input`，值必须与 node 定义一致。
- **completed**: 写入 `output`，记录实际产出路径。
- **failed**: 保留 `input`，`output` 为空或部分写入，附加 `error`。

### error 字段

```json
{
  "name": "tdd-implementation",
  "status": "failed",
  "agent": "backend-engineer",
  "input": [...],
  "error": {
    "message": "测试失败: 3/12 tests failing",
    "type": "test_failure"
  }
}
```

| error.type | 说明 |
|-----------|------|
| `agent_error` | Agent 执行异常，可通过 opc_node_retry 重试 |
| `test_failure` | 测试未通过，需用户修复后重试 |
| `dependency_failure` | 前置节点失败导致，需等前置修复 |
| `user_abort` | 用户通过 opc_pipeline_abort 中断 |

## /opc-status 展示

`opc_pipeline_status` 读取 pipeline-plan.json → 展示整体进度 + 当前活跃子管线详情。

### 单管线（1 条子管线）

```
管线: user-auth (pipeline-20260530-001)
状态: in_progress

▸ sub-1: 用户认证系统  ⟳
  04-implement-design  ✓ (2/2 nodes)
    api-design         ✓  backend-engineer
    database-schema    ✓  database-engineer
  05-implement  ⟳ (1/4 nodes)
    backend-endpoint   ✓  backend-engineer
    tdd-implementation ⟳  backend-engineer     ← 当前
    auth-integration   ○  (等待 backend-endpoint)
    security-review    ○  (等待 tdd-implementation)
  06-testing  ○
```

### 拆分管线（N 条子管线）

```
管线: 电商系统 (pipeline-ecommerce-001)
状态: in_progress

▸ sub-1: 商品管理         ✓  completed
▸ sub-2: 用户中心         ⟳  in_progress
    04-implement-design  ✓ (2/2 nodes)
    05-implement  ⟳ (1/3 nodes)
      tdd-implementation ⟳  backend-engineer     ← 当前
      backend-endpoint   ○
      security-review    ○
▸ sub-3: 购物车           ○  pending (等待 sub-1, sub-2)
▸ sub-4: 下单与支付       ○  pending (等待 sub-3, sub-2)
```
