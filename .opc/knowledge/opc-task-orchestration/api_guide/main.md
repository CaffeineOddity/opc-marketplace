---
name: API 指南
description: OPC 任务编排 API 规范，包括 /opc 命令、任务评估 API、Agent 调度 API 和工作流匹配机制。
category: api_guide
feature_name: opc-task-orchestration
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [api_guide]
---

## 概览

OPC 任务编排系统提供一键式的 Agent 调度能力。通过 `/opc` 命令入口，系统自动评估任务类型、匹配工作流规范、选择合适的 Agents 并执行编排。

### 核心能力

| 能力 | 描述 |
|------|------|
| 任务评估 | 自动识别任务类型（Simple/Pipeline/Parallel/Project/Info） |
| 工作流匹配 | 根据关键词和模式匹配预定义工作流 |
| Agent 调度 | 支持 Single/Pipeline/Parallel/Team 四种编排模式 |
| 状态管理 | 跨会话的任务进度持久化 |
| 知识库集成 | 自动关联知识库，实现上下文传递 |

## 认证与授权

OPC 继承 Claude Code 的认证机制，无需额外配置。

### 模型访问要求

| 模型 | 用途 | 访问要求 |
|------|------|----------|
| opus | security-auditor, ai-engineer | 需要 Opus 访问权限 |
| sonnet | 大多数 Agents | 需要 Sonnet 访问权限 |
| haiku | seo-keyword-strategist 等 | 需要 Haiku 访问权限 |
| inherit | 继承调用者模型 | 无额外要求 |

## API 列表

### /opc - 任务入口

**描述**: 一键任务入口，自动评估任务并编排 Agents。

**调用方式**:
```
/opc <任务描述>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| 任务描述 | string | 是 | 自然语言描述的任务内容 |
| --workflow | string | 否 | 指定工作流名称 |

**返回值**:

```markdown
## OPC Task Initialized

**Lock ID:** {lock_id}
**Project:** {project_name}
**Requirement ID:** {requirement_id}
**Knowledge Feature:** {feature_name}
**Workflow:** {workflow_name} (matched, {confidence}% confidence)

### Pipeline Stages

- **product** (required) - 需求分析
- **design** (optional) - 设计阶段
- **dev** (required) - 开发实现
- **qa** (required) - 测试验证
- **ship** (optional) - 部署上线

### Next Steps

1. Update Progress: Use `opc_state_write` as you advance through stages
2. Manage Knowledge: Use `opc_knowledge_read` and `opc_knowledge_write`
```

**示例**:

```
/opc 实现用户登录功能

# 自动匹配 feature-development 工作流
# 创建 knowledge_feature_name: user-auth
# 初始化 pipeline: product → design → dev → qa → ship
```

### /opc status - 状态查询

**描述**: 显示当前任务进度和知识库状态。

**调用方式**:
```
/opc status
```

**返回值**:

```markdown
## OPC Project State

**Project:** 用户登录功能
**Requirement ID:** REQ-001
**Knowledge Feature:** user-auth
**Current Stage:** dev

### Pipeline Progress

✅ **product**: completed
🔄 **design**: in_progress (ui: 80%, interaction: 60%)
⏳ **dev**: pending
⏳ **qa**: pending
⏳ **ship**: pending

### Artifacts

- **product**: requirement/main.md, user-stories.json
- **design**: ui/main.md
```

### 任务评估 API

**描述**: 内部 API，用于评估任务类型和复杂度。

**评估规则**:

| 信号 | 分类 | 编排模式 |
|------|------|----------|
| 单一领域，明确范围 | Simple | 单 Agent 调度 |
| 多阶段，顺序依赖 | Pipeline | 串行 Agent 调度 |
| 多个独立部分 | Parallel | 并行 Agent 调度 |
| 复杂，需要 3+ Agents | Project | TeamCreate + TaskCreate |
| 仅提问 | Info | 直接回答 |

**调用示例**:

```javascript
// 内部评估逻辑
function assessTask(taskDescription) {
  // 1. 尝试匹配工作流
  const workflow = matchWorkflow(taskDescription);

  // 2. 如果匹配成功，使用工作流定义
  if (workflow) {
    return {
      type: 'workflow',
      workflow: workflow,
      stages: workflow.pipeline
    };
  }

  // 3. 否则根据信号评估
  return classifyTask(taskDescription);
}
```

### Agent 调度 API

**描述**: 内部 API，用于调度和编排 Agents。

**调度模式**:

| 模式 | 方式 | 适用场景 |
|------|------|----------|
| Single | Agent tool 单次调度 | 单阶段、单 Agent |
| Pipeline | Agent tool 串行多次 | 多阶段、有依赖 |
| Parallel | Agent tool 并行调用 | 独立任务并行 |
| Team | TeamCreate + TaskCreate + SendMessage | 复杂项目、3+ Agents |

**Single 模式示例**:

```javascript
// 单 Agent 调度
await Agent({
  agent: "product-agent",
  task: "分析用户登录功能需求",
  context: {
    knowledge: await opc_knowledge_read({ category: "requirement" })
  }
});
```

**Pipeline 模式示例**:

```javascript
// 串行 Pipeline
const stages = ['product', 'design', 'dev', 'qa', 'ship'];

for (const stage of stages) {
  // 1. 读取前置知识
  const knowledge = await readKnowledgeForStage(stage);

  // 2. 调度 Agent
  await Agent({
    agent: selectAgentForStage(stage),
    task: getTaskForStage(stage),
    context: { knowledge }
  });

  // 3. 写入知识
  await writeKnowledgeForStage(stage);

  // 4. 记录交接
  await opc_handoff({
    from_agent: currentAgent,
    to_agent: nextAgent,
    artifacts: [...]
  });
}
```

**Parallel 模式示例**:

```javascript
// 并行任务组
await opc_task_group_create({
  stage: "dev",
  group_name: "frontend-backend-parallel",
  tasks: [
    { agent: "frontend-agent", description: "实现登录页面" },
    { agent: "backend-agent", description: "实现认证 API" }
  ],
  parallel: true,
  completion_condition: "all"
});

// 并行调用 Agents
await Promise.all([
  Agent({ agent: "frontend-agent", ... }),
  Agent({ agent: "backend-agent", ... })
]);
```

### 工作流匹配 API

**描述**: 内部 API，根据任务描述匹配预定义工作流。

**匹配逻辑**:

```javascript
function matchWorkflow(taskDescription, workflows) {
  for (const workflow of workflows) {
    // 检查关键词匹配
    for (const keyword of workflow.triggers.keywords) {
      if (taskDescription.toLowerCase().includes(keyword.toLowerCase())) {
        return {
          workflow: workflow,
          score: 1.0,
          matchType: 'keyword'
        };
      }
    }

    // 检查正则模式匹配
    for (const pattern of workflow.triggers.patterns) {
      if (new RegExp(pattern).test(taskDescription)) {
        return {
          workflow: workflow,
          score: 0.8,
          matchType: 'pattern'
        };
      }
    }
  }

  return null; // 无匹配
}
```

**内置工作流触发器**:

| 工作流 | 关键词 | 描述 |
|--------|--------|------|
| feature-development | 实现、开发、添加、新增、功能 | 通用功能开发 (SDD + TDD) |
| bug-fix | 修复、bug、错误 | Bug 诊断 + TDD 修复 |
| security-fix | 安全、漏洞、CVE | 安全审计 + TDD 修复 |
| api-development | API、接口、REST | API-First + 契约测试 |
| refactor | 重构、清理 | 保持测试通过 |
| documentation | 文档、readme | 文档更新 |

## 错误处理

### 常见错误

| 错误码 | 描述 | 处理建议 |
|--------|------|----------|
| TASK_ALREADY_EXISTS | 窗口已有活跃任务 | 使用 `opc_state_clear` 清除或继续当前任务 |
| WORKFLOW_NOT_FOUND | 指定工作流不存在 | 检查工作流名称或使用默认评估 |
| AGENT_NOT_AVAILABLE | Agent 不可用 | 检查 Agent 配置和模型权限 |
| MODEL_NOT_AVAILABLE | 模型不可用 | 检查模型访问权限 |
| CONTEXT_TOO_LARGE | 上下文过大 | 减少输入内容或分段处理 |

### 错误响应格式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": "详细信息"
  }
}
```

## 最佳实践

### 任务描述

- 使用清晰、具体的描述
- 包含关键业务术语
- 说明期望的产出

### 工作流选择

- 让系统自动匹配，除非有特殊需求
- 使用 `/opc-workflows show <name>` 了解工作流详情
- 创建自定义工作流适应团队流程

### Agent 协作

- 使用 `opc_handoff` 记录 Agent 间交接
- 在交接中包含约束和上下文
- 使用知识库传递跨阶段信息

### 状态管理

- 每个阶段完成后调用 `opc_state_write`
- 使用 `opc_checkpoint_create` 在关键节点创建检查点
- 定期查看 `/opc status` 了解进度

## 参考链接

- [工作流规范 API](../workflow-specs/api_guide/main.md)
- [状态持久化 API](../state-persistence/api_guide/main.md)
- [知识库管理 API](../knowledge-library/api_guide/main.md)
