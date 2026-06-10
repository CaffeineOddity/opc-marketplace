# 03 第三步：生成 brief → 触发 opc_pipeline_create

> 本文档是 [walkthrough 总览](00_overview.md) 的子文档。其他子文档：
> [用户输入](01_user-input.md) · [流程启动](02_flow-startup.md) · [phase 04](04_phase-04-implement-design.md) · [phase 05](05_phase-05-implement.md) · [phase 06](06_phase-06-testing.md) · [pipeline 完成](07_pipeline-complete.md)

---

## 3.0 Claude 生成 brief markdown

Claude 按 brief-generation.md 的模板生成完整的 brief.md 文本，然后调 opc_flow_step_complete({step:"brief_generation"})：

```
Claude → opc_flow_step_complete({step:"brief_generation"})({brief_content: "# 任务工作单\n..."})

opc_flow_step_complete({step:"brief_generation"}) 返回（从 flow-state.accumulated 推导，预填全部参数）:
{
  step: "brief_completed",
  step_instruction: "下一步创建管线，参数已预填",
  next: {
    tool: "opc_pipeline_create",
    args: {
      description: "实现用户认证系统（邮箱注册登录 + 会话管理）",
      tags: ["backend", "auth", "database"],
      complexity: "medium",
      knowledge_unit: ["user-auth"],
      suggested_phases: ["04-implement-design", "05-implement", "06-testing"],
      phase_selection_rationale: "add-feature + medium：跳过 00/01/03，从实现设计起步至测试",
      scenario: "add-feature",
      brief_content: "<刚提交的 brief markdown>",
      sub_pipelines: [{
        id: "sub-1",
        title: "用户认证系统",
        knowledge_unit: ["user-auth"],
        blocked_by: []
      }],
      execution_order: [{group: 1, sub_pipeline_ids: ["sub-1"]}]
    }
  }
}
```

---

## 3.1 opc_pipeline_create

```
Claude → opc_pipeline_create({...预填参数...})

返回:
{
  pipeline_id: "pipeline-20260606-001",
  created_at: "...",
  flow_next: {
    tool: "opc_knowledge_open",
    args: {units: ["user-auth"]},
    why: "管线已创建，下一步初始化知识单元"
  }
}
```

---

## 3.2 创建目录结构

```
.opc/pipelines/pipeline-20260606-001/
├── pipeline-plan.json
└── sub-pipelines/
    └── sub-1/
        ├── state.json
        ├── brief.md
        └── phases/

.opc/sessions/sess-abc/
└── flow-state.json   ← 更新 step: pipeline_created
```

---

## 3.3 pipeline-plan.json

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
  "execution_order": [{ "group": 1, "sub_pipeline_ids": ["sub-1"] }]
}
```

---

## 3.4 opc_knowledge_open

```
Claude 按 flow_next 调用:
opc_knowledge_open(["user-auth"])
  → opc-knowledge/ 下无 user-auth/
  → 创建 user-auth/ 目录
  → 无 _refs 关联
  → 返回:
  {
    units: { "user-auth": {} },
    related: [],
    flow_next: {
      tool: "opc_phase_start",
      args: {
        pipeline_id: "pipeline-20260606-001",
        sub_pipeline_id: "sub-1",
        phase: "04-implement-design"
      },
      why: "知识单元就绪，进入第一个阶段"
    },
    methodology: {
      docs: ["prompts/phase-execution.md"],
      ref: "十一 阶段执行循环",
      summary: "phase_start → 自省排序 → 反思 → confirm → node 执行 → complete"
    }
  }
```

---

## 3.5 brief.md（Claude 生成内容，state-server 写入）

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
> 阶段选择理由：add-feature + medium：跳过 00/01/03，从实现设计起步至测试

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
- [x] 知识库 opc_knowledge_read({mode:"list"}) 已执行
- [x] 知识库 opc_knowledge_open 已执行
- [x] 目标 unit 已创建
- [x] 用户约束已确认
```

---

## 3.6 state.json（state-server 写入）

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
  "phase_plan": {
    "available": ["00-ideation", "01-validation", "03-design", "04-implement-design", "05-implement", "06-testing", "07-release", "08-growth", "09-scale"],
    "selected": ["04-implement-design", "05-implement", "06-testing"],
    "selected_by": "task_analysis",
    "selection_rationale": "add-feature + medium：跳过 00/01/03，从实现设计起步至测试",
    "scenario_hints": ["add-feature"],
    "order_validated": true
  },
  "status": "in_progress",
  "phases": []
}
```

返回 `pipeline_id: "pipeline-20260606-001"`。

---

## 相关文档

- [04_phase-04-implement-design.md](04_phase-04-implement-design.md) — 下一步：第一个阶段
- [../../02-opc-state-server/02-pipeline/00_overview.md](../../02-opc-state-server/02-pipeline/00_overview.md) — 管线模型
