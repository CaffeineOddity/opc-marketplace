# 05 第五步：Phase 05-implement

> 本文档是 [walkthrough 总览](00_overview.md) 的子文档。其他子文档：
> [用户输入](01_user-input.md) · [流程启动](02_flow-startup.md) · [brief → create](03_brief-to-create.md) · [phase 04](04_phase-04-implement-design.md) · [phase 06](06_phase-06-testing.md) · [pipeline 完成](07_pipeline-complete.md)

---

## 5.1 opc_phase_start

```
opc_phase_start("pipeline-20260606-001", "sub-1", "05-implement")
```

扫描节点：
- `phases/05-implement/nodes/` → [tdd-implementation, frontend-component, backend-endpoint, auth-integration, security-review, ...]

匹配：
```
任务 tags: [backend, auth, database]

tag 交集:
  tdd-implementation:  [backend, database] → 候选
  backend-endpoint:    [backend, database] → 候选
  auth-integration:    [auth, backend]     → 候选
  security-review:     [security]          → 交集 0 → 但 auth 任务推荐保留
  frontend-component:  [frontend]          → 交集 0 → 排除

语义匹配:
  "实现用户认证系统（邮箱注册登录 + 会话管理）"
    vs "认证系统集成"                  → auth-integration: 0.92
    vs "TDD 驱动的后端功能实现"        → tdd-implementation: 0.85
    vs "实现后端 API 端点"            → backend-endpoint: 0.78
    vs "安全审查"                      → security-review: 0.68

最终排序:
  1. auth-integration       1.22  ← 推荐
  2. tdd-implementation     1.15  ← 推荐
  3. backend-endpoint       1.08  ← 推荐
  4. security-review        0.98  ← 推荐（auth 任务保留）
```

---

## 5.2 收集 selection_evidence → P5 反思调整

Claude 拿到排序结果后，收集第一轮 `selection_evidence`：

```
第 1 轮 selection_evidence = {
  matched_tags: [
    {node: "auth-integration",    tags: ["auth", "backend"]},
    {node: "tdd-implementation",  tags: ["backend"]},
    {node: "backend-endpoint",    tags: ["backend"]},
    {node: "security-review",     tags: []}            // scenario 强制保留
  ],
  scenario_hits: ["tdd-implementation"],
  file_domain_conflicts: [
    {between: ["auth-integration", "backend-endpoint"], reason: "src/auth/ 路径与 RESTful endpoint 实现重叠"}
  ],
  blocked_by_graph: [],
  coverage_gaps: []
}

reflection-server P5 判定:
  V1-V3: ok
  V4 coverage:       ok
  V5 discrimination: fail (file_domain_conflicts 非空)
  meta-validator:    保留 1 条严重 objection "auth-integration 已涵盖认证端点实现，backend-endpoint 冗余"
  → 路径 C 反思循环（primary=M4 Critique）
```

Claude 调用 `opc_flow_reflect`，按 M4 Critique 调整：

```
opc_flow_reflect(
  step_id: "node_selection",
  round: 1,
  evidence_diff: {removed: ["backend-endpoint"], added: [], modified: []},
  validator_result: {V5: "fail"},
  notes: "auth-integration 已涵盖认证端点实现，移除 backend-endpoint 消除文件域冲突"
)

第 2 轮 selection_evidence = {
  matched_tags: [...3 个节点...],
  scenario_hits: ["tdd-implementation"],
  file_domain_conflicts: [],         // 已消除
  blocked_by_graph: [],
  coverage_gaps: []
}

reflection-server P5 判定:
  V1-V5: 全 ok
  meta-validator: objections_kept_by_meta = 0
  → 跳出反思，路径 A 自动确认

Claude 通知用户:
  "05-implement 经 1 轮反思调整已确认 3 个节点（P5 evidence 通过 V1-V5）:
   - 反思移除: backend-endpoint（与 auth-integration 文件域冲突）
   - 最终保留: auth-integration + tdd-implementation + security-review
   如需调整，回复'调整节点'。"
```

```
opc_phase_confirm("pipeline-20260606-001", "sub-1", "05-implement",
  nodes: ["auth-integration", "tdd-implementation", "security-review"])
```

node-resolver 重新解析：
```
auth-integration.input:    [knowledge: user-auth/session/model]
                           → 已在 04-implement-design 产出 → 无 phase 内依赖

tdd-implementation.input:  [knowledge: user-auth/login/api,
                             knowledge: user-auth/session/api]
                           → 已在 04-implement-design 产出 → 无 phase 内依赖

security-review.input:     [knowledge: user-auth/login/api,
                             knowledge: user-auth/session/api]
                           → 无 phase 内依赖

文件域检查:
  tdd-implementation.output.artifacts: [src/, tests/]
  auth-integration.output.artifacts:   [src/auth/]
  → artifacts 重叠 src/ → 不能并行

knowledge 冲突检查:
  tdd-implementation.output.knowledge:      [user-auth/session/api]
  auth-integration.output.knowledge:        [user-auth/register/architecture, user-auth/session/api]
  → knowledge 重叠 user-auth/session/api → 不能并行

拓扑排序:
  Group 1: [auth-integration]      ← 无 blocked_by，先执行
  Group 2: [tdd-implementation]    ← artifacts + knowledge 双重冲突，降级串行
  Group 3: [security-review]       ← 等前两个完成后审查完整模块
```

返回新预览 → 用户确认 → `opc_phase_confirm`

---

## 5.3 执行 Node: tdd-implementation

```
opc_node_start("pipeline-20260606-001", "sub-1", "tdd-implementation")
```

Agent 执行：
```
① opc_knowledge_get_batch([
     {unit: "user-auth", section: "login", subsection: "api"},
     {unit: "user-auth", section: "register", subsection: "api"},
     {unit: "user-auth", section: "session", subsection: "api"},
     {unit: "user-auth", section: "session", subsection: "model"},
     {unit: "user-auth", section: "login", subsection: "architecture"}
   ])
   → 全部 version≥1，满足要求

② RED: 写测试用例
   tests/auth/register.test.ts
   tests/auth/login.test.ts
   tests/auth/session.test.ts
   → 运行 → 全红（失败） ✓

③ GREEN: 最小实现
   src/auth/register.ts
   src/auth/login.ts
   src/auth/session.ts
   src/models/user.ts
   src/models/session.ts
   → 运行测试 → 全绿 (12/12) ✓

④ REFACTOR: 重构
   提取公共逻辑，改善命名
   → 运行测试 → 仍然全绿 ✓

⑤ 运行 lint → 0 errors, 2 warnings

opc_node_complete("pipeline-20260606-001", "sub-1", "tdd-implementation",
  evidence: {
    summary: "TDD 实现完成：3 个测试文件，12/12 通过，lint 0 errors",
    test_results: { passed: 12, failed: 0, skipped: 0 },
    lint_results: { errors: 0, warnings: 2 },
    files_created: [
      "src/auth/register.ts", "src/auth/login.ts", "src/auth/session.ts",
      "src/models/user.ts", "src/models/session.ts",
      "tests/auth/register.test.ts", "tests/auth/login.test.ts", "tests/auth/session.test.ts"
    ],
    knowledge_written: []
  }
)
→ L1 校验: artifacts 路径存在 ✓
→ L2 校验: test_pass ✓ (failed=0), lint_pass ✓ (errors=0)
→ completed
```

返回：
```json
{
  "node": "tdd-implementation",
  "status": "completed",
  "output": [
    { "type": "artifacts", "paths": ["src/auth/", "src/models/", "tests/auth/"] }
  ],
  "unblocked_nodes": ["auth-integration"]
}
```

---

## 5.4 执行 Node: auth-integration

```
opc_node_start("pipeline-20260606-001", "sub-1", "auth-integration")
```

Agent 执行：
```
① opc_knowledge_get_batch([
     {unit: "user-auth", section: "session", subsection: "model", min_version: 1}
   ])
   → session model v1 ✓

② 集成认证流程:
     - 密码哈希（bcrypt）
     - Session token 生成 + 验证中间件
     - 登录/登出/注册 路由注册
     - 错误处理和输入校验

③ opc_knowledge_write("user-auth", "register", "architecture",
     "# 注册流程架构\n\n邮箱唯一性校验 + 密码强度 + bcrypt 哈希\n..."
   )
   → version: v1

④ opc_knowledge_write("user-auth", "session", "api",
     "# 会话 API（更新）\n\n增加 token 刷新机制\n..."
   )
   → opc_knowledge_get → 已有 v1 → merge → version: v2

opc_node_complete("pipeline-20260606-001", "sub-1", "auth-integration")
```

返回：
```json
{
  "node": "auth-integration",
  "status": "completed",
  "unblocked_nodes": ["security-review"]
}
```

---

## 5.5 执行 Node: security-review

```
opc_node_start("security-review") → Agent:
  ① 审查代码:
     - 密码哈希 ✓
     - Session token 随机性 ✓
     - SQL 注入风险 ✓
     - XSS 防护 ✓

  ② opc_knowledge_write(...)

opc_node_complete → { unblocked_nodes: [] }
```

---

## 5.6 opc_phase_complete

```json
{
  "phase": "05-implement",
  "status": "completed",
  "next_phase": "06-testing",
  "auto_advance": true
}
```

---

## 相关文档

- [06_phase-06-testing.md](06_phase-06-testing.md) — 下一阶段：测试
- [../../02-opc-state-server/03-phase/02_node-selection.md](../../02-opc-state-server/03-phase/02_node-selection.md) — 节点选择反思视角
