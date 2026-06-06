# OPC 完整链路测试

10 个输入从简单到复杂，逐条追踪 MCP 调用链，检查工具覆盖和流程完整性。

---

## 1. 闲聊 / 无 OPC 介入

**输入**："你好，今天天气怎么样"

```
opc_pipeline_start("你好，今天天气怎么样")
  → intent-analysis → intent: chat, confidence: 0.95
  → 返回 { intent: chat }
  → 零 OPC 介入，Claude 直接回答
```

**调用次数**：1（opc_pipeline_start）

**结论**：✓ 无缺口

---

## 2. 项目知识问答

**输入**："我们的用户认证是怎么设计的？"

```
opc_pipeline_start("我们的用户认证是怎么设计的？")
  → intent-analysis → intent: project_question, confidence: 0.9
  → opc_knowledge_search("用户认证设计")
    → 匹配: user-auth/login/architecture, user-auth/session/api
  → 返回 { intent: project_question, results: [...] }
  → Claude 注入知识上下文 → 回答用户
```

**调用次数**：1（opc_pipeline_start，内含 knowledge_search）

**结论**：✓ 无缺口。注意 `opc_pipeline_start` 内部跨服务调了 `opc_knowledge_search`，需确认 MCP server 间调用无障碍。

---

## 3. 低复杂度快速通道

**输入**："修复登录页按钮颜色不对"

```
opc_pipeline_start("修复登录页按钮颜色不对")
  → intent-analysis → intent: task
  → knowledge_list → user-auth 有 login, register, session
  → task-analysis(haiku)
    → complexity: low（不需要规划，简单修改）
    → knowledge_unit: [user-auth]
  → 返回 { intent: task, complexity: low, description: "修复登录按钮颜色", ... }
  → Agent 直接执行改动，不创建管线
```

**调用次数**：1（opc_pipeline_start），Agent 执行时可能自行调 `opc_knowledge_get`

**问题发现**：Agent 怎么知道要改哪个文件？当前设计是"Agent 自行决定是否需要 opc_knowledge_get"，但如果项目知识库里已有 `user-auth/login/ui.md`，Agent 应该被引导去读它。

**优化建议**：`opc_pipeline_start` 在 complexity=low 时仍可附带 knowledge_context（已有 unit 结构），不做 knowledge_open 但给 Agent 一个"你可以参考这些"的提示。

---

## 4. 中等复杂度单管线

**输入**："给用户认证系统加个短信验证码登录"

```
opc_pipeline_start("给用户认证系统加个短信验证码登录")
  → intent-analysis → task
  → knowledge_list → user-auth/login(v2), user-auth/session(v3)
  → task-analysis(haiku)
    → complexity: medium
    → knowledge_unit: [user-auth]  ← 只改 1 个 unit
    → suggested_phases: [04-implement-design, 05-implement, 06-testing]
    → scenario_hints: [add-feature]
  → 修改 unit 数 = 1，不触发 task-decomposition
  → 返回分析结果

opc_pipeline_create(sub_pipelines: [{id: sub-1, knowledge_unit: [user-auth], ...}])
  → 创建 pipeline-plan.json
  → init_sub(sub-1): knowledge_open("user-auth") → brief → state

opc_phase_start("04-implement-design")
  → 候选: [api-design(0.92), database-schema(0.78)]
  → 用户确认 → opc_phase_confirm
  → resolver: Group1[api-design, database-schema] 并行

opc_node_start("api-design") → Agent:
  → opc_knowledge_get_batch([
      {unit: user-auth, section: login, subsection: api},
      {unit: user-auth, section: session, subsection: api}
    ])
  → 设计短信验证码 API → opc_knowledge_write(user-auth, login, api, content)
  → opc_node_complete → { unblocked_nodes: [] }

opc_node_start("database-schema") → Agent:
  → opc_knowledge_get_batch([...])
  → 添加验证码表 → opc_knowledge_write(...)
  → opc_node_complete → { unblocked_nodes: [] }

opc_phase_complete → { next_phase: "05-implement", auto_advance: true }

[claude 自动推进，不等用户]

opc_phase_start("05-implement")
  → 候选: [tdd-implementation(0.88), backend-endpoint(0.82), security-review(0.65)]
  → 用户反思 → opc_phase_adjust → opc_phase_confirm
  → Group1[tdd-implementation, backend-endpoint] → Group2[security-review]

opc_node_start("tdd-implementation") → ...
opc_node_start("backend-endpoint") → ...
opc_node_complete("tdd-implementation") → { unblocked_nodes: [] }
opc_node_complete("backend-endpoint") → { unblocked_nodes: ["security-review"] }

opc_node_start("security-review") → ... → opc_node_complete
  → { unblocked_nodes: [] }  ← phase 完成

opc_phase_complete → { next_phase: "06-testing", auto_advance: true }
opc_phase_start("06-testing") → ...
opc_phase_complete → { next_phase: null }
opc_pipeline_complete → manifest.md
```

**问题发现**：opc_node_complete("backend-endpoint") 返回 `unblocked_nodes: ["security-review"]`，但 `tdd-implementation` 也在同一 group 并行跑，可能还没完成。security-review 的 blocked_by 里如果有 tdd-implementation，那它不应该在 backend-endpoint 完成时被解锁。

**优化建议**：`unblocked_nodes` 只在某个 node 的 blocked_by **全部**满足时才返回。state-manager 的扫描逻辑要精确——只当所有 blocked_by 节点 completed 时才加入 unblocked_nodes。这不是设计问题，是实现细节需要注意。

---

## 5. 高复杂度单管线

**输入**："重构 user 模块，把 session 管理从 cookie 改成 JWT"

```
opc_pipeline_start(...)
  → complexity: high（改协议，影响面大）
  → knowledge_unit: [user-auth]  ← 只改 1 个 unit
  → suggested_phases: [04-implement-design, 05-implement, 06-testing]
  → 单管线

opc_pipeline_create → init_sub

opc_phase_start("04-implement-design")
  → 高复杂度：不可跳过任何匹配节点，候选全进
  → 候选: [api-design(0.92), database-schema(0.78), scaffold(0.72)]
  → 反思轮次: high → max_reflection_rounds=4

... [执行流程同 #4，但每节点更严格]

opc_phase_complete("04-implement-design")
  → auto_advance: false（high 复杂度每阶段需用户确认）

opc_phase_start("05-implement")
  → ... [同理]

opc_pipeline_complete
```

**问题发现**：high 复杂度的 `auto_advance=false` 正确，但 `opc_phase_complete` 返回的 `auto_advance` 由谁决定？

**优化建议**：`auto_advance` 的计算规则需在 phase-validator 中明确定义：`complexity=high → phase_complete 时默认 auto_advance=false`；`medium → 当 scenario_hints 命中高置信度场景 + 语义相似度 > 0.9 时 auto_advance=true`。

---

## 6. 拆分管线（3 条子管线）

**输入**："实现商品管理 + 购物车功能"

```
opc_pipeline_start(...)
  → knowledge_unit: [product, cart]
  → 需修改 unit 数 = 2 → 触发 task-decomposition

task-decomposition 分析:
  → cart 引用 product 的数据模型 → cart._refs: [product]
  → sub-1: product（无依赖）
  → sub-2: cart（blocked_by: [sub-1]）
  → execution_order: Group1[sub-1] → Group2[sub-2]

返回 { needs_decomposition: true, sub_pipelines: [...], execution_order: [...] }

[用户确认拆分]

opc_pipeline_create(...)
  → pipeline-plan.json + init_sub(sub-1) + init_sub(sub-2)

opc_phase_start(sub-1, "04-implement-design") → ... → opc_phase_complete
  → sub-1 的各 phase 跑完

opc_pipeline_status → sub-1: completed, sub-2: pending
  → sub-2 的 blocked_by [sub-1] 已满足 → 可启动

opc_phase_start(sub-2, "04-implement-design") → ... → opc_pipeline_complete
```

**问题发现**：谁负责检查 `sub-2` 的 blocked_by 已满足并启动它？当前设计里，`opc_node_complete` 返回 phase 内部的 unblocked_nodes，但跨子管线的 blocked_by 没有对应的通知机制。

**优化建议**：`opc_pipeline_status` 返回中应包含 `ready_sub_pipelines: ["sub-2"]`——blocked_by 已全部满足、等待启动的子管线 ID。Claude 在看到 pipeline_status 或 opc_phase_complete 的结果后据此启动。

---

## 7. 拆分管线（5 条子管线，电商完整）

**输入**："实现完整电商系统：商品管理 + 用户中心 + 购物车 + 下单支付"

```
opc_pipeline_start(...)
  → knowledge_unit: [product, user-center, cart, order, payment]
  → task-decomposition:
    sub-1: product（无依赖）
    sub-2: user-center（无依赖）
    sub-3: cart（blocked_by: [sub-1, sub-2]）
    sub-4: order+payment（blocked_by: [sub-3, sub-2]）
  → execution_order: Group1[sub-1 ∥ sub-2] → Group2[sub-3] → Group3[sub-4]

opc_pipeline_create → pipeline-plan.json + 4×init_sub

执行顺序:
  Group1: sub-1 phases... | sub-2 phases... （单 session 内顺序执行）
    → sub-1 completed → 检查 ready_sub_pipelines
    → sub-2 completed → ready_sub_pipelines 包含 sub-3 ✓
  
  Group2: sub-3 phases...
    → sub-3 completed → ready_sub_pipelines 包含 sub-4 ✓
  
  Group3: sub-4 phases...
    → opc_pipeline_complete
```

**问题发现 1**：单 session 内"并行"实质是顺序执行。sub-1 和 sub-2 的 phases 交替推进（sub-1 phase 1 → sub-2 phase 1 → sub-1 phase 2 → sub-2 phase 2 → ...）还是 sub-1 全部跑完再 sub-2？

**设计决策**：单 session 内交错推进（如 sub-1 跑完 04 再跑 sub-2 的 04 再跑 sub-2 的 05...），更自然。Claude 通过 `opc_pipeline_status` 查看全局，按自己的判断调度。

**问题发现 2**：如果 sub-1 在执行过程中 opc_node_fail，sub-2 不受影响（它们不互相 blocked_by）。sub-3 应该继续等待 sub-1 修复。

**优化建议**：`opc_pipeline_status` 返回的 `ready_sub_pipelines` 不包含 failed 子管线的 downstream。这是 state-manager 的聚合逻辑，应在设计文档中明确。

---

## 8. 管线恢复

**输入**：（断电重连，上次在 05-implement/tdd-implementation 中间）

```
SessionStart:
  → state-manager 扫描 .opc/pipelines/
  → 发现 pipeline-001，status: in_progress
  → 检查 owner.pid → 进程已死 → 提示用户

用户: "恢复"

opc_pipeline_recover("pipeline-001")
  → 更新 owner → 返回断点:
    {
      pipeline_id: "pipeline-001",
      sub_pipelines: [{id: "sub-1", in_progress_phase: "05-implement"}],
      current_node: "tdd-implementation",
      status: "failed"     ← 上次执行到一半 crash，状态未知
    }

opc_phase_start("05-implement") → 节点列表
  → tdd-implementation 仍为 in_progress → 需重新 opc_node_start
  → 或在 crash 前已 opc_node_fail → 需 opc_node_retry
```

**问题发现**：crash 时的脏状态。如果 Agent 在 `opc_node_start` 之后、`opc_node_complete`/`opc_node_fail` 之前 crash，node 状态是 `in_progress`，但 Agent 已死。恢复时无法判断 Agent 干了多少。

**优化建议**：`opc_pipeline_recover` 将 `in_progress` 且超时（如超过 30 分钟未心跳）的 node 自动标记为 `failed`（error.type: `timeout`），方便用户直接调 `opc_node_retry` 重跑，避免需要手动判断状态。

---

## 9. 阶段重置

**输入**："api 设计有问题，回到 04-implement-design 重新规划"

```
当前: 05-implement/backend-endpoint 执行中

opc_phase_reset(pipeline_id, sub-1, "04-implement-design")
  → 从 .opc/snapshots/.../04-implement-design/ 恢复 knowledge 文件
  → 04-implement-design → pending（所有 node 重置）
  → 05-implement → pending（下游级联）
  → 06-testing → pending
  → 返回 { reset_phases: [...] }

opc_phase_start("04-implement-design")
  → 重新走节点选择 → 确认 → 执行

opc_node_start("api-design") → Agent 重新设计
  → opc_knowledge_get_batch → 加载快照恢复后的知识
  → 重新设计方案
  → opc_knowledge_write → version 正常递增

... 重新走完整 phase
```

**结论**：✓ 链路完整。快照恢复不依赖 git。

---

## 10. 取消管线

**输入**："不做了，取消"


```
opc_pipeline_abort("pipeline-001")
  → pipeline-plan.json: status → aborted
  → sub-1: in_progress → aborted
    → 04-implement-design: completed（保持不变）
    → 05-implement: in_progress → aborted
      → tdd-implementation: completed → 保持
      → backend-endpoint: in_progress → aborted
      → auth-integration: pending → 保持 pending
    → 06-testing: pending → 保持 pending

SessionStart 扫描跳过 aborted 管线（不提示恢复）
```

**结论**：✓ 链路完整。

---

## 汇总

### 发现的问题

| # | 测试 | 问题 | 解决方案 |
|---|------|------|---------|
| 1 | #3 | low 复杂度时 Agent 缺知识引导 | `opc_pipeline_start` 附带 knowledge_context 提示 |
| 2 | #6 | 跨子管线的 ready 检测无通知 | `opc_pipeline_status` / `opc_phase_complete` 返回 `ready_sub_pipelines` |
| 3 | #7 | 子管线失败对 downstream 的影响 | state-manager 聚合：下游不 ready 直到 upstream 修复 |
| 4 | #8 | crash 导致的脏 in_progress 状态 | `opc_pipeline_recover` 自动 timeout 检测，标记 failed |

### 优化的建议

| # | 优化点 | 说明 |
|---|--------|------|
| 1 | opc_phase_start 附带 context | 已有实现：phase_start 读取 brief.md；无需额外改动 |
| 2 | unblocked_nodes 返回机制 | 已在 §1.8 文档化；跨子管线用 ready_sub_pipelines |
| 3 | auto_advance 计算规则 | §1.7 已定义；high→false，medium→看 confidence |
| 4 | 管线超时心跳 | 可选。node 执行时 state-manager 记录心跳，opc_pipeline_recover 据此判断 |
