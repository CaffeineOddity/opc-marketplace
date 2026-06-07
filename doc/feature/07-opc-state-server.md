# opc-state-server MCP 服务

管线状态管理的 MCP 服务，提供 19 个工具，覆盖管线/阶段/节点三层生命周期。内部由四个轻量引擎驱动。

---

## 一、原 Hook → MCP 工具对照

| 原 Hook | 新机制 |
|---------|--------|
| knowledge-load | Agent 调用 `opc_knowledge_get` / `opc_knowledge_get_batch` |
| knowledge-save | Agent 调用 `opc_knowledge_write` |
| phase-transition | `opc_phase_complete` 内部处理 |
| node-completion | `opc_node_complete` 内部解锁 blocked_by 节点 |
| capability-scan | `opc_phase_start` 内部扫描内置 + 项目 node |
| tdd-gate | `opc_node_complete` L2 校验 `test_pass` |
| verification-gate | `opc_node_complete` L1 + L2 校验 |

---

## 二、自动机制

以下行为由 MCP 工具内部自动处理：

**依赖解锁** — `opc_node_complete` 后自动检查 phase 内所有 pending node，将 blocked_by 已满足的标记为可执行。

**阶段自动推进** — `opc_phase_complete` 后检查下一 phase 置信度：
- 高置信度 → 自动 `opc_phase_start` 进入下一 phase
- 需确认 → 提示用户确认后推进

**节点超时自动重试** — `opc_pipeline_status`、`opc_phase_start`、`opc_node_start` 调用时惰性检测 in_progress node 是否超时。超时且未达重试上限时自动 `opc_node_retry`（含级联重置）。

**管线恢复** — SessionStart 时扫描 `.opc/pipelines/`，发现孤儿管线提示用户恢复。

---

## 三、工具速览（19 个）

### 管线级（9 个）

| # | 工具 | 说明 |
|---|------|------|
| 1 | `opc_pipeline_start` | 分析任务：意图识别→知识列表→任务分析→(拆分建议) |
| 2 | `opc_pipeline_create` | 创建管线：写入 pipeline-plan.json + 逐条 init_sub |
| 3 | `opc_pipeline_init_sub` | 初始化子管线：knowledge_open→brief→state.json |
| 4 | `opc_pipeline_status` | 读取管线状态（支持子管线筛选） |
| 5 | `opc_session_init` | Session 初始化：扫描孤儿管线，返回待恢复列表 |
| 6 | `opc_pipeline_recover` | 手动恢复指定孤儿管线 |
| 7 | `opc_pipeline_complete` | 管线完成：校验 + manifest.md |
| 8 | `opc_pipeline_abort` | 管线取消：级联终止 |
| 9 | `opc_pipeline_replan` | 管线修改：调整子管线列表和执行顺序 |

### 阶段级（6 个）

| # | 工具 | 说明 |
|---|------|------|
| 10 | `opc_phase_start` | 扫描 node，返回候选列表 |
| 11 | `opc_phase_adjust` | 调整节点列表，重新生成预览 |
| 12 | `opc_phase_confirm` | 锁定节点计划，写入 state，创建快照 |
| 13 | `opc_phase_complete` | 标记完成，返回推进指令 |
| 14 | `opc_phase_reset` | 从快照恢复 knowledge，下游级联 pending |
| 15 | `opc_phase_run` | 独立运行阶段（/comma），支持 dry-run / mock-inputs |

### 节点级（4 个）

| # | 工具 | 说明 |
|---|------|------|
| 16 | `opc_node_start` | node 开始执行（含 Agent 可用性校验） |
| 17 | `opc_node_complete` | node 完成（L1 + L2 校验） |
| 18 | `opc_node_fail` | node 失败（retry_count < max 自动重试） |
| 19 | `opc_node_retry` | 重跑 completed/failed node（自动级联重置下游） |

---

## 四、核心 API

### 4.1 opc_pipeline_start

```
参数: user_message: string

内部串行步骤:
  ① intent-analysis → 判断意图
  ② knowledge_list（仅 task 意图）
  ③ task-analysis（仅 task 意图）
  ④ task-decomposition（仅 task + unit ≥ 2）
```

返回统一 schema：`{ intent, complexity }`，额外字段按意图分发。

### 4.2 opc_pipeline_create

```
参数: description, complexity, sub_pipelines[], execution_order[]

行为:
  → 创建 .opc/pipelines/<id>/
  → 写入 pipeline-plan.json（含 sub_pipelines + execution_order + owner）
  → 逐条 init_sub（knowledge_open → brief → state.json）
  → 校验 execution_order 与 blocked_by 的拓扑一致性
```

### 4.3 opc_pipeline_status

```
参数: pipeline_id, sub_pipeline_id? (可选)

带 sub_pipeline_id → state.json 完整内容 + node 状态 + unblocked_nodes
不带 → 各子管线状态聚合 + ready_sub_pipelines
```

### 4.4 opc_pipeline_recover

```
参数: pipeline_id

行为:
  → 检查 owner.pid 是否存活
    ├── 存活 → 拒绝
    └── 已死 → 更新 owner 为当前 session
  → 检查 in_progress node 超时 → 标记 failed
  → 返回可恢复的 in_progress node 列表
```

### 4.5 opc_phase_start

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 扫描 phases/<phase>/nodes/ + opc-nodes/
  → tag 交集过滤 → 语义匹配排序 → scenario 加权

返回: { phase, candidates: [{name, score, tags, recommended}], max_reflection_rounds }
```

### 4.6 opc_phase_confirm

```
参数: pipeline_id, sub_pipeline_id, phase, nodes: [{name, blocked_by?}]

行为:
  → node-resolver 解析依赖（校验 + 修正用户传的 blocked_by）
  → 文件域冲突检查（artifacts + knowledge 路径重叠 → 降级串行）
  → 写入 state.json phases[].nodes[] + blocked_by
  → 快照节点 output.knowledge 路径 → .opc/snapshots/
```

### 4.7 opc_phase_complete

```
参数: pipeline_id, sub_pipeline_id, phase

返回: { phase, status, next_phase, auto_advance, next_phase_message }
```

调用方根据 `auto_advance` 决定自动推进或提示确认。

### 4.8 opc_phase_reset

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 从 .opc/snapshots/ 恢复 knowledge 文件
  → 该 phase → pending（node 全部重置）
  → 下游 phase → pending
```

### 4.9 opc_phase_run（/comma）

```
参数: phase, pipeline_id?, dry_run?, mock_inputs?, nodes?, report_path?

行为:
  ① 校验 phase-id 存在
  ② standalone（创建临时管线）或 attached（复用已有）
  ③ 输入检查 + mock 补齐
  ④ phase_start → 确认 → 逐 node 执行 → phase_complete
  ⑤ 清理临时管线（dry-run）/ 保留产物

返回: 阶段执行报告（nodes, knowledge_produced, duration_ms, warnings）
```

### 4.10 opc_node_start

```
参数: pipeline_id, sub_pipeline_id, node_name

行为:
  ① 读取 node 定义，提取 agents.primary[]
  ② 扫描已安装 kit → 构建可用 Agent 集合
  ③ 逐一校验 primary Agent 是否可用 → 不可用立即报错
  ④ 校验 input.knowledge 的 min_version 是否满足（L0）
  ⑤ 全部可用 → 写入 input + status: in_progress + agent + started_at
```

### 4.11 opc_node_complete

```
参数: pipeline_id, sub_pipeline_id, node_name, evidence?

行为:
  ① L1 — 产出物存在性校验（始终执行）
  ② L2 — 质量门校验（仅当 node 声明了 quality_gates）
  ③ 全部通过 → 写入 output + evidence 摘要，标记 completed
  ④ 自动解锁 blocked_by 下游节点

evidence 结构:
{
  "summary": "TDD 实现完成：3 个测试文件，12/12 通过",
  "test_results": { "passed": 12, "failed": 0, "skipped": 0 },
  "lint_results": { "errors": 0, "warnings": 2 },
  "build_passed": true,
  "type_check_passed": true,
  "files_created": ["src/auth/login.ts"],
  "knowledge_written": [{"path": "user-auth/session/api", "version": 2}]
}
```

### 4.12 opc_node_fail

```
参数: pipeline_id, sub_pipeline_id, node_name, error: {message, type}

行为:
  ① retry_count += 1，写入 error 到 state.json
  ② retry_count < max_retries → auto_retrying（不级联）
  ③ retry_count ≥ max_retries → exhausted（标记 failed）
```

### 4.13 opc_node_retry

```
参数: pipeline_id, sub_pipeline_id, node_name

行为:
  → 检查 node.status ∈ [failed, completed]，否则拒绝
  → 计算影响面:
      同 phase: blocked_by 包含当前 node 的已完成 node
      下游 phase: 所有已完成 node
  → 自动级联重置下游 → 当前 node → in_progress
```

---

## 五、完整调用链路

### 链路 A：单管线

```
用户: "实现用户认证系统"

① opc_pipeline_start → intent=task, complexity=medium
② opc_pipeline_create → 创建 pipeline-plan.json + init_sub
③ opc_phase_start("04-implement-design") → 候选节点
④ opc_phase_adjust / opc_phase_confirm → 锁定
⑤ 逐 node: opc_node_start → Agent → opc_node_complete
⑥ opc_phase_complete → auto_advance
⑦ 回到 ③ → 进入 05-implement → 重复
⑧ opc_pipeline_complete → manifest.md
```

### 链路 B：拆分管线

```
用户: "实现电商系统：商品+购物车+支付+用户中心"

① opc_pipeline_start → 拆分 → sub-1(product) ∥ sub-2(user-center)
                                       → sub-3(cart) → sub-4(order+payment)
② opc_pipeline_create → 写入 4 条子管线 + execution_order
③ 按 execution_order 执行: Group 1(sub-1∥sub-2) → sub-3 → sub-4
④ 全部 completed → opc_pipeline_complete
```

### 链路 C：其他意图

```
project_question → opc_knowledge_search → 注入上下文回答（不创建管线）
general_question / chat → 零 OPC 介入，Claude 直接回答
task / complexity=low → Agent 直接执行（无管线/无 phases/无 state）
```

### 链路 D：异常路径

```
中断恢复: opc_pipeline_recover → PID 检查 → 接管 → 返回断点
取消:     opc_pipeline_abort → 全部 in_progress → aborted
回退:     opc_phase_reset → 快照恢复 → 下游 pending
重跑:     opc_node_retry → 级联重置下游 → 重跑当前 node
```

---

## 六、内部引擎

opc-state-server 内部由四个轻量引擎驱动，均为 TypeScript 代码（非 prompt）：

```
platform/mcp/opc-state-server/engine/
├── state-manager.ts       # 管线状态读写、创建/恢复/完成/取消、质量校验、级联重置、超时检测
├── phase-validator.ts     # 阶段转换校验、推进指令生成
├── task-analyzer.ts       # LLM 任务分析（唯一调用 LLM 的引擎）
└── node-resolver.ts       # 节点依赖解析、冲突检测、拓扑排序
```

| 引擎 | 职责 |
|------|------|
| state-manager | 管线状态的唯一读写入口。启动/创建/恢复/完成/取消管线，node 状态变更（含 L1+L2 校验），级联重置，超时检测，SessionStart 扫描 |
| phase-validator | 校验阶段转换合法性：前置阶段完成、当前阶段节点 input 依赖满足。高置信度自动推进 |
| task-analyzer | 唯一调用 LLM 的引擎。加载 task-analysis 节点，用 haiku 分析意图。输入用户消息 + knowledge_list 上下文，输出 intent/description/tags/complexity/suggested_phases/knowledge_unit/scenario_hints |
| node-resolver | 对选中节点做依赖解析和拓扑排序。检查并行组冲突（artifacts + knowledge 路径重叠 → 降级串行）。opc_phase_confirm 和 opc_phase_adjust 时调用 |

---

## 七、相关文档

- [02 意图识别与任务分析](02-intent-analysis.md) — opc_pipeline_start 内部流程
- [04 管线](04-pipeline.md) — 管线创建与状态管理
- [05 阶段](05-phase.md) — 阶段工具详解
- [06 节点](06-node.md) — 节点工具详解
- [08 opc-knowledge-server](08-opc-knowledge-server.md) — 知识库 MCP 服务
