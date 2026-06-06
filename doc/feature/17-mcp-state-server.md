# opc-state-server API 规范

管线状态机 MCP 服务，负责管线/阶段/节点的全生命周期管理。

---

## 一、服务概述

### 1.1 角色

opc-state-server 是 OPC 的核心状态机，管理管线编排计划（pipeline-plan.json）和子管线状态（state.json）。所有状态变更必须通过 MCP 工具调用，不允许直接修改文件。

### 1.2 工具速览（18 个）

| # | 层级 | 工具 | 说明 |
|---|------|------|------|
| 1 | 管线 | `opc_pipeline_start` | 分析任务：意图识别→知识列表→任务分析→(拆分建议) |
| 2 | 管线 | `opc_pipeline_create` | 创建管线：写入 pipeline-plan.json + 逐条 init_sub |
| 3 | 管线 | `opc_pipeline_init_sub` | 初始化子管线：knowledge_open→brief→state.json |
| 4 | 管线 | `opc_pipeline_status` | 读取管线状态（支持子管线筛选） |
| 5 | 管线 | `opc_session_init` | Session 初始化：扫描孤儿管线，返回待恢复列表 |
| 6 | 管线 | `opc_pipeline_recover` | 手动恢复指定孤儿管线 |
| 7 | 管线 | `opc_pipeline_complete` | 管线完成：校验 + manifest.md |
| 8 | 管线 | `opc_pipeline_abort` | 管线取消：级联终止 |
| 9 | 管线 | `opc_pipeline_replan` | 管线修改：调整子管线列表和执行顺序 |
| 10 | 阶段 | `opc_phase_start` | 扫描 node，返回候选列表 |
| 11 | 阶段 | `opc_phase_adjust` | 调整节点列表，重新生成预览 |
| 12 | 阶段 | `opc_phase_confirm` | 锁定节点计划，写入 state，创建快照 |
| 13 | 阶段 | `opc_phase_complete` | 标记完成，返回推进指令 |
| 14 | 阶段 | `opc_phase_reset` | 从快照恢复 knowledge，下游级联 pending |
| 15 | 节点 | `opc_node_start` | node 开始执行（含 Agent 可用性校验） |
| 16 | 节点 | `opc_node_complete` | node 完成（L1 存在性 + L2 quality_gates 校验） |
| 17 | 节点 | `opc_node_fail` | node 失败（retry_count < max 时自动重试） |
| 18 | 节点 | `opc_node_retry` | 重跑 completed/failed node（自动级联重置下游） |

内部自动化行为：依赖解锁、阶段自动推进、管线孤儿检测。

### 1.3 引擎模块

| 引擎 | 职责 |
|------|------|
| state-manager | 管线状态读写、创建/恢复/完成/取消、质量校验、级联重置、超时检测 |
| phase-validator | 阶段转换校验、推进指令生成 |
| task-analyzer | LLM 任务分析（唯一调用 LLM 的引擎） |
| node-resolver | 节点依赖解析、冲突检测、拓扑排序 |

详见 [08 引擎](08-engine.md)。

---

## 二、管线级工具（9 个）

### 2.1 `opc_pipeline_start` — 任务分析

```
参数: user_message: string

内部串行步骤:
  ① intent-analysis → 判断意图
  ② knowledge_list（仅 task 意图）
  ③ task-analysis（仅 task 意图）
  ④ task-decomposition（仅 task + unit ≥ 2）

所有意图返回统一 schema：包含 intent + complexity（非 task 时为 null），
额外字段用可选 key，调用方按 intent 分发。
```

**统一返回 schema：**

```
{
  intent: "chat" | "general_question" | "project_question" | "task",
  complexity: "low" | "medium" | "high" | null   // 非 task 时为 null
}
```

**各意图返回示例：**

```
chat / general_question:
{ intent: "chat", complexity: null }

project_question:
{ intent: "project_question", complexity: null,
  results: [{ unit, section, subsection, snippet, score }, ...] }

task / complexity=low:
{ intent: "task", complexity: "low",
  description, tags, knowledge_unit, knowledge_context: {...} }

task / complexity=medium:
{ intent: "task", complexity: "medium",
  description, tags, knowledge_unit,
  suggested_phases, scenario_hints,
  sub_pipelines: null }

task / complexity=high (需拆分):
{ intent: "task", complexity: "high",
  description, tags, knowledge_unit,
  needs_decomposition: true,
  sub_pipelines: [{ id, title, knowledge_unit, blocked_by }, ...],
  execution_order: [...] }
```

### 2.2 `opc_pipeline_create` — 创建管线

```
参数:
  description: string
  complexity: medium | high
  sub_pipelines: [{
    id: string                    # sub-1, sub-2, ...
    title: string
    knowledge_unit: string[]
    suggested_phases: string[]
    blocked_by: string[]          # 依赖的其他子管线 id
  }]
  execution_order: [{
    group: number
    parallel?: string[]
    sequential?: string[]
  }]

行为:
  → 创建管线目录 .opc/pipelines/<id>/
  → 写入 pipeline-plan.json（含 sub_pipelines + execution_order + owner）
  → 逐条调用 init_sub 逻辑（knowledge_open → brief → state.json）
  → 返回 pipeline_id + 各子管线创建结果
```

### 2.3 `opc_pipeline_init_sub` — 初始化子管线

```
参数: pipeline_id, sub_pipeline_id, knowledge_unit[], suggested_phases[]

行为:
  → knowledge_open（只加载该子管线的 unit）
  → brief-generation（基于子管线范围）
  → 写入子管线 state.json
  → 更新 pipeline-plan.json 中该子管线的 status
```

### 2.4 `opc_pipeline_status` — 管线状态

```
参数:
  pipeline_id: string
  sub_pipeline_id?: string       # 可选，传入则只展示子管线详情

返回（带 sub_pipeline_id）:
  → state.json 完整内容：task、phases、所有 node 状态
  → 阻塞信息（blocked_by 还有哪些未完成）
  → 当前 in_progress 的 node + Agent
  → unblocked_nodes: 已解锁可立即启动的 node 列表

返回（拆分管线总览，不带 sub_pipeline_id）:
  → 各子管线状态聚合
  → ready_sub_pipelines: blocked_by 全部满足、可启动的子管线列表
```

### 2.5 `opc_session_init` — Session 初始化

```
参数: 无

行为:
  → 扫描 .opc/pipelines/*/pipeline-plan.json
  → 筛选 status: in_progress 的管线
  → 逐条检查 owner.pid 是否存活:
    ├── 进程存活 → 跳过（其他 session 正在跑）
    └── 进程已死 → 标记为孤儿管线
  → 不自动接管，仅返回待恢复列表

返回:
{
  orphans: [
    {
      pipeline_id: "pipeline-xxx",
      description: "实现用户认证系统",
      status: "in_progress",
      orphaned_at: "..."  // owner.since，原 session 的启动时间
    }
  ],
  active: [
    { pipeline_id: "pipeline-yyy", owner_session: "session-abc", status: "in_progress" }
  ]
}
```

孤儿管线不自动恢复。用户看到返回列表后，自行决定对哪些孤儿管线调用 `opc_pipeline_recover`。

调用时机：Claude Code session 启动时由 Claude 调用此工具，检测上次 session 是否有未完成的管线。

### 2.6 `opc_pipeline_recover` — 管线恢复

```
参数: pipeline_id

行为:
  → 读 pipeline-plan.json → 检查 owner.pid 是否存活
    ├── 存活 → 拒绝恢复，"管线正被 session xxx 执行中"
    └── 已死 → 更新 owner 为当前 session → 返回可恢复的 in_progress node 列表
  → 检查 in_progress node 的 started_at：
    超过 30 分钟无心跳 → 自动标记为 failed（error.type: timeout）
  → 不自动启动执行，由后续 opc_phase_start / opc_node_start 驱动
```

### 2.7 `opc_pipeline_complete` — 管线完成

```
参数: pipeline_id

行为:
  → 校验全部子管线 completed
  → pipeline-plan.json: status → completed
  → 生成 manifest.md（汇总所有子管线的产物清单）
  → 解除管线占用（owner 清空）
  → 清理快照目录
```

### 2.8 `opc_pipeline_abort` — 管线取消

```
参数: pipeline_id

行为:
  → pipeline-plan.json: status → aborted
  → 所有 in_progress 的子管线 → aborted
  → 所有 in_progress 的 phase → aborted
  → 所有 in_progress 的 node → aborted
  → 下游 pending 子管线保持 pending（不再推进）
  → 终止占用的 Agent（如有）
  → 清理快照目录
```

### 2.9 `opc_pipeline_replan` — 管线修改

```
参数:
  pipeline_id: string
  modifications: {
    add_sub_pipelines?: [{ id, title, knowledge_unit, blocked_by }]
    remove_sub_pipelines?: string[]
    update_execution_order?: [{ group, parallel, sequential }]
  }

行为:
  → 检查管线状态：任意子管线的第一个 phase 已启动 → 拒绝，"管线已进入执行阶段，不可修改"
  → 修改 pipeline-plan.json 的 sub_pipelines 和 execution_order
  → 对新增的子管线调用 init_sub（knowledge_open → brief → state.json）
  → 对移除的子管线清理目录 + state.json
  → 重新计算状态聚合 + ready_sub_pipelines

返回: { pipeline_id, updated: true, new_sub_pipelines: [...], ... }
```

限制：仅在第一个 phase 启动前可用。进入 phase 执行后锁定不可改。

---

## 三、阶段级工具（5 个）

### 3.1 `opc_phase_start` — 启动阶段

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 扫描 phases/<phase>/nodes/ + opc-nodes/ 对应目录
  → tag 交集过滤 → 语义匹配排序 → scenario 加权
  → 返回候选节点列表 + unblocked_nodes 信息

返回:
{
  phase: "04-implement-design",
  candidates: [
    {name: "api-design", score: 0.92, tags: ["api", "design"], recommended: true},
    {name: "database-schema", score: 0.78, tags: ["database"], recommended: true},
    {name: "scaffold", score: 0.65, tags: ["scaffold"], recommended: false}
  ],
  unblocked_nodes: ["api-design", "database-schema"]
}
```

### 3.2 `opc_phase_adjust` — 调整节点

```
参数: pipeline_id, sub_pipeline_id, phase, nodes: string[]

行为:
  → 重新生成阶段节点计划预览
  → node-resolver 基于新 node 列表重新解析依赖和分组
  → 返回新的执行计划（不锁定，等待 opc_phase_confirm 确认）

调用时机: opc_phase_start 之后、opc_phase_confirm 之前，可多次调用
```

### 3.3 `opc_phase_confirm` — 确认锁定

```
参数: pipeline_id, sub_pipeline_id, phase, nodes: [{name, blocked_by?}]

行为:
  → node-resolver 解析依赖（即使用户传了 blocked_by 也做校验 + 修正）
  → 文件域冲突检查（artifacts + knowledge 路径重叠 → 降级串行）
  → 写入 state.json phases[].nodes[] + blocked_by
  → 快照该 phase 节点的 output.knowledge 路径 → .opc/snapshots/
  → 锁定后不可再 opc_phase_adjust

返回: 执行分组 [{group: 1, nodes: [...], parallel: true}, ...]
```

### 3.4 `opc_phase_complete` — 完成阶段

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 校验当前 phase 所有 node 为 completed
  → 标记 phase.status: completed
  → 返回推进指令

返回:
{
  phase: "04-implement-design",
  status: "completed",
  next_phase: "05-implement",     # null 表示无后续 phase
  auto_advance: true,             # 高置信度=true，调用方无需确认直接推进
  next_phase_message: "进入 05-implement 编码阶段"
}
```

调用方（Claude）根据 `auto_advance` 决定：true → 直接调 `opc_phase_start`；false → 提示用户确认。

### 3.5 `opc_phase_reset` — 阶段重置

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 检查 .opc/snapshots/<pipeline_id>/<sub>/<phase>/ 有无快照
    ├── 有 → 复制快照文件回 opc-knowledge/ 对应路径
    └── 无 → 报错 "该 phase 无快照，请确认 phase_confirm 已执行"
  → 该 phase → pending（node 全部重置）
  → 下游 phase → pending
  → 返回 reset_phases + 受影响的 knowledge 路径

限制:
  - 仅恢复 opc-knowledge/ 下的 .md 文件，不碰 src/
  - 管线 aborted 后不可 reset（快照已清理）
  - 不依赖 git，未 commit 也能用
```

---

## 四、节点级工具（4 个）

### 4.1 `opc_node_start` — 开始执行

```
参数: pipeline_id, sub_pipeline_id, node_name

行为:
  ① 读取 node 定义，提取 agents.primary[]
  ② 扫描已安装 kit 的 plugin.json → 构建可用 Agent 集合
  ③ 逐一校验 primary Agent 是否在可用集合中
    → 不可用 → 立即返回 error，不等到执行中才发现：
      { status: "error", error: { type: "agent_unavailable", missing: ["backend-engineer"],
        message: "Agent backend-engineer 未在已安装 kit 中注册" } }
  ④ 全部可用 → 写入 input + status: in_progress + agent + started_at
  ⑤ 返回 input 知识列表供 Agent 加载

返回（成功）:
{ status: "in_progress", input: [...], agent: "backend-engineer" }
```

### 4.2 `opc_node_complete` — 完成（含质量校验）

详见 [§6.1 质量门](#61-质量门-l1--l2)。

```
参数: pipeline_id, sub_pipeline_id, node_name, evidence?

行为:
  ① L1 — 产出物存在性校验（始终执行）
  ② L2 — 质量门校验（仅当 node 声明了 quality_gates）
  ③ 全部通过 → 写入 output + evidence 摘要，标记 completed

返回（通过）:
{ status: "completed", unblocked_nodes: ["auth-integration"] }

返回（不通过）:
{ status: "rejected", failed_gates: [{type: "test_pass", reason: "..."}], suggestion: "修复后重新提交" }
```

### 4.3 `opc_node_fail` — 失败（自动重试）

```
参数: pipeline_id, sub_pipeline_id, node_name, error: {message, type}

行为:
  ① retry_count += 1，写入 error 到 state.json

  ② if retry_count < max_retries:
       → node status: failed → in_progress（自动重试，不级联）
       → 返回 { status: "auto_retrying", attempt: N, max: 3 }
     else:
       → node status: 保持 failed
       → 返回 { status: "failed", exhausted: true, blocked_nodes: [...] }
```

为什么失败重试不级联？失败节点没有产出新版本知识——output 为空或保持原样。下游 blocked 节点本来就在 pending，不需要额外重置。

### 4.4 `opc_node_retry` — 重跑（级联重置）

详见 [§6.2 级联重置逻辑](#62-级联重置逻辑)。

```
参数: pipeline_id, sub_pipeline_id, node_name

行为:
  → 检查 node.status ∈ [failed, completed]，否则拒绝
  → 计算影响面 → 自动级联重置下游 → 当前 node → in_progress

返回:
{ status: "in_progress", cascade_reset: { nodes: [...], phases: [...] } }
```

---

## 五、引擎职责

### 5.1 state-manager

管线状态的唯一读写入口。

- `start_pipeline()` — 意图识别→知识列表→任务分析（不创建管线）
- `create_pipeline()` — 创建目录 + 写入 pipeline-plan.json + 逐条 init_sub
- `init_sub_pipeline()` — knowledge_open → brief → state.json
- `abort_pipeline()` — 级联终止所有 in_progress 子管线/phase/node
- `complete_pipeline()` — 校验全部子管线 + manifest.md + 释放 owner
- `recover_pipeline()` — PID 检查 + owner 接管
- `session_init()` — 扫描所有管线，检测孤儿管线，返回待恢复列表
- `validate_node_completion()` — L1（产出物存在性）+ L2（quality_gates）
- `cascade_reset_after_retry()` — 计算下游影响面 + 自动重置
- `check_node_timeout()` — 惰性超时检测（在 MCP 工具调用时触发）

### 5.2 phase-validator

- `complete_phase()` — 校验全部 node completed，返回 `{next_phase, auto_advance}`
- 阶段跳过校验：被跳过的 phase 不能是后续 phase 的强制前置

### 5.3 node-resolver

- `resolve(phase, nodes)` — 依赖解析 + 冲突检测 + 拓扑排序
  - artifacts 冲突：`output.artifacts` 路径重叠 → 降级串行
  - knowledge 冲突：`output.knowledge` 路径重叠 → 降级串行
- `adjust(phase, nodes)` — 运行时调整节点列表并重新解析（不锁定）

### 5.4 task-analyzer

唯一调用 LLM 的引擎。加载 `task-analysis` 节点，用 haiku 分析用户意图。

- 输入: 用户消息 + knowledge_list 返回的已有 unit 列表及结构
- 输出: `{ intent, confidence, description, tags, complexity, suggested_phases, knowledge_unit, scenario_hints }`

---

## 六、横切关注点

### 6.1 质量门（L1 + L2）

`opc_node_complete` 是质量关卡的执行点，由 opc-state-server 强制执行，Agent 不可跳过。

**L1 — 产出物存在性**（始终执行，不可跳过）：

```
for each path in node_def.output.knowledge:
  检查 opc-knowledge/<path>.md 存在且 frontmatter.version ≥ 1
for each path in node_def.output.artifacts:
  检查工作区中路径存在
```

**L2 — 质量门**（仅当 node 声明了 quality_gates）：

| gate 类型 | 校验方式 |
|-----------|---------|
| `test_pass` | `evidence.test_results.failed === 0` |
| `lint_pass` | `evidence.lint_results.errors === 0` |
| `build_pass` | `evidence.build_passed === true` |
| `type_check_pass` | `evidence.type_check_passed === true` |

`evidence` 参数结构：

```json
{
  "summary": "TDD 实现完成：3 个测试文件，12/12 通过，0 lint 错误",
  "test_results": { "passed": 12, "failed": 0, "skipped": 0 },
  "lint_results": { "errors": 0, "warnings": 2 },
  "build_passed": true,
  "type_check_passed": true,
  "files_created": ["src/auth/login.ts", "tests/auth/login.test.ts"],
  "knowledge_written": [{"path": "user-auth/session/api", "version": 2}]
}
```

不声明 `quality_gates` 的节点只走 L1，向后兼容。

### 6.2 级联重置逻辑

`opc_node_retry` 触发，上游产出变了 → 下游全量失效 → 自动重置，不询问用户（git 兜底）。

```
opc_node_retry 内部级联算法:

① 计算影响面:
    同 phase: 扫描 blocked_by 包含当前 node 的已完成 node
    下游 phase: 所有已完成 node（上游变了，全量失效）

② 自动级联重置:
    for affected_node in affected_nodes:
      affected_node.status → pending
      清空 input_versions、output
    for affected_phase in affected_phases:
      affected_phase.status → pending

③ 当前 node → in_progress，Agent 开始重跑
```

三种重试的区别：

| 场景 | 触发 | 机制 | 是否级联 |
|------|------|------|---------|
| Agent 执行出错 | `opc_node_fail` | 自动重试当前 node | 否 |
| 节点超时 | `check_node_timeout` → `opc_node_retry` | 级联重置 + 重跑 | 是 |
| 手动重跑已完成 node | `opc_node_retry` | 级联重置 + 重跑 | 是 |

失败不级联的理由：失败节点没有产出新版本知识，下游 blocked 节点本来就在 pending。

### 6.3 超时检测

惰性检测，无后台线程。检测写在以下工具的函数体开头：

| 触发工具 | 时机 |
|---------|------|
| `opc_pipeline_status` | 用户查状态时 |
| `opc_phase_start` | 启动新 phase 时 |
| `opc_node_start` | 启动新 node 时 |
| `opc_pipeline_recover` | 恢复管线时 |

```
check_node_timeout(pipeline_id, sub_id):
  for node in current_sub_pipeline.phases[].nodes[]:
    if node.status != "in_progress": continue
    if !node.timeout_minutes: continue

    elapsed = now() - node.started_at
    if elapsed > node.timeout_minutes * 60:
      if node.retry_count < node.max_retries:
        → 自动 opc_node_retry（级联重置 + 重跑）
        → node.retry_count += 1
      else:
        → node.status → failed（error.type: timeout）
```

> **为什么不能做到定时自动检测？**
>
> Agent 执行 node 期间占着 Claude Code 的 turn。MCP server 是纯响应式的，只在收到 tool call 时才执行函数。Agent 卡死占着 turn → 无法向 MCP server 发请求 → 检测无法执行。这是 Claude Code 的架构边界。
>
> 实际流程：用户 Ctrl+C 后，Claude 在下个 turn 调任意 MCP 工具时，顺便完成超时检测和自动重试。

### 6.4 阶段重置（快照恢复）

分层回退策略：

| 层 | 场景 | 工具 |
|----|------|------|
| L0 | 调整节点选择 | `opc_phase_adjust` |
| L1 | 重做单个产出 | `opc_node_retry`（级联重置下游） |
| L2 | 废弃整个 phase 知识 | `opc_phase_reset`（快照恢复） |
| L3 | 全量回退（知识+代码） | git checkout/revert（OPC 不封装） |

快照在 `opc_phase_confirm` 时自动创建：扫描节点 `output.knowledge` 路径 → 复制到 `.opc/snapshots/`。管线 completed/aborted 时清理。

### 6.5 状态变更规则

#### 状态枚举

| 层级 | 可选值 |
|------|--------|
| pipeline | `pending` → `in_progress` → `completed` / `failed` / `aborted` |
| phase | `pending` → `in_progress` → `completed` / `blocked` |
| node | `pending` → `in_progress` → `completed` / `failed` |

#### 事件→操作映射

| 事件 | 操作 |
|------|------|
| 管线启动 | `opc_pipeline_start`（分析）→ `opc_pipeline_create`（创建） |
| 管线恢复 | `opc_pipeline_recover` — PID 检查 → 更新 owner → 返回断点 |
| 管线取消 | `opc_pipeline_abort` — 级联终止所有 in_progress |
| 管线完成 | `opc_pipeline_complete` — 校验 + manifest.md + 释放 owner |
| phase 开始 | `opc_phase_start` — 扫描 node，返回候选列表 |
| phase 确认 | `opc_phase_confirm` — resolver 锁定 + 快照 |
| phase 完成 | `opc_phase_complete` — 返回 {next_phase, auto_advance} |
| phase 重置 | `opc_phase_reset` — 快照恢复 + 下游 pending |
| node 开始 | `opc_node_start` — 写入 input + in_progress |
| node 完成 | `opc_node_complete` — L1+L2 校验 → 写入 output + completed |
| node 失败 | `opc_node_fail` — retry_count < max → auto in_progress；超限 → failed |
| node 重试 | `opc_node_retry` — 级联重置下游 + 重跑 |

#### input/output 规则

- **pending**: 不写入 input/output
- **in_progress**: 写入 input（与 node 定义一致）
- **completed**: 写入 output（实际产出路径 + evidence 摘要）
- **failed**: 保留 input，output 为空或部分写入，附加 error

#### error 类型

| error.type | 说明 |
|-----------|------|
| `agent_error` | Agent 执行异常，可 retry |
| `test_failure` | 测试未通过 |
| `dependency_failure` | 前置节点失败 |
| `quality_gate_failed` | L1/L2 校验不通过，node 保持 in_progress |
| `timeout` | 超时，retry_count 未达上限时自动重试 |
| `user_abort` | 用户通过 opc_pipeline_abort 中断 |

---

## 附录：完整调用链路

### 链路 A：单管线

```
用户: "实现用户认证系统"

① opc_pipeline_start("实现用户认证系统")
    → intent=task, complexity=medium, knowledge_unit=[user-auth]
    → 单 unit，不触发分解 → sub_pipelines=null
    ← 返回分析结果（管线未创建）

② opc_pipeline_create(sub_pipelines=[{id:sub-1, knowledge_unit:[user-auth], ...}])
    → 创建 .opc/pipelines/pipeline-xxx/
    → 写入 pipeline-plan.json（1 条子管线，1 个 group）
    → 内部调 init_sub → knowledge_open + brief + state.json
    ← 返回 pipeline_id

③ opc_phase_start(pipeline_id, "sub-1", "04-implement-design")
    ← 返回候选节点列表 [api-design, database-schema, scaffold]

④ opc_phase_adjust(...)  ← 用户反思，可能多次
    ← 返回更新后的预览

⑤ opc_phase_confirm(pipeline_id, "sub-1", "04-implement-design", nodes: [...])

⑥ 逐 node:
    opc_node_start → Agent 执行
      → opc_knowledge_get_batch([...])  ← 加载 input 知识
      → opc_knowledge_write(...)        ← 产出知识
    → 成功: opc_node_complete(evidence) | 失败: opc_node_fail → auto retry

⑦ opc_phase_complete(...) → {auto_advance: true, next_phase: "05-implement"}

⑧ 回到 ③ → opc_phase_start("05-implement") → 重复 ③-⑦

⑨ opc_pipeline_complete(pipeline_id) → 校验 + manifest.md + 释放 owner
```

### 链路 B：拆分管线

```
用户: "实现电商系统：商品+购物车+支付+用户中心"

① opc_pipeline_start(...)
    → knowledge_unit=[product, cart, order, payment, user-center]
    → 修改 unit ≥ 2 → task-decomposition 分析
    ← 返回拆分建议: 4 条子管线 + blocked_by + execution_order

② [用户确认拆分]

③ opc_pipeline_create(sub_pipelines=[sub-1(product), sub-2(user-center), sub-3(cart), sub-4(order+payment)], ...)
    → 写入 pipeline-plan.json（4 条子管线，3 个 group）
    → 逐条 init_sub

④ 按 execution_order 执行:
    Group 1: opc_phase_start(sub-1)  ∥  opc_phase_start(sub-2)
    Group 2: sub-3 的 blocked_by 已满足 → opc_phase_start(sub-3)
    Group 3: sub-4 (等 sub-3 + sub-2)

⑤ 全部子管线 completed → opc_pipeline_complete(pipeline_id)
```

### 链路 C：其他意图

```
project_question: "我们的用户认证是怎么设计的？"
  → opc_pipeline_start(...) → intent=project_question
  → opc_knowledge_search("用户认证设计")
  ← 匹配的知识条目 → Claude 基于上下文回答

general_question/chat: "Rust ownership 是什么？"
  → opc_pipeline_start(...) → intent=general_question
  ← 零 OPC 介入，Claude 直接回答

task/complexity=low: "修复登录按钮颜色"
  → opc_pipeline_start(...) → complexity=low
  ← Agent 直接执行，不走管线
```

### 链路 D：异常路径

```
中断恢复:
  opc_pipeline_recover(pipeline_id) → 检查 PID → 更新 owner → 返回断点

取消:
  opc_pipeline_abort(pipeline_id) → 全部 in_progress → aborted

回退:
  opc_phase_reset(pipeline_id, "sub-1", "04-implement-design")
  → 从 .opc/snapshots/ 恢复 knowledge → 下游 pending
  → opc_phase_start("04-implement-design") → 重新走

节点重跑:
  opc_node_retry(pipeline_id, "sub-1", "api-design")
  → 计算影响面 → 级联重置下游 6 个 node + 3 个 phase
  → api-design → in_progress → Agent 重新设计
```
