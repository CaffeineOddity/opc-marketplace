# 执行流程

端到端执行流程：从用户输入到管线结束。按意图分支。

> 管线概念见 [16 管线](16-pipeline.md)。工具 API 详情见 [17 opc-state-server](17-mcp-state-server.md)。

---

## task 意图：按 complexity 分叉

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

### complexity = medium / high：完整管线

```
用户: 实现用户认证系统
         │
         ▼
┌─ opc_pipeline_start (分析) ──────────────────────────────────┐
│  ① 意图识别 → task                                            │
│  ② knowledge_list → 扫描已有 unit                             │
│  ③ task-analysis (haiku) → complexity: medium                │
│    → suggested_phases, knowledge_unit, scenario_hints        │
│  ③b (需修改 unit ≥ 2) → task-decomposition → 拆分建议         │
│    ← 返回分析结果（管线未创建）                                 │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ opc_pipeline_create ───────────────────────────────────────┐
│  → 创建管线目录 + 写入 pipeline-plan.json                      │
│  → 逐条 init_sub: knowledge_open → brief → state.json       │
│  → 04-implement-design → in_progress                              │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase: 04-implement-design ────────────────────────────────┐
│  opc_phase_start("04-implement-design")                       │
│    → 扫描 nodes/ + opc-nodes/                                │
│    → tag 交集过滤 → 语义匹配排序 → scenario 加权               │
│    → 用户反思确认 (可多次 opc_phase_adjust)                    │
│    → opc_phase_confirm 锁定方案                                │
│    → node-resolver 解析依赖 → 写入阶段节点计划                   │
│                                                              │
│  Agent 执行每个 node:                                          │
│    → opc_knowledge_get_batch 批量加载前置知识                   │
│    → 执行 node 指令 + 写入知识                                  │
│    → 收集 quality evidence（跑测试/跑 lint/构建验证）           │
│    → opc_node_complete(evidence) → state-server L1+L2 校验     │
│      ├── 通过 → completed → 解锁下游                           │
│      └── 不通过 → rejected → node 保持 in_progress → 修复重交  │
│    → 失败: opc_node_fail → retry_count < 3 → 自动 in_progress  │
│    → retry_count ≥ 3 → 真正 failed → 下游 blocked 节点等待修复  │
│                                                              │
│  opc_phase_complete → 自动推进到 05-implement                  │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase: 05-implement ──────────────────────────────────────┐
│  opc_phase_start("05-implement")                              │
│    → 扫描 phases/05-implement/nodes/ + opc-nodes/             │
│    → ... 类似流程                                              │
│                                                              │
│  opc_phase_complete → 按 complexity 推进:                     │
│    medium→高置信度自动 / high→等用户确认                        │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase: 06-testing ────────────────────────────────────────┐
│  ... 类似流程（高置信度场景自动推进）                            │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ /opc-status ──────────────────────────────────────────────┐
│  调用 opc_pipeline_status 展示进度、节点状态、阻塞项           │
└──────────────────────────────────────────────────────────────┘
```

---

## 管线中断与恢复

```
┌─ 管线取消 (opc_pipeline_abort) ───────────────────────────────┐
│  用户: "不做了" / "取消"                                       │
│    → pipeline-plan.json: status → aborted                     │
│    → 所有 in_progress 子管线/phase/node → aborted               │
│    → 下游 pending 子管线保持 pending（不再推进）                  │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 管线恢复 (opc_pipeline_recover) ─────────────────────────────┐
│  SessionStart 自动扫描 或 用户手动触发                           │
│    → 检查 owner.pid 是否存活                                   │
│      ├── 存活 → 拒绝，"管线正被 session xxx 执行中"              │
│      └── 已死 → 更新 owner 为当前 session                       │
│    → 返回可恢复的 in_progress node 列表                         │
│    → 用户从断点继续: opc_phase_start → opc_node_start ...       │
└──────────────────────────────────────────────────────────────┘
```

---

## 节点重试

```
┌─ opc_node_retry — 全自动级联重置 ────────────────────────────┐
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
│    → Agent 重新加载 input + 执行                                │
│    → opc_node_complete → L1+L2 校验 → 解锁下游                 │
│    → 管线自然推进，与首次执行一致                                │
│                                                               │
│  超时自动重试:                                                   │
│    10:00 node_start → Agent 卡死...                             │
│    10:45 用户 Ctrl+C → "继续"                                   │
│    → Claude 调 opc_pipeline_status                              │
│      → check_node_timeout(): 超时 45min, retry_count=0<3      │
│      → 自动 opc_node_retry → 级联重置 → 重跑                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 其他意图

### project_question：轻量知识查询

```
用户: "我们的用户认证是怎么设计的？"
         │
         ▼
  opc_pipeline_start → intent: project_question
  → opc_knowledge_search("用户认证设计")
  → 注入匹配到的知识上下文 → Claude 基于项目知识回答
  → 不创建 state.json，不启动管线，不写入知识
```

### general_question / chat：零 OPC 介入

```
用户: "Rust 的 ownership 是什么？" / "你好"
  → intent: general_question / chat
  → 零 OPC 介入，Claude 直接回答
```
