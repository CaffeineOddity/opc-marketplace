# 04 第四步：Phase 04-implement-design

> 本文档是 [walkthrough 总览](00_overview.md) 的子文档。其他子文档：
> [用户输入](01_user-input.md) · [流程启动](02_flow-startup.md) · [brief → create](03_brief-to-create.md) · [phase 05](05_phase-05-implement.md) · [phase 06](06_phase-06-testing.md) · [pipeline 完成](07_pipeline-complete.md)

---

## 4.1 opc_phase_start

```
opc_phase_start("pipeline-20260606-001", "sub-1", "04-implement-design")
```

扫描节点来源：
- `phases/04-implement-design/nodes/` → [api-design, database-schema, scaffold]
- 项目 `opc-nodes/` → 无覆盖

匹配：
```
tag 交集过滤:
  任务 tags: [backend, auth, database]

  api-design:      tags [api, backend]      → 交集 [backend]      → 候选
  database-schema: tags [database, backend] → 交集 [database, backend] → 候选
  scaffold:        tags [fullstack]         → 交集 []             → 排除

语义匹配:
  "实现用户认证系统（邮箱注册登录 + 会话管理）"
    vs "设计 API 端点、请求/响应格式、错误码"   → api-design: 0.88
    vs "设计数据库表结构、索引、迁移策略"        → database-schema: 0.72

Scenario 加权:
  add-feature 推荐 nodes: [api-design, database-schema] → 各 +0.3

最终排序:
  1. api-design        (1.18)  ← 推荐
  2. database-schema   (1.02)  ← 推荐
  3. scaffold          (排除)
```

返回：
```json
{
  "phase": "04-implement-design",
  "candidates": [
    { "name": "api-design", "score": 1.18, "recommended": true },
    { "name": "database-schema", "score": 1.02, "recommended": true }
  ],
  "reflection_budget_hint": {
    "max_rounds": 2,
    "primary_method": "M4-Critique",
    "secondary_method": "M5-Debate"
  }
}
```

---

## 4.2 收集 selection_evidence → P5 V1-V5 验证

Claude 拿到候选后排序 + 收集 `selection_evidence`，提交给 reflection-server P5：

```
selection_evidence = {
  matched_tags: [
    {node: "api-design", tags: ["backend"]},
    {node: "database-schema", tags: ["database", "backend"]}
  ],
  scenario_hits: ["api-design", "database-schema"],   // add-feature 推荐全命中
  file_domain_conflicts: [],                          // 两 node 输出域无重叠
  blocked_by_graph: [
    {from: "database-schema", to: ["api-design"]}     // input→output 推导
  ],
  coverage_gaps: []                                   // [backend, auth, database] 全覆盖
}

reflection-server P5 判定:
  V1 schema:         ok (字段完整)
  V2 referential:    ok (blocked_by 图无环、依赖目标存在)
  V3 evidence:       ok (matched_tags 非空、scenario_hits 非空)
  V4 coverage:       ok (coverage_gaps 为空)
  V5 discrimination: ok (file_domain_conflicts 为空)
  meta-validator:    无严重 objection
  → 路径 A 自动确认（auto_confirm: true）
```

```
Claude 通知用户:
  "04-implement-design 已自动确认 2 个节点（P5 evidence 通过 V1-V5）:
   1. api-design — 设计 API 端点（scenario_hits 命中）
   2. database-schema — 设计数据库表结构（scenario_hits 命中）
   依赖: database-schema blocked_by [api-design] → 串行执行。
   如需调整，回复'调整节点'。"
```

---

## 4.3 opc_phase_confirm

```
opc_phase_confirm("pipeline-20260606-001", "sub-1", "04-implement-design",
  nodes: ["api-design", "database-schema"])
```

node-resolver 解析：

```
api-design.input:      []           → 无依赖
api-design.output:     [knowledge: user-auth/register/api,
                        knowledge: user-auth/login/api,
                        knowledge: user-auth/session/api]

database-schema.input: [knowledge: user-auth/login/api,
                        knowledge: user-auth/session/api]
                      → 依赖 api-design.output → blocked_by: [api-design]

文件域检查:
  api-design.output.artifacts:      无
  database-schema.output.artifacts: 无
  → 无 artifact 冲突

knowledge 冲突检查:
  api-design.output.knowledge:      [user-auth/register/api, user-auth/login/api, user-auth/session/api]
  database-schema.output.knowledge: [user-auth/session/model, user-auth/login/architecture]
  → 无重叠 → 无 knowledge 冲突

拓扑排序:
  Group 1: [api-design]         ← 无 blocked_by
  Group 2: [database-schema]    ← blocked_by: [api-design]
```

写入 state.json：
```json
{
  "phases": [{
    "phase": "04-implement-design",
    "status": "in_progress",
    "nodes": [
      { "name": "api-design", "status": "pending", "agent": null, "blocked_by": [] },
      { "name": "database-schema", "status": "pending", "agent": null, "blocked_by": ["api-design"] }
    ]
  }]
}
```

返回：
```json
{
  "groups": [
    { "group": 1, "nodes": ["api-design"], "parallel": false },
    { "group": 2, "nodes": ["database-schema"], "parallel": false }
  ]
}
```

---

## 4.4 执行 Node: api-design

```
Claude 主进程 → opc_node_start("pipeline-20260606-001", "sub-1", "api-design")

返回:
{
  node: "api-design",
  status: "in_progress",
  agent: "backend-engineer",
  input_knowledge: [],   ← 该节点 input 为空
  node_file_path: "phases/04-implement-design/nodes/api-design.md",
  node_body: "## API 设计节点\n\n根据 brief 和已有架构，设计 RESTful 端点...",
  dispatch_instruction: "use Task tool with subagent_type='backend-engineer'，传入 node_body 在隔离 context 执行"
}
```

Claude 主进程 → Task spawn backend-engineer sub-agent，传入 node_body：

```
sub-agent 执行:
① 读取 brief.md → 了解任务范围

② 设计 API:
    POST   /api/auth/register   注册
    POST   /api/auth/login      登录
    POST   /api/auth/logout     登出
    GET    /api/auth/session    获取当前会话

③ opc_knowledge_write("user-auth", "register", "api",
     "# 注册 API\n\nPOST /api/auth/register\n..."
   )
   → version: v1, 更新 frontmatter

④ opc_knowledge_write("user-auth", "login", "api",
     "# 登录 API\n\nPOST /api/auth/login\n..."
   )
   → version: v1

⑤ opc_knowledge_write("user-auth", "session", "api",
     "# 会话 API\n\nPOST /api/auth/logout\nGET /api/auth/session\n..."
   )
   → version: v1

sub-agent 完成 → 回报 evidence 给主进程

主进程 → opc_node_complete("pipeline-20260606-001", "sub-1", "api-design",
  evidence: {
    summary: "设计完成：3 个 API 端点，4 条知识写入",
    knowledge_written: [
      {path: "user-auth/register/api", version: 1},
      {path: "user-auth/login/api", version: 1},
      {path: "user-auth/session/api", version: 1}
    ]
  }
)
→ L1 校验: 3 个 knowledge 文件存在且 version ≥ 1 ✓
→ L2: api-design 节点未声明 quality_gates，跳过
→ completed
```

返回：
```json
{
  "node": "api-design",
  "status": "completed",
  "output": [
    { "type": "knowledge", "path": "user-auth/register/api", "version": 1 },
    { "type": "knowledge", "path": "user-auth/login/api", "version": 1 },
    { "type": "knowledge", "path": "user-auth/session/api", "version": 1 }
  ],
  "unblocked_nodes": ["database-schema"],
  "flow_next": {
    "suggestion": "unblocked_nodes 非空 → 调 opc_node_start('database-schema')"
  }
}
```

---

## 4.5 执行 Node: database-schema

```
opc_node_start("pipeline-20260606-001", "sub-1", "database-schema")
```

Agent 执行：
```
① opc_knowledge_get_batch([
     {unit: "user-auth", section: "login", subsection: "api"},
     {unit: "user-auth", section: "session", subsection: "api"}
   ])
   → 读到 api-design 刚产出的 API 设计

② 根据 API 设计推导表结构 → 设计 users 表 + sessions 表

③ opc_knowledge_write("user-auth", "session", "model",
     "# Session 数据模型\n\n```sql\nCREATE TABLE users (...)\n..."
   )
   → version: v1

④ opc_knowledge_write("user-auth", "login", "architecture",
     "# 登录流程架构\n\n密码哈希 + Session Token 签发\n..."
   )
   → version: v1

opc_node_complete("pipeline-20260606-001", "sub-1", "database-schema",
  evidence: {
    summary: "数据库设计完成：users 表 + sessions 表，2 条知识写入",
    knowledge_written: [
      {path: "user-auth/session/model", version: 1},
      {path: "user-auth/login/architecture", version: 1}
    ]
  }
)
→ L1 校验通过 → completed
```

返回：
```json
{
  "node": "database-schema",
  "status": "completed",
  "unblocked_nodes": []
}
```

---

## 4.6 opc_phase_complete

```
opc_phase_complete("pipeline-20260606-001", "sub-1", "04-implement-design")
```

state.json 更新：
```json
{
  "phases": [{
    "phase": "04-implement-design",
    "status": "completed",
    "completed_at": "2026-06-06T10:30:00Z",
    "nodes": [
      { "name": "api-design", "status": "completed", ... },
      { "name": "database-schema", "status": "completed", ... }
    ]
  }]
}
```

返回：
```json
{
  "phase": "04-implement-design",
  "status": "completed",
  "next_phase": "05-implement",
  "auto_advance": true,
  "next_phase_message": "进入 05-implement 编码阶段"
}
```

因 `auto_advance: true`，Claude 不等待用户，直接推进。

---

## 相关文档

- [05_phase-05-implement.md](05_phase-05-implement.md) — 下一阶段：编码实现
- [../../02-opc-state-server/03-phase/00_overview.md](../../02-opc-state-server/03-phase/00_overview.md) — 阶段模型
- [../../02-opc-state-server/04-node/00_overview.md](../../02-opc-state-server/04-node/00_overview.md) — 节点模型
