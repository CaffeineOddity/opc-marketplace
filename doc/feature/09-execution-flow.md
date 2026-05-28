# 执行流程

端到端执行流程：从用户输入到管线结束。

```
用户: 实现用户认证系统
         │
         ▼
┌─ 意图识别 ──────────────────────────────────────────────────┐
│  orchestrator 判断: 这是任务 → 启动管线                        │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 任务分析 ──────────────────────────────────────────────────┐
│  task-classifier agent (haiku) 分析:                          │
│    tags: [backend, auth, database]                            │
│    complexity: medium                                         │
│    suggested_stages: [02-planning, 04-implementation,         │
│                       05-testing]                             │
│    knowledge_feature: "user-auth"                             │
│    scenario_hints: [add-feature]                              │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 初始化 ────────────────────────────────────────────────────┐
│  opc_state_init:                                              │
│    → 创建/复用 knowledge feature "user-auth"                   │
│    → pipeline 初始化，无关阶段标记 skipped                     │
│    → 02-planning 进入 in_progress                             │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 阶段: 02-planning ─────────────────────────────────────────┐
│                                                              │
│  读取 nodes.md → 匹配信号 → 候选: [api-design, database-schema]│
│  用户确认 → resolver: Group 1 (并行) [api-design, db-schema]  │
│                                                              │
│  执行 Group 1:                                               │
│    entry-gate-check → knowledge-load → Agent →               │
│    knowledge-save (→ opc-knowledge) → exit-gate-check         │
│                                                              │
│  stage-transition → "planning 完成，进入实现?"                │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 阶段: 04-implementation ───────────────────────────────────┐
│                                                              │
│  匹配节点: [tdd-implementation, backend-endpoint,             │
│             auth-integration, security-review]                │
│                                                              │
│  resolver:                                                   │
│    Group 1 (并行): [backend-endpoint, tdd-implementation]     │
│    Group 2 (串行): [auth-integration]                        │
│    Group 3 (串行): [security-review]                         │
│                                                              │
│  逐组执行 → knowledge 流入 opc-knowledge/user-auth/           │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 阶段: 05-testing ─────────────────────────────────────────┐
│  ... 类似流程                                                │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ /opc-status ───────────────────────────────────────────────┐
│  pipeline 进度、节点状态、阻塞项、知识库概况                    │
└──────────────────────────────────────────────────────────────┘
```
