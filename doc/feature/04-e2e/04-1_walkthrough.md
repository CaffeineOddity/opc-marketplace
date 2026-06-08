# 从 0 到 1：一次完整的需求实现

以"实现用户认证系统（邮箱登录 + Session 管理）"为例，从头到尾逐步追踪。

## 前提

项目已有知识库结构：

```
opc-knowledge/
├── .opc-knowledge.json → { "_refs": {} }   # 仅 _refs，无跨 unit 依赖
└── .opc-knowledge.idx                      # 搜索索引（空，派生数据）
```

---

## 第一步：用户输入

```
用户: "实现用户认证系统，支持邮箱注册登录和会话管理"
```

---

## 第二步：Claude 分析任务

UserPromptSubmit hook 已将 `pipeline/intent-analysis.md` 注入 Claude 上下文。

### 2.1 Claude 读 intent-analysis.md → 意图识别

```
Claude 判断:
  输入: "实现用户认证系统，支持邮箱注册登录和会话管理"
  → 包含动作动词"实现" +0.3
  → 包含明确交付物"系统" +0.2
  → 无否定/疑问信号
  → intent: task, confidence: 0.85
```

### 2.2 Claude 读 task-analysis.md → 调用 opc_knowledge_list

```
opc_knowledge_list()
  → readdir 遍历 opc-knowledge/ → 无 unit 子目录
  → 返回: units: []
```

### 2.3 Claude 分析任务

```
Claude 基于 task-analysis.md 的 prompt 自行分析:

  ① 提炼描述 → "实现用户认证系统（邮箱注册登录 + 会话管理）"
  ② 打标签 → [backend, auth, database]
  ③ 复杂度 → medium（需要规划，能一轮完成）
  ④ 推荐阶段 → [04-implement-design, 05-implement, 06-testing]
  ⑤ 知识点 → [user-auth]（新 unit）
  ⑥ 扫描 scenarios/ 目录 → add-feature

结果（Claude 内部持有，不经过 state-server）:
{
  description: "实现用户认证系统（邮箱注册登录 + 会话管理）",
  tags: ["backend", "auth", "database"],
  complexity: "medium",
  suggested_phases: ["04-implement-design", "05-implement", "06-testing"],
  knowledge_unit: ["user-auth"],
  scenario: "add-feature"
}
```

### 2.4 判断是否拆分

```
需修改 unit 数 = 1（只有 user-auth，且是新 unit）
→ 不读 task-decomposition.md
→ 单管线
```

---

## 第三步：Claude 生成 brief + opc_pipeline_create 创建管线

### 3.0 Claude 读 brief-generation.md → 生成 brief 内容

Claude 按 brief-generation.md 的模板生成完整的 brief.md 文本。

### 3.1 opc_pipeline_create

```
opc_pipeline_create({
  description: "实现用户认证系统（邮箱注册登录 + 会话管理）",
  tags: ["backend", "auth", "database"],
  complexity: "medium",
  knowledge_unit: ["user-auth"],
  suggested_phases: ["04-implement-design", "05-implement", "06-testing"],
  scenario: "add-feature",
  brief_content: "# 任务工作单\n\n...(Claude 生成的完整 markdown)",
  sub_pipelines: [{
    id: "sub-1",
    title: "用户认证系统",
    knowledge_unit: ["user-auth"],
    blocked_by: []
  }],
  execution_order: [{ group: 1, parallel: ["sub-1"] }]
})
```

### 3.2 创建目录结构

```
.opc/pipelines/pipeline-20260606-001/
├── pipeline-plan.json
└── sub-pipelines/
    └── sub-1/
        ├── state.json
        ├── brief.md
        └── phases/
```

### 3.3 pipeline-plan.json

```json
{
  "id": "pipeline-20260606-001",
  "description": "实现用户认证系统（邮箱注册登录 + 会话管理）",
  "complexity": "medium",
  "status": "in_progress",
  "knowledge_unit": ["user-auth"],
  "owner": { "session_id": "session-abc", "pid": 12345, "since": "..." },
  "sub_pipelines": [{
    "id": "sub-1",
    "title": "用户认证系统",
    "knowledge_unit": ["user-auth"],
    "status": "in_progress",
    "blocked_by": []
  }],
  "execution_order": [{ "group": 1, "parallel": ["sub-1"] }]
}
```

### 3.4 opc_knowledge_open

```
opc_knowledge_open(["user-auth"])
  → opc-knowledge/ 下无 user-auth/
  → 创建 user-auth/ 目录
  → 无 _refs 关联
  → 返回: { units: { "user-auth": {} }, related: [] }
```

### 3.5 brief.md（Claude 生成内容，state-server 写入）

```markdown
# 任务工作单

## 问题描述
实现用户认证系统（邮箱注册登录 + 会话管理）

## 基本信息
| 属性 | 值 |
|------|-----|
| 管线 ID | pipeline-20260606-001 |
| 复杂度 | medium |
| 涉及阶段 | 04-implement-design → 05-implement → 06-testing |
| 关联 Scenario | add-feature |

## 范围
### 包含
- 邮箱 + 密码注册接口
- 登录 / 登出接口
- Session 会话管理（创建、验证、销毁）
- 密码加密存储

### 不包含
- OAuth / 第三方登录
- 手机号验证
- 密码重置流程

## 约束
无特殊约束

## 阶段计划
| 阶段 | 目标 | 关键节点 |
|------|------|---------|
| 04-implement-design | 设计 API 和数据库 | api-design, database-schema |
| 05-implement | 编码实现 | tdd-implementation, backend-endpoint, auth-integration |
| 06-testing | 验证测试 | integration-test |

## 关联知识
| 知识路径 | 操作 | 当前状态 | 说明 |
|---------|------|---------|------|
| user-auth/register/api | create | — | 注册接口设计 |
| user-auth/login/api | create | — | 登录接口设计 |
| user-auth/session/api | create | — | 会话管理接口 |
| user-auth/session/model | create | — | 会话数据模型 |
| user-auth/register/architecture | create | — | 认证架构设计 |
| user-auth/login/architecture | create | — | 登录流程架构 |

## 准入检查
- [x] 知识库 opc_knowledge_list 已执行
- [x] 知识库 opc_knowledge_open 已执行
- [x] 目标 unit 已创建
- [x] 用户约束已确认
```

### 3.6 state.json（state-server 写入）

```json
{
  "id": "sub-1",
  "title": "用户认证系统",
  "task": {
    "description": "实现用户认证系统（邮箱注册登录 + 会话管理）",
    "tags": ["backend", "auth", "database"],
    "complexity": "medium",
    "knowledge_unit": ["user-auth"],
    "scenario_hints": ["add-feature"]
  },
  "status": "in_progress",
  "phases": []
}
```

返回 `pipeline_id: "pipeline-20260606-001"`。

---

## 第四步：Phase 04-implement-design

### 4.1 opc_phase_start

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
  "max_reflection_rounds": 2
}
```

### 4.2 反思

```
系统: "04-implement-design 推荐节点：
       1. api-design (1.18) — 设计 API 端点
       2. database-schema (1.02) — 设计数据库表结构
       
       是否需要调整？"

用户: "可以，就这样"
```

### 4.3 opc_phase_confirm

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

### 4.4 执行 Node: api-design

```
opc_node_start("pipeline-20260606-001", "sub-1", "api-design")
  → state: in_progress, started_at: ...
  → 加载 node input: []
```

Agent 执行：
```
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

opc_node_complete("pipeline-20260606-001", "sub-1", "api-design",
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
  "unblocked_nodes": ["database-schema"]
}
```

### 4.5 执行 Node: database-schema

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

### 4.6 opc_phase_complete

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

## 第五步：Phase 05-implement

### 5.1 opc_phase_start

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

### 5.2 反思

```
系统: "05-implement 推荐：
       1. auth-integration (1.22)
       2. tdd-implementation (1.15)
       3. backend-endpoint (1.08)
       4. security-review (0.98)"

用户: "auth-integration 和 backend-endpoint 是不是重复了？选 tdd-implementation + auth-integration + security-review"
```

```
opc_phase_adjust("pipeline-20260606-001", "sub-1", "05-implement",
  nodes: ["tdd-implementation", "auth-integration", "security-review"])
```

node-resolver 重新解析：
```
tdd-implementation.input:  [knowledge: user-auth/login/api,
                             knowledge: user-auth/session/api]
                           → 已在 04-implement-design 产出 → 无 phase 内依赖

auth-integration.input:    [knowledge: user-auth/session/model]
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
  Group 1: [tdd-implementation]
  Group 2: [auth-integration]     ← artifacts + knowledge 双重冲突，降级串行
  Group 3: [security-review]      ← 等 auth-integration 产出的完整认证模块
```

返回新预览 → 用户确认 → `opc_phase_confirm`

### 5.3 执行 Node: tdd-implementation

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

### 5.4 执行 Node: auth-integration

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

### 5.5 执行 Node: security-review

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

### 5.6 opc_phase_complete

```json
{
  "phase": "05-implement",
  "status": "completed",
  "next_phase": "06-testing",
  "auto_advance": true
}
```

---

## 第六步：Phase 06-testing

```
opc_phase_start("06-testing")
  → 候选: [integration-test, accessibility-audit]
  → add-feature 推荐: integration-test
  → 高置信度 → 自动通过（无需反思确认）
  → opc_phase_confirm

opc_node_start("integration-test") → Agent:
  → 运行全部测试 → 通过
  → 端到端测试: 注册 → 登录 → 获取 session → 登出 → 验证 session 失效
  → opc_knowledge_write(...)  # 如有修正

opc_node_complete → { unblocked_nodes: [] }
opc_phase_complete → { next_phase: null }
```

---

## 第七步：opc_pipeline_complete

```
opc_pipeline_complete("pipeline-20260606-001")
  → 校验: pipeline-plan.json 全部子管线 completed ✓
  → 汇总全部子管线产出 → 生成 manifest.md
```

manifest.md：
```markdown
# 产物清单 — pipeline-20260606-001

## 管线信息
- 任务: 实现用户认证系统（邮箱注册登录 + 会话管理）
- 复杂度: medium
- 耗时: 04-implement-design(30min) + 05-implement(2h) + 06-testing(20min)

## 代码产物
| 路径 | 来源 Node | 说明 |
|------|----------|------|
| src/auth/register.ts | tdd-implementation | 注册端点 |
| src/auth/login.ts | tdd-implementation | 登录端点 |
| src/auth/session.ts | tdd-implementation | 会话端点 |
| src/models/user.ts | tdd-implementation | 用户模型 |
| src/models/session.ts | tdd-implementation | 会话模型 |
| tests/auth/ | tdd-implementation | 测试用例 |

## 知识产物
| 路径 | 版本 | 来源 Node |
|------|------|----------|
| user-auth/register/api | v1 | api-design |
| user-auth/login/api | v1 | api-design |
| user-auth/session/api | v2 | api-design → auth-integration |
| user-auth/session/model | v1 | database-schema |
| user-auth/login/architecture | v1 | database-schema |
| user-auth/register/architecture | v1 | auth-integration |
```

状态更新：
```json
{
  "status": "completed",
  "completed_at": "2026-06-06T13:20:00Z"
}
```

---

## 第八步：知识库最终状态

```
opc-knowledge/
├── .opc-knowledge.json         ← _refs: {}（无跨 unit 依赖）
├── .opc-knowledge.idx          ← 搜索索引（派生数据）
└── user-auth/
    ├── register/
    │   ├── api.md              (version: 1)
    │   └── architecture.md     (version: 1)
    ├── login/
    │   ├── api.md              (version: 1)
    │   └── architecture.md     (version: 1)
    └── session/
        ├── api.md              (version: 2)  ← 被 auth-integration 更新过
        └── model.md            (version: 1)
```

version 存储在 .md frontmatter 中（文件系统是唯一真相源，不设 index.json）：

session/api.md frontmatter 示例（被 auth-integration 更新为 v2）：
```yaml
---
version: 2
updated_at: "2026-06-06T11:45:00Z"
pipeline_id: "pipeline-20260606-001"
node: "auth-integration"
---
```

---

## MCP 调用汇总

| 步骤 | 工具调用 | 次数 |
|------|---------|------|
| 1 | — | 0 |
| 2 | `opc_knowledge_list` | 1 |
| 3 | `opc_pipeline_create`（内含 `opc_knowledge_open`） | 1+1 |
| 4.1 | `opc_phase_start` | 1 |
| 4.3 | `opc_phase_confirm` | 1 |
| 4.4 | `opc_node_start` → Claude 读 node .md 并执行 → `opc_node_complete` | 2 |
| 4.5 | `opc_node_start` → Claude 读 node .md 并执行 → `opc_node_complete` | 2 |
| 4.6 | `opc_phase_complete` | 1 |
| 5.1 | `opc_phase_start` | 1 |
| 5.2 | `opc_phase_adjust` + `opc_phase_confirm` | 2 |
| 5.3-5.5 | `opc_node_start`×3 + `opc_node_complete`×3 | 6 |
| 5.6 | `opc_phase_complete` | 1 |
| 6 | `opc_phase_start` + `opc_phase_confirm` + `opc_node_start` + `opc_node_complete` + `opc_phase_complete` | 5 |
| 7 | `opc_pipeline_complete` | 1 |

Claude 自行读取的 pipeline 文档（非 MCP 调用）：

| 步骤 | 文档 | 用途 |
|------|------|------|
| 1 | `pipeline/intent-analysis.md` | UserPromptSubmit hook 自动注入 |
| 2 | `pipeline/task-analysis.md` | Claude 主动读取，分析任务 |
| 2b | `pipeline/task-decomposition.md` | 如需要拆分则读取 |
| 3 | `pipeline/brief-generation.md` | Claude 读取模板生成 brief |
| 5 | `pipeline/phase-execution.md` | 进入阶段循环前读取 |

Claude 执行 node 期间自主调用的知识工具：

| Agent | 工具调用 |
|-------|---------|
| api-design | `opc_knowledge_write`×3 |
| database-schema | `opc_knowledge_get_batch`×1 + `opc_knowledge_write`×2 |
| tdd-implementation | `opc_knowledge_get_batch`×1 + `opc_knowledge_write`×0（只写代码） |
| auth-integration | `opc_knowledge_get_batch`×1 + `opc_knowledge_write`×2 |
| security-review | `opc_knowledge_get`×N + `opc_knowledge_write`×1 |
| integration-test | `opc_knowledge_get`×N |

**总计**：opc-state-server 23 次调用 + opc-knowledge-server ~15 次调用 = ~38 次 MCP 调用，加上 Claude 读取 3-5 篇 pipeline 文档，完成一个中等复杂度的功能实现。
