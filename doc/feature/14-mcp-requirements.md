# MCP 改进需求

对照完整流程逐环节排查后，两个 MCP 服务存在以下缺口和优化项。

## 一、opc-state-server 新增工具

### 1.1 `opc_pipeline_abort` — 管线取消

**缺口**：流程中 intent-analysis 已定义"先不做了 / cancel → 标记 aborted"，state 枚举有 `aborted`，但缺工具入口。

```
工具: opc_pipeline_abort
参数: pipeline_id (string)
行为:
  → pipeline-plan.json: status → aborted
  → 所有 in_progress 的子管线 → aborted
  → 所有 in_progress 的 phase → aborted
  → 所有 in_progress 的 node → aborted
  → 终止占用的 Agent（如有）
```

### 1.2 `opc_node_retry` — 失败节点重试

**缺口**：`opc_node_fail` 的 error 结构已有 `retry` 字段，但 failed 节点无法回到 in_progress。缺少从 failed 恢复的入口。

```
工具: opc_node_retry
参数: pipeline_id, sub_pipeline_id, node_name
行为:
  → node status: failed → in_progress
  → error.retry += 1
  → 重新加载 node 的 input（可能已被前置节点修复）
  → 下游 blocked 节点保持 blocked 直到本节点完成
限制: node.error.type = dependency_failure 时，需等前置节点先修复才能 retry
```

### 1.3 `opc_phase_adjust` — 反思阶段节点调整

**缺口**：`opc_phase_start` 返回候选列表后，用户在反思过程中增删 node，但没有任何工具记录调整结果。当前只能靠自然语言沟通，`opc_phase_confirm` 不知道最终选了哪些节点。

```
工具: opc_phase_adjust
参数: pipeline_id, sub_pipeline_id, phase, nodes: string[]
行为:
  → 重新生成阶段节点计划预览
  → node-resolver 基于新 node 列表重新解析依赖和分组
  → 返回新的执行计划（不锁定，等待 opc_phase_confirm 确认）
调用时机: opc_phase_start 之后、opc_phase_confirm 之前，可多次调用
```

### 1.4 `opc_pipeline_recover` — 手动管线恢复

**缺口**：恢复逻辑在 SessionStart 自动触发，但用户可能中途需要手动恢复一条已知孤儿管线。

```
工具: opc_pipeline_recover
参数: pipeline_id
行为:
  → 读 pipeline-plan.json → 检查 owner.pid 是否存活
    ├── 存活 → 拒绝恢复，返回 "管线正在被 session xxx 执行中"
    └── 已死 → 更新 owner 为当前 session → 返回可恢复的 in_progress node 列表
  → 检查 in_progress node 的 started_at：
    超过 30 分钟无心跳 → 自动标记为 failed（error.type: timeout）→ 可 opc_node_retry
  → 不自动启动执行，由后续 opc_phase_start / opc_node_start 驱动
```

> crash 恢复案例：Agent 在 opc_node_complete 之前 crash，node 卡在 in_progress 且无结果。recover 时靠超时检测自动降为 failed，用户直接 retry 即可，无需手动判断脏状态。

### 1.5 `opc_pipeline_complete` — 管线完成

**缺口**：当前设计里管线完成是隐式的（全部 phase completed → pipeline completed），但没有显式的收尾工具。manifest.md 生成和清理逻辑需要入口。

```
工具: opc_pipeline_complete
参数: pipeline_id
行为:
  → 校验全部子管线 completed
  → pipeline-plan.json: status → completed
  → 生成 manifest.md（汇总所有子管线的产物清单）
  → 解除管线占用（owner 清空）
```

---

## 二、opc-state-server 工具改造

### 2.1 `opc_pipeline_status` 支持子管线筛选

**缺口**：拆分管线有多条子管线，无法只看其中一条的详情。

```
opc_pipeline_status 新增参数:
  sub_pipeline_id?: string         # 可选，传入则只展示该子管线详情

返回（带 sub_pipeline_id 时）:
  → 子管线的 state.json 完整内容：task、phases、所有 node 状态
  → 阻塞信息（blocked_by 还有哪些未完成）
  → 当前 in_progress 的 node + Agent

返回（不带 sub_pipeline_id，拆分管线总览）:
  → 各子管线状态聚合
  → ready_sub_pipelines: ["sub-3"]  ← blocked_by 全部满足、可启动的子管线
```

### 2.2 `opc_pipeline_start` 瘦身为纯分析

**缺口**：原设计 `opc_pipeline_start` 内部串行 6 步（分析 + 创建 + 初始化），单管线和拆分管线路径不一致。

**改造后**：`opc_pipeline_start` 只做 ①②③（意图识别→知识列表→任务分析），返回分析结果。管线创建统一交给 `opc_pipeline_create`（§1.7）。

```
opc_pipeline_start 改造后:
参数: user_message: string
行为:
  → ① intent-analysis → 判断意图
    ├── general_question/chat → 返回 {intent}，结束
    ├── project_question → opc_knowledge_search → 返回 {intent, results}，结束
    └── task → 继续
  → ② knowledge_list → readdir 扫描已有 unit 目录结构
  → ③ task-analysis（haiku）→ 带知识上下文分析
    ├── complexity=low → 返回 {intent: task, complexity: low}，结束
    └── complexity=medium/high → 继续
  → 需修改 unit ≥ 2 → task-decomposition → 返回拆分建议
  → 返回完整分析结果（不含管线创建）
    complexity=low 时附带 knowledge_context（已有 unit/section 结构），Agent 参考但不强制加载

opc_pipeline_init_sub:
参数: pipeline_id, sub_pipeline_id, knowledge_unit[], suggested_phases[]
行为:
  → knowledge_open（只加载该子管线的 unit）
  → brief-generation（基于子管线范围）
  → 写入子管线 state.json
  → 更新 pipeline-plan.json 中该子管线的 status
```

### 2.3 `opc_phase_confirm` 入参明确

配合 `opc_phase_adjust`，`opc_phase_confirm` 需要显式接收确认的节点列表：

```
opc_phase_confirm 明确参数:
  pipeline_id, sub_pipeline_id, phase, nodes: [{name, blocked_by?}]
行为:
  → node-resolver 解析依赖（即使用户传了 blocked_by 也做校验 + 修正）
  → 文件域冲突检查
  → 写入 state.json phases[].nodes[] + blocked_by
  → 快照该 phase 节点的 output.knowledge 路径 → .opc/snapshots/
  → 锁定后不可再 opc_phase_adjust
```

---

## 三、opc-knowledge-server 简化与新增

### 3.1 取消 index.json，version 存入 .md frontmatter

**简化理由**：`index.json` 作为 version 的权威存储有 crash 不一致风险（先写 .md 再写 index.json，中间崩溃则 index.json 与实际文件不一致）。改为 version 存入 .md 文件的 frontmatter，文件系统是唯一真相源。`opc_knowledge_list` 用 readdir 扫描目录结构，`opc_knowledge_search` 走派生索引 `.opc-knowledge.idx`（可重建），`.opc-knowledge.json` 仅存 `_refs`。

```
影响范围:
  - 移除 index.json 文件
  - .md 文件新增 frontmatter: version, updated_at, pipeline_id, node
  - 新增 .opc-knowledge.json（仅 _refs）
  - 新增 .opc-knowledge.idx（搜索索引，派生数据）
  - opc_knowledge_write: 写入 frontmatter 而非更新 index.json
  - opc_knowledge_list: 改为 readdir 扫描目录
  - opc_knowledge_search: 走 .idx 索引
  - 新增 opc_knowledge_reindex: 全量重建搜索索引

.md frontmatter 示例:
---
version: 3
updated_at: "2026-06-06T10:30:00Z"
pipeline_id: "pipeline-001"
node: "api-design"
---

.opc-knowledge.json 示例:
{
  "_refs": {
    "authorization": ["user-auth"]
  }
}
```

### 3.2 `opc_knowledge_get` 增加 version 参数

**缺口**：node 可指定 `input.knowledge[].min_version`，但 get 工具没有版本入参。

```
opc_knowledge_get 新增参数:
  version?: number         # 可选。不传返回最新版本。

行为:
  min_version 校验由调用方（Agent / node 执行器）完成，不在 MCP 层
  MCP 层只负责按 version 返回对应内容
```

### 3.3 新增 `opc_knowledge_get_batch` — 批量读取

**缺口**：node 的 `input.knowledge` 通常 3-5 条，逐条调 get 浪费 round-trip。

```
工具: opc_knowledge_get_batch
参数: entries: [{unit, section, subsection, min_version?}]
返回: [{unit, section, subsection, content, version, updated_at, found}]
  found=false 表示不存在，Agent 知道需要从头设计
```

### 1.6 `opc_phase_reset` — 阶段重置（快照恢复）

**缺口**：原 `opc_phase_rollback` 通过降 version 为 0 实现回退，但依赖 git 且无法处理代码回退。改为分层策略：L0-L1 已有工具覆盖，L2 新增快照恢复，L3 交给 git。

```
工具: opc_phase_reset
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

快照在 `opc_phase_confirm` 时自动创建：扫描节点 `output.knowledge` 路径 → 复制到 `.opc/snapshots/`。管线 completed/aborted 时清理。

### 1.7 `opc_pipeline_create` — 创建管线结构

**缺口**：`opc_pipeline_start` 只做分析（①②③），返回结果后缺少一个工具来创建 pipeline-plan.json 并协调子管线初始化。单管线和拆分管线都需要它。

```
工具: opc_pipeline_create
参数:
  description: string           # 来自 task-analysis
  complexity: medium | high
  sub_pipelines: [{             # 确认后的子管线列表（单管线=1条）
    id: string                  # sub-1, sub-2, ...
    title: string
    knowledge_unit: string[]
    suggested_phases: string[]
    blocked_by: string[]        # 依赖的其他子管线 id
  }]
  execution_order: [{           # 计算好的执行分组
    group: number
    parallel?: string[]         # 并行子管线 id 列表
    sequential?: string[]       # 串行子管线 id 列表
  }]
行为:
  → 创建管线目录 .opc/pipelines/<id>/
  → 写入 pipeline-plan.json（含 sub_pipelines + execution_order + owner）
  → 逐条调用 init_sub 逻辑（knowledge_open → brief → state.json）
  → 返回 pipeline_id + 各子管线创建结果
```

### 1.7 阶段自动推进协议

**缺口**：`opc_phase_complete` 之后下一 phase 的 `opc_phase_start` 由谁调用不明确。不能全交给 MCP 内部静默处理——高置信度自动推进是合理的，但需要给调用方留钩子。

**方案**：`opc_phase_complete` 不自动调用 `opc_phase_start`，而是返回明确的推进指令，由 Claude（调用方）决定下一步。

```
opc_phase_complete 返回:
{
  phase: "04-implement-design",
  status: "completed",
  next_phase: "05-implement",   # null 表示无后续 phase，管线可完成
  auto_advance: true,           # 高置信度 → true，调用方无需用户确认直接推进
  next_phase_message: "进入 05-implement 编码阶段"
}
```

调用方（Claude）根据 `auto_advance` 决定：true → 直接调 `opc_phase_start`；false → 提示用户确认。

### 1.8 opc_node_complete 返回值

完成一个 node 后，state-manager 自动扫描当前 phase 内所有 pending node，检查其 `blocked_by` 是否全部 completed。将已解锁的 node 列表返回给调用方，Claude 无需轮询 `opc_pipeline_status`。

```
opc_node_complete 返回:
{
  node: "backend-endpoint",
  status: "completed",
  output: [...],
  unblocked_nodes: ["auth-integration"]   # blocked_by 已全部满足，可立即 opc_node_start
}
```

同理，`opc_node_retry` 成功后也返回 `unblocked_nodes`（如果重试的 node 原本阻塞了下游）。

`opc_phase_start` 返回的候选列表中也附带 `unblocked_nodes` 信息，方便恢复时直接定位可执行节点。

### 1.9 跨子管线推进协议

拆分管线场景中，一条子管线完成后可能解锁被它 block 的其他子管线。`opc_pipeline_status`（聚合视图）返回 `ready_sub_pipelines`，列出 blocked_by 全部满足的子管线。

```
opc_pipeline_status 返回（拆分管线）:
{
  pipeline_id: "pipeline-ecommerce-001",
  status: "in_progress",
  sub_pipelines: [
    {id: "sub-1", status: "completed"},
    {id: "sub-2", status: "completed"},
    {id: "sub-3", status: "pending", blocked_by: ["sub-1", "sub-2"]},
    {id: "sub-4", status: "pending", blocked_by: ["sub-3"]}
  ],
  ready_sub_pipelines: ["sub-3"]   # blocked_by 全部满足，可启动 phases
}
```

子管线失败的传播：若 sub-1 状态为 `failed`，sub-3 不会出现在 `ready_sub_pipelines` 中，直到 sub-1 通过 recovery/retry 恢复为 `completed`。

---

## 四、引擎改造

### 4.1 state-manager.ts

- 改造 `start_pipeline()` — 只做分析（①②③），返回分析结果，不创建管线，不写 pipeline-plan.json
- 新增 `create_pipeline()` — 实现 §1.7：创建管线目录、写入 pipeline-plan.json、逐条 init_sub
- 新增 `init_sub_pipeline()` — 实现 §2.2
- 新增 `abort_pipeline()` — 实现 §1.1
- 新增 `retry_node()` — 实现 §1.2
- 新增 `recover_pipeline()` — 实现 §1.4
- 新增 `complete_pipeline()` — 实现 §1.5，含 manifest.md 生成

### 4.2 phase-validator.ts

- `complete_phase()` 返回 §1.8 格式的推进指令，不自动调用 `opc_phase_start`
- 阶段跳过校验：被跳过的 phase 不能是后续 phase 的强制前置（如 05-implement 的前置 04-implement-design 不可跳过）

### 4.3 node-resolver.ts

- 新增 `adjust_nodes(phase, nodes)` — 实现 §1.3，支持运行时调整节点列表并重新解析

---

## 五、改造后完整工具清单

### opc-state-server（16 个工具）

| 工具 | 说明 | 变更 |
|------|------|------|
| `opc_pipeline_start` | 分析任务：意图识别→知识列表→任务分析→(需求拆分建议) | 改造：不再创建管线，只返回分析结果 |
| `opc_pipeline_create` | 创建管线：确认拆分→写入 pipeline-plan.json →逐条 init_sub | **新增** |
| `opc_pipeline_init_sub` | 初始化单条子管线：knowledge_open+brief+state | **新增** |
| `opc_pipeline_status` | 读取管线状态（支持子管线筛选） | 改造：加 sub_pipeline_id 参数 |
| `opc_pipeline_recover` | 手动恢复孤儿管线 | **新增** |
| `opc_pipeline_complete` | 管线完成：校验 + manifest.md | **新增** |
| `opc_pipeline_abort` | 管线取消 | **新增** |
| `opc_phase_start` | 扫描 node，返回候选列表 | 无变化 |
| `opc_phase_adjust` | 调整节点列表，重新生成预览 | **新增** |
| `opc_phase_confirm` | 锁定节点计划，写入 state | 改造：明确接收 nodes 参数 |
| `opc_phase_complete` | 标记 phase 完成，返回推进指令 | 改造：返回 {next_phase, auto_advance} |
| `opc_phase_reset` | 从快照恢复 knowledge，下游 phase/node → pending | **新增** — 替代原 opc_phase_rollback |
| `opc_node_start` | node 开始执行 | 无变化 |
| `opc_node_complete` | node 完成 | 无变化 |
| `opc_node_fail` | node 失败 | 无变化 |
| `opc_node_retry` | 失败节点重试 | **新增** |

### opc-knowledge-server（8 个工具）

| 工具 | 说明 | 变更 |
|------|------|------|
| `opc_knowledge_open` | 打开知识点，读 frontmatter 取 version | 改造：不再读 index.json |
| `opc_knowledge_get` | 读单条知识（支持 version） | 改造：加 version 参数 |
| `opc_knowledge_get_batch` | 批量读取知识 | **新增** |
| `opc_knowledge_write` | 写入 .md + frontmatter（version 等） | 改造：去 index.json，写 frontmatter |
| `opc_knowledge_delete` | 删除知识 | 改造：不再更新 index.json |
| `opc_knowledge_list` | readdir 扫描目录结构 | 改造：不再读 index.json |
| `opc_knowledge_search` | 全文搜索（走 .idx 索引） | 改造：走派生索引 |
| `opc_knowledge_reindex` | 全量重建搜索索引 | **新增** |

---

## 六、完整调用链路

### 链路 A：单管线（最常见的路径）

```
用户: "实现用户认证系统"

① opc_pipeline_start("实现用户认证系统")
    → intent=t task, complexity=medium, knowledge_unit=[user-auth]
    → suggested_phases=[04-implement-design,05-implement,06-testing]
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
    ← 锁定，返回执行分组

⑥ 逐 node:
    opc_node_start → Agent 执行
      → opc_knowledge_get_batch([...])  ← 加载 input 知识
      → opc_knowledge_write(...)        ← 产出知识
    → 成功: opc_node_complete | 失败: opc_node_fail → opc_node_retry

⑦ opc_phase_complete(pipeline_id, "sub-1", "04-implement-design")
    ← { auto_advance: true, next_phase: "05-implement", ... }

⑧ 回到 ③ → opc_phase_start("05-implement") → 重复 ③-⑦

⑨ opc_pipeline_complete(pipeline_id)
    → 校验全部 completed → 生成 manifest.md → 解除 owner
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
    → 逐条 init_sub（knowledge_open + brief + state）
    ← 返回 pipeline_id + 各子管线 state

④ 按 execution_order 执行:
    Group 1: opc_phase_start(sub-1)  ∥  opc_phase_start(sub-2)
      [两条子管线在各自 sub-pipeline 里独立推进 phases]
    → sub-1 完成 → opc_pipeline_complete(sub-1)?  ← 等等，子管线完成...
    
    Group 2: sub-3 的 blocked_by 已满足 → opc_phase_start(sub-3)
    Group 3: sub-4 (等 sub-3 + sub-2)
    
⑤ 全部子管线 completed → opc_pipeline_complete(pipeline_id)
```

> 注：子管线间"并行"在单 session 内实际是顺序执行。"parallel"只是标记它们无文件域冲突，可以由多个 session 并行跑。

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
  → opc_phase_start(上次的 phase) → 继续执行

取消:
  opc_pipeline_abort(pipeline_id) → 全部 in_progress → aborted

回退:
  opc_phase_reset(pipeline_id, "sub-1", "04-implement-design")
  → 从 .opc/snapshots/ 恢复 knowledge 文件
  → 下游 phase/node → pending
  → opc_phase_start("04-implement-design") → 重新走

### 涉及其他文档的联动改造

| 被影响文档 | 改动点 |
|-----------|--------|
| 03-knowledge.md | 移除 index.json，version 存 .md frontmatter，新增 .opc-knowledge.json(_refs) + .opc-knowledge.idx(搜索索引) + opc_knowledge_reindex |
| 06-state.md | state.json 去 `error.retry`（移到 node_retry 工具层），新增 skipped/aborted phase 状态 |
| 08-engine.md | 引擎职责更新：state-manager 新增 6 个方法，node-resolver 新增 adjust_nodes |
| 10-execution-flow.md | 流程中补上 abort/recover/skip/retry 分支 |
| 12-supplement.md | 回退改为分层策略（L0-L3），`opc_phase_reset` 快照恢复替代 `opc_phase_rollback` |
| 05-nodes.md | node 的 `input.knowledge.min_version` 校验说明 |
