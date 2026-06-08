# 07 第七、八步：opc_pipeline_complete + 最终状态

> 本文档是 [walkthrough 总览](00_overview.md) 的子文档。其他子文档：
> [用户输入](01_user-input.md) · [流程启动](02_flow-startup.md) · [brief → create](03_brief-to-create.md) · [phase 04](04_phase-04-implement-design.md) · [phase 05](05_phase-05-implement.md) · [phase 06](06_phase-06-testing.md)

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
| 2.0 | `opc_flow_query`（hook 引导，确认 active=false） | 1 |
| 2.1 | `opc_flow_start` | 1 |
| 2.2 | `opc_intent_complete` | 1 |
| 2.3 | `opc_knowledge_list` + `opc_task_analysis_complete` | 2 |
| 3.0 | `opc_brief_complete` | 1 |
| 3.1 | `opc_pipeline_create` | 1 |
| 3.4 | `opc_knowledge_open` | 1 |
| 4.1 | `opc_phase_start` | 1 |
| 4.3 | `opc_phase_confirm` | 1 |
| 4.4 | `opc_node_start` → Task spawn sub-agent → `opc_node_complete` | 2 |
| 4.5 | `opc_node_start` → Task spawn sub-agent → `opc_node_complete` | 2 |
| 4.6 | `opc_phase_complete` | 1 |
| 5.1 | `opc_phase_start` | 1 |
| 5.2 | `opc_phase_adjust` + `opc_phase_confirm` | 2 |
| 5.3-5.5 | `opc_node_start`×3 + `opc_node_complete`×3 | 6 |
| 5.6 | `opc_phase_complete` | 1 |
| 6 | `opc_phase_start` + `opc_phase_confirm` + `opc_node_start` + `opc_node_complete` + `opc_phase_complete` | 5 |
| 7 | `opc_pipeline_complete` | 1 |

Claude 按需读取的 prompt 文档（非 MCP 调用，由 flow tools 返回的 methodology 指引）：

| 步骤 | 文档 | 用途 |
|------|------|------|
| 2.0 | `prompts/01_intent-analysis-overview.md` | active=false 时由 query 引用 |
| 2.1 | `prompts/01_intent-analysis-overview.md` | 复杂意图边界时读完整方法论 |
| 2.3 | `prompts/task-analysis.md` | 自省评分细则查阅 |
| 2.3 | `prompts/reflection-task-analysis.md` | 反思视角（如触发反思） |
| 3.0 | `prompts/brief-generation.md` | 模板照搬 |
| 4-6 | `prompts/phase-execution.md` | 阶段循环规范 |
| 4-6 | `prompts/reflection-node-selection.md` | 节点选择反思视角 |

Claude 执行 node 期间 sub-agent 自主调用的知识工具：

| Agent | 工具调用 |
|-------|---------|
| api-design | `opc_knowledge_write`×3 |
| database-schema | `opc_knowledge_get_batch`×1 + `opc_knowledge_write`×2 |
| tdd-implementation | `opc_knowledge_get_batch`×1 + `opc_knowledge_write`×0（只写代码） |
| auth-integration | `opc_knowledge_get_batch`×1 + `opc_knowledge_write`×2 |
| security-review | `opc_knowledge_get`×N + `opc_knowledge_write`×1 |
| integration-test | `opc_knowledge_get`×N |

**总计**：opc-state-server ~31 次调用（含 流程工具）+ opc-knowledge-server ~15 次调用 = ~46 次 MCP 调用，加上 Claude 按需读取 3-5 篇 prompts 文档，完成一个中等复杂度的功能实现。

---

## 相关文档

- [00_overview.md](00_overview.md) — 总览（含时序图）
- [../02-test/00_overview.md](../02-test/00_overview.md) — 10 个测试场景
