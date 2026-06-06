# 执行流程

端到端执行流程：从用户输入到管线结束。按意图分支。

## task 意图：按 complexity 分叉

complexity 在 task-analysis 判定后立即分叉。

### complexity = low：快速通道（无管线）

```
用户: "修复登录按钮颜色"
         │
         ▼
┌─ opc_pipeline_start ────────────────────────────────────────┐
│  ① 意图识别 → task                                            │
│  ② knowledge_list (轻量：仅读取相关 unit，不展开全量)           │
│  ③ task-analysis → complexity: low                          │
│                                                              │
│  low → 跳过管线，直接执行:                                     │
│    - 不创建 state.json                                       │
│    - 不生成 brief.md                                         │
│    - 不走 phases / nodes 选择流程                             │
│    - Agent 直接按任务描述执行改动                               │
│    - 必要时 Agent 自行调用 opc_knowledge_get 读取上下文         │
│    - 完成后可选调用 opc_knowledge_write 更新知识                │
└──────────────────────────────────────────────────────────────┘
```

判断 low 快速通道的条件：
- 不需要设计规划，简单修改即可完成
- Agent 可一次性解决，无需分轮推进

### complexity = medium / high：完整管线

```
用户: 实现用户认证系统
         │
         ▼
┌─ opc_pipeline_start (MCP 原子入口) ──────────────────────────┐
│  MCP 内部串行执行，外部一次调用:                                  │
│                                                              │
│  ① 意图识别 (pipeline/intent-analysis.md)                      │
│    → 分类: task (置信度 0.9)                                    │
│                                                              │
│  ② 知识列表 (knowledge_list)                                    │
│    → 已有 unit: [user-auth, authorization, subscription]      │
│    → user-auth 有 4 个 section: login, register, logout,      │
│       session                                                 │
│    → login/api(v2), session/api(v3)                             │
│    → register/api(v1) 已有初步内容                               │
│    → _refs: authorization 依赖 user-auth → 标记关联可读         │
│                                                              │
│  ③ 任务分析 (pipeline/task-analysis.md + haiku)                │
│    输入带知识上下文，基于项目真实状态分析:                         │
│    → 描述: "实现用户认证系统"                                    │
│    → tags: [backend, auth, database]                          │
│    → complexity: medium                                       │
│    → suggested_phases: [04-implement-design,05-implement,06-testing]              │
│    → knowledge_unit: ["user-auth"]                             │
│    → scenario_hints: [add-feature]                             │
│                                                              │
│  ③b 需求拆分 (pipeline/task-decomposition.md)                    │
│    当需要修改的 knowledge_unit ≥ 2 时触发（只读不计）:             │
│    → 修改的 unit 之间独立 → 拆分；互相 _refs → 合并               │
│    → 通过 _refs 推导管线间依赖                                    │
│    → 输出: sub_pipelines[] (含 blocked_by)                      │
│                                                              │
│    修改的 unit = 1 时跳过，直接进入 ④。                          │
│                                                              │
│  ④ 知识打开 (knowledge_open)                                    │
│    → 每条子管线独立加载对应 unit                                   │
│    → 不存在的 unit → 自动创建                                    │
│                                                              │
│  ⑤ 生成工作单 (pipeline/brief-generation.md)                     │
│    → 每条子管线独立生成自己的 brief.md                             │
│                                                              │
│  ⑥ 创建管线 + 管线编排计划                                        │
│    → 写入管线编排计划 pipeline-plan.json（子管线列表 + 依赖 + 执行分组）      │
│    → 每条子管线目录: state.json + brief.md + phases/              │
│    → 单管线仅 1 条子管线 (sub-1)                                  │
│    → 写入 task 元信息 + knowledge_unit + 关联 unit              │
│    → 04-implement-design → in_progress                              │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase: 04-implement-design (node: phase-execution) ──────────┐
│                                                              │
│  opc_phase_start("04-implement-design")                       │
│    → 扫描 phases/04-implement-design/nodes/ + opc-nodes/      │
│    → 候选节点: [api-design, database-schema, scaffold]        │
│    → tag 交集过滤 → 语义匹配排序 → scenario 加权               │
│    → 用户反思确认 (轮次由 phase 配置: medium=2, high=4)        │
│    → 反思中可多次 opc_phase_adjust 调整节点列表                  │
│    → opc_phase_confirm 锁定最终方案                             │
│    → node-resolver 解析依赖 → 写入阶段节点计划                   │
│                                                              │
│  阶段节点计划 (resolver 输出):                                   │
│    Group 1: [api-design, database-schema]  并行               │
│      → api-design: 读取 brief → 设计 API 端点                  │
│      → database-schema: 读取 api-design output → 建表         │
│    Group 2: [scaffold]                       串行              │
│      → scaffold: 基于 api-design + database-schema 搭建脚手架  │
│                                                              │
│  Agent 执行每个 node:                                          │
│    → opc_knowledge_get_batch 批量加载前置知识                   │
│    → 执行 node 指令 + 写入知识                                  │
│    → 收集 quality evidence（跑测试/跑 lint/构建验证）           │
│    → opc_node_complete(evidence) → state-server L1+L2 校验     │
│      ├── 通过 → completed → 解锁下游                           │
│      └── 不通过 → rejected → node 保持 in_progress → 修复重交  │
│    → 失败: opc_node_fail → retry_count < 3 → 自动 in_progress  │
│      重试（不暂停，不询问用户）                                  │
│    → retry_count ≥ 3 → 真正 failed → 下游 blocked 节点等待修复  │
│    → 若 node 有 timeout_minutes，Agent 在接近超时前主动          │
│      self-fail；若 Agent 全卡，用户 Ctrl+C 后惰性检测自动重试    │
│                                                              │
│  opc_phase_complete → 自动推进到 05-implement                  │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase: 05-implement (node: phase-execution) ────────────────┐
│                                                              │
│  opc_phase_start("05-implement")                              │
│    → 扫描 phases/05-implement/nodes/ + opc-nodes/             │
│    → 候选节点: [tdd-implementation, backend-endpoint,         │
│       frontend-component, auth-integration, security-review]  │
│    → tag 交集过滤 → 语义匹配排序 → scenario 加权               │
│    → 用户反思确认 (轮次由 phase 配置: medium=3, high=5)        │
│    → 反思中可多次 opc_phase_adjust 调整节点列表                  │
│    → opc_phase_confirm 锁定最终方案                             │
│    → node-resolver 解析依赖 → 写入阶段节点计划                   │
│                                                              │
│  阶段节点计划 (resolver 输出):                                   │
│    Group 1: [tdd-implementation, backend-endpoint]  并行       │
│    Group 2: [auth-integration]                       串行      │
│    Group 3: [security-review]                        串行      │
│                                                              │
│  Agent 执行每个 node:                                          │
│    → opc_knowledge_get_batch 批量加载前置知识                   │
│    → 执行 node 指令 + 写入知识                                  │
│    → 收集 quality evidence（跑测试/跑 lint/构建验证）           │
│    → opc_node_complete(evidence) → state-server L1+L2 校验     │
│      ├── 通过 → completed → 解锁下游                           │
│      └── 不通过 → rejected → node 保持 in_progress → 修复重交  │
│    → 失败可 opc_node_retry 重试                                │
│    → 若 node 有 timeout_minutes，Agent 在接近超时前主动          │
│      self-fail；若 Agent 全卡，用户 Ctrl+C 后惰性检测自动重试    │
│                                                              │
│  opc_phase_complete → 按 complexity 推进:                     │
│    medium→高置信度自动 / high→等用户确认                        │
│    → 下一 phase: 06-testing                                   │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase: 06-testing ─────────────────────────────────────────┐
│                                                              │
│  opc_phase_start("06-testing")                                │
│    → 扫描 phases/06-testing/nodes/ + opc-nodes/               │
│    → 候选节点: [accessibility-audit, ...]                     │
│    → 高置信度场景可自动推进（跳过反思确认）                       │
│                                                              │
│  ... 类似流程                                                  │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ /opc-status ───────────────────────────────────────────────┐
│  调用 opc_pipeline_status 展示进度、节点状态、阻塞项           │
└──────────────────────────────────────────────────────────────┘
```

### 管线中断与恢复流程

```
┌─ 管线取消 (opc_pipeline_abort) ───────────────────────────────┐
│  用户: "不做了" / "取消" / "cancel"                             │
│         │                                                     │
│         ▼                                                     │
│  opc_pipeline_abort(pipeline_id)                              │
│    → pipeline-plan.json: status → aborted                     │
│    → 所有 in_progress 子管线 → aborted                         │
│    → 所有 in_progress phase → aborted                         │
│    → 所有 in_progress node → aborted                          │
│    → 下游 pending 子管线保持 pending（不再推进）                  │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 管线恢复 (opc_pipeline_recover) ─────────────────────────────┐
│  SessionStart 自动扫描 或 用户手动触发                           │
│         │                                                     │
│         ▼                                                     │
│  opc_pipeline_recover(pipeline_id)                            │
│    → 检查 owner.pid 是否存活                                   │
│      ├── 存活 → 拒绝，"管线正被 session xxx 执行中"              │
│      └── 已死 → 更新 owner 为当前 session                       │
│    → 返回可恢复的 in_progress node 列表                         │
│    → 用户从断点继续: opc_phase_start → opc_node_start ...       │
└──────────────────────────────────────────────────────────────┘
```

### 节点重试

```
┌─ 节点重试 (opc_node_retry) — 全自动级联重置 ──────────────────┐
│  node → failed (test_failure: 3/12 tests failing)            │
│  或 user: "重跑 api-design，设计有遗漏"                        │
│         │                                                     │
│         ▼                                                     │
│  opc_node_retry(pipeline_id, sub_id, "api-design")           │
│    → 检查 node.status ∈ [failed, completed]，否则拒绝          │
│    → 计算影响面:                                                │
│       同 phase: blocked_by 包含 api-design 的已完成 node       │
│       下游 phase: 所有已完成 node                              │
│    → 自动级联重置（不询问用户）:                                 │
│       受影响 node → pending                                    │
│       受影响 phase → pending                                   │
│    → api-design → in_progress                                 │
│    → 返回 { cascade_reset: { nodes: [...], phases: [...] } }  │
│    → Agent 重新加载 input + 执行 node 指令                      │
│    → opc_node_complete → L1+L2 校验 → 解锁下游                 │
│    → 管线自然推进，与首次执行一致                                │
│                                                               │
│  回退: 用户觉得做错了 → git revert，git 就是确认按钮            │
│                                                               │
│  超时自动重试:                                                   │
│    10:00 node_start → Agent 卡死...                             │
│    10:45 用户 Ctrl+C → "继续"                                   │
│    → Claude 调 opc_pipeline_status                              │
│      → check_node_timeout(): 超时 45min, retry_count=0<3      │
│      → 自动 opc_node_retry → 级联重置 → 重跑                     │
└──────────────────────────────────────────────────────────────┘
```

## project_question 意图：轻量知识查询

```
用户: "我们的用户认证是怎么设计的？"
         │
         ▼
┌─ opc_pipeline_start ────────────────────────────────────────┐
│  ① 意图识别 → project_question                               │
│  ② opc_knowledge_search("用户认证设计")                       │
│     → 匹配: user-auth/login/architecture.md,                │
│             user-auth/session/api.md                        │
│  ③ 注入匹配到的知识上下文                                      │
│  ④ 基于项目知识回答                                           │
│                                                              │
│  不创建 state.json，不启动管线，不写入知识                      │
└──────────────────────────────────────────────────────────────┘
```

## general_question / chat 意图：零 OPC 介入

```
用户: "Rust 的 ownership 是什么？" / "你好"
         │
         ▼
  意图识别 → general_question / chat
         │
         ▼
  零 OPC 介入，Claude 直接回答
  不扫描知识库，不创建任何状态
```

> state.json 详细结构见 [06 管线状态](06-state.md)。
