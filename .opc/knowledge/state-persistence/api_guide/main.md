---
name: API 指南
description: OPC 状态持久化 MCP 工具 API 规范，包括会话管理、检查点、Agent 交接、项目记忆和并行任务组管理。
category: api_guide
feature_name: state-persistence
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [api_guide]
---

## 概览

OPC 状态持久化系统通过 MCP 工具提供跨会话的状态管理能力。系统基于单窗口单任务模型，确保任务进度、决策和上下文在多个会话间保持一致。

### 核心能力

| 能力 | 工具 | 描述 |
|------|------|------|
| 会话管理 | opc_state_init, opc_state_read, opc_state_write, opc_state_clear | 任务生命周期管理 |
| 检查点系统 | opc_checkpoint_create, opc_checkpoint_list, opc_checkpoint_rollback | 状态快照与回滚 |
| Agent 交接 | opc_handoff | 保留上下文的 Agent 间传递 |
| 项目记忆 | opc_memory | 存储决策、模式、教训 |
| 并行任务组 | opc_task_group_create, opc_task_update, opc_task_group_status | 并行任务管理 |
| 会话列表 | opc_sessions_list | 查看所有活跃会话 |

## 认证与授权

MCP 工具在 Claude Code 环境内运行，继承其认证机制。状态文件存储在本地 `.opc/state/` 目录，不上传到远程服务器。

### 数据安全

- 状态文件存储在用户本地
- Git 提交时自动排除（通过 .gitignore）
- 明文存储，不包含敏感信息

## API 列表

### opc_state_init - 初始化任务会话

**描述**: 初始化新的 OPC 任务会话，自动关联知识库和工作流。

**调用方式**:
```javascript
opc_state_init({
  project_name: string,
  project_description?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| project_name | string | 是 | 项目/任务名称 |
| project_description | string | 否 | 项目详细描述 |
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**返回值**:

```markdown
## OPC Task Initialized

**Lock ID:** pid-12345-1715520000000
**Project:** 用户登录功能
**Requirement ID:** REQ-001
**Knowledge Feature:** user-auth

**Workflow:** feature-development (matched, 85% confidence)

### Pipeline Stages

- **product** (required) - 需求分析
- **design** (optional) - 设计阶段
- **dev** (required) - 开发实现
- **qa** (required) - 测试验证
- **ship** (optional) - 部署上线

### Next Steps

1. **Update Progress:** Use `opc_state_write` as you advance through stages
2. **Manage Knowledge:** Use `opc_knowledge_read` and `opc_knowledge_write`

📝 **.gitignore updated**: Added `.opc/state/` to ignore personal session data.
```

**自动行为**:

1. 检查是否存在相似任务（>50% 相似度自动复用）
2. 匹配工作流规范
3. 关联知识库特征
4. 生成唯一 lock_id
5. 更新 .gitignore

### opc_state_read - 读取任务状态

**描述**: 读取当前任务的完整状态信息。

**调用方式**:
```javascript
opc_state_read({
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**返回值**:

```markdown
## OPC Project State

**Project:** 用户登录功能
**Requirement ID:** REQ-001
**Knowledge Feature:** user-auth (requirement)
**Lock ID:** pid-12345-1715520000000
**Current Stage:** dev
**Workflow:** feature-development (matched, 85% match)

**Created:** 2026-05-12T10:00:00.000Z
**Updated:** 2026-05-12T11:30:00.000Z

### Pipeline Progress

✅ **product**: completed
🔄 **design**: in_progress (ui: 80%, interaction: 60%)
⏳ **dev**: pending
⏳ **qa**: pending
⏳ **ship**: pending

### Rules

- ✅ TDD enabled
- ✅ SDD enabled
- ✅ Parallel execution allowed
- ✅ Knowledge flow enabled

### Current Stage Knowledge

- **Read before:** requirement, design
- **Write after:** architecture/main

### Artifacts

- **product**: requirement/main.md, user-stories.json
- **design**: ui/main.md, interaction/flow.md
```

### opc_state_write - 更新任务状态

**描述**: 更新任务状态，记录进度、Agent、产物等信息。

**调用方式**:
```javascript
opc_state_write({
  project_name?: string,
  project_description?: string,
  knowledge_feature_name?: string,
  stage?: string,
  stage_status?: 'pending' | 'in_progress' | 'completed' | 'blocked',
  agent?: string,
  artifact?: string,
  progress?: object,
  blocker?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| project_name | string | 否 | 更新项目名称 |
| project_description | string | 否 | 更新项目描述 |
| knowledge_feature_name | string | 否 | 设置知识库特征名 |
| stage | string | 否 | 阶段名称 |
| stage_status | string | 否 | 阶段状态 |
| agent | string | 否 | 记录使用的 Agent |
| artifact | string | 否 | 记录产物路径 |
| progress | object | 否 | 子任务进度 |
| blocker | string | 否 | 阻塞原因 |
| workingDirectory | string | 否 | 工作目录 |

**阶段状态**:

| 状态 | 图标 | 描述 |
|------|------|------|
| pending | ⏳ | 待执行 |
| in_progress | 🔄 | 执行中 |
| completed | ✅ | 已完成 |
| blocked | 🚫 | 已阻塞 |

**返回值**:

```markdown
State updated.

**Current Stage:** dev
**Stage Status:** in_progress
```

### opc_state_clear - 清除任务

**描述**: 清除当前任务，释放窗口锁。

**调用方式**:
```javascript
opc_state_clear({
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**返回值**:

```markdown
## Task Unbound

**Previous Requirement:** REQ-001

The current window has been unbound from this requirement.
You can start a new task with `opc_state_init`.

**Note:** The requirement's state file is preserved for history.
To resume, use `opc_state_init` with a similar project name (auto-matching will find it).
```

### opc_handoff - Agent 交接

**描述**: 记录 Agent 间交接，保留上下文和约束。

**调用方式**:
```javascript
opc_handoff({
  from_agent: string,
  to_agent: string,
  artifacts: string[],
  constraints?: string[],
  context?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| from_agent | string | 是 | 交接方 Agent |
| to_agent | string | 是 | 接收方 Agent |
| artifacts | array | 是 | 交接的产物列表 |
| constraints | array | 否 | 接收方约束 |
| context | string | 否 | 额外上下文 |
| workingDirectory | string | 否 | 工作目录 |

**返回值**:

```markdown
## Handoff Recorded

**From:** product-agent
**To:** design-agent
**Artifacts:** requirement/main.md, user-stories.json
**Constraints:** 必须支持移动端, 保持品牌一致性

The receiving agent should check constraints and artifacts before starting work.
```

### opc_sessions_list - 会话列表

**描述**: 列出所有活跃的任务会话。

**调用方式**:
```javascript
opc_sessions_list({
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**返回值**:

```markdown
## OPC Sessions

| Lock ID | Task | Stage | Status | Updated |
|---------|------|-------|--------|---------|
| pid-12345-... | 用户登录功能 | dev | in_progress | 2026-05-12T11:30:00Z |
| pid-67890-... | 支付集成 | design | completed | 2026-05-11T15:00:00Z |
```

### opc_task_group_create - 创建并行任务组

**描述**: 创建并行任务组，用于跟踪多个并发 Agent。

**调用方式**:
```javascript
opc_task_group_create({
  stage: string,
  group_name: string,
  tasks: Array<{
    agent: string,
    description: string,
    dependencies?: string[]
  }>,
  parallel?: boolean,
  completion_condition?: 'all' | 'any' | 'threshold',
  threshold?: number,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| stage | string | 是 | 所属阶段 |
| group_name | string | 是 | 任务组名称 |
| tasks | array | 是 | 任务列表 |
| parallel | boolean | 否 | 是否并行执行，默认 true |
| completion_condition | string | 否 | 完成条件，默认 'all' |
| threshold | number | 否 | 阈值（threshold 条件时使用） |
| workingDirectory | string | 否 | 工作目录 |

**任务对象**:

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| agent | string | 是 | 分配的 Agent |
| description | string | 是 | 任务描述 |
| dependencies | array | 否 | 依赖的任务 ID |

**完成条件**:

| 条件 | 描述 |
|------|------|
| all | 所有任务完成 |
| any | 任一任务完成 |
| threshold | 达到阈值数量完成 |

**返回值**:

```markdown
## Task Group Created

**Group ID:** tg-dev-001
**Stage:** dev
**Parallel:** true
**Completion:** all

### Tasks (2)

- **task-001**: frontend-agent - 实现登录页面
- **task-002**: backend-agent - 实现认证 API

Use `opc_task_update` to update task progress.
```

### opc_task_update - 更新任务状态

**描述**: 更新并行任务组中单个任务的状态。

**调用方式**:
```javascript
opc_task_update({
  task_id: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  progress?: number,
  artifact?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| task_id | string | 是 | 任务 ID |
| status | string | 是 | 任务状态 |
| progress | number | 否 | 进度百分比 (0-100) |
| artifact | string | 否 | 产物路径 |
| workingDirectory | string | 否 | 工作目录 |

**任务状态**:

| 状态 | 图标 | 描述 |
|------|------|------|
| pending | ⏳ | 待执行 |
| in_progress | 🔄 | 执行中 |
| completed | ✅ | 已完成 |
| failed | ❌ | 已失败 |

**返回值**:

```markdown
Task task-001 updated: completed (100%)
```

### opc_task_group_status - 任务组状态

**描述**: 获取并行任务组的详细状态。

**调用方式**:
```javascript
opc_task_group_status({
  stage?: string,
  group_id?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| stage | string | 否 | 阶段名称 |
| group_id | string | 否 | 任务组 ID，不指定则显示全部 |
| workingDirectory | string | 否 | 工作目录 |

**返回值**:

```markdown
## Task Group Status

### frontend-backend-parallel (tg-dev-001)

**Parallel:** true | **Completion:** all
**Status:** ✅1 🔄1 ❌0 ⏳0

**Completed:** 2026-05-12T12:00:00Z

  ✅ task-001: frontend-agent (100%) - 实现登录页面
  🔄 task-002: backend-agent (60%) - 实现认证 API
```

### opc_workflows_path - 获取工作流路径

**描述**: 获取工作流目录路径，确保基于 git toplevel。

**调用方式**:
```javascript
opc_workflows_path({
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**返回值**:

```markdown
## Workflows Directory

**Path:** /path/to/project/.opc/workflows/
**Git Root:** /path/to/project/

All workflow files should be read from/written to this directory.
This ensures consistency regardless of current working directory.
```

## 状态文件结构

### 项目状态

```json
{
  "project": {
    "name": "用户登录功能",
    "description": "实现完整的用户认证系统",
    "requirement_id": "REQ-001",
    "knowledge_feature_name": "user-auth",
    "knowledge_category": "requirement",
    "created_at": "2026-05-12T10:00:00.000Z",
    "updated_at": "2026-05-12T11:30:00.000Z"
  },
  "context": {
    "lock_id": "pid-12345-1715520000000"
  },
  "workflow": {
    "name": "feature-development",
    "source": "matched",
    "confidence": 0.85
  },
  "rules": {
    "tdd": true,
    "sdd": true,
    "parallel_allowed": true,
    "knowledge_enabled": true
  },
  "pipeline": {
    "current_stage": "dev",
    "stage_order": ["product", "design", "dev", "qa", "ship"],
    "stages": {
      "product": {
        "status": "completed",
        "agents_used": ["product-agent"],
        "artifacts": ["requirement/main.md"],
        "started_at": "2026-05-12T10:00:00.000Z",
        "completed_at": "2026-05-12T10:30:00.000Z"
      },
      "dev": {
        "status": "in_progress",
        "agents_used": ["frontend-agent", "backend-agent"],
        "progress": { "frontend": 80, "backend": 60 }
      }
    }
  }
}
```

### 交接记录

```json
{
  "handoffs": [
    {
      "id": "handoff-001",
      "from_agent": "product-agent",
      "to_agent": "design-agent",
      "artifacts": ["requirement/main.md", "user-stories.json"],
      "constraints": ["必须支持移动端", "保持品牌一致性"],
      "context": "用户偏好简洁的登录界面",
      "timestamp": "2026-05-12T10:30:00.000Z"
    }
  ]
}
```

## 目录结构

```
.opc/
├── workflows/                 # 工作流规范（提交到 git）
│   ├── feature-development.json
│   └── bug-fix.json
├── memory/
│   └── project-memory.json    # 项目知识（决策、模式、教训）
├── state/
│   ├── sessions/              # 会话状态（个人数据，不提交）
│   │   └── session-*.json
│   └── checkpoints/           # 回滚点（可选）
│       └── checkpoint-*.json
├── artifacts/                 # 产物文件（可选）
└── .project-init              # 标记文件（防止重复复制）
```

## Git 提交建议

| 路径 | 提交? | 原因 |
|------|:-----:|------|
| `.opc/workflows/` | ✅ | 团队共享的工作流规范 |
| `.opc/memory/` | ✅ | 团队共享的项目知识 |
| `.opc/state/` | ❌ | 个人会话数据 |
| `.opc/state/checkpoints/` | 可选 | 回滚点 |
| `.opc/artifacts/` | 可选 | 视项目而定 |
| `.opc/.project-init` | ❌ | 本地安装标记 |

## 错误处理

### 常见错误

| 错误码 | 描述 | 处理建议 |
|--------|------|----------|
| NO_ACTIVE_TASK | 无活跃任务 | 使用 `opc_state_init` 创建任务 |
| TASK_ALREADY_EXISTS | 窗口已有任务 | 使用 `opc_state_clear` 清除或继续 |
| TASK_IN_PROGRESS | 任务执行中 | 完成当前任务或强制清除 |
| INVALID_STAGE | 无效阶段 | 检查阶段名称 |
| INVALID_STATUS | 无效状态 | 使用正确的状态值 |
| TASK_NOT_FOUND | 任务不存在 | 检查 task_id |

### 错误响应格式

```json
{
  "content": [{
    "type": "text",
    "text": "No active task. Use opc_state_init to start a new project."
  }],
  "isError": true
}
```

## 最佳实践

### 会话管理

- 每次开始新任务时调用 `opc_state_init`
- 定期调用 `opc_state_write` 更新进度
- 任务完成后调用 `opc_state_clear`

### Agent 交接

- 在阶段切换时调用 `opc_handoff`
- 包含所有相关产物
- 明确约束条件

### 并行任务

- 使用 `opc_task_group_create` 管理并行任务
- 及时更新任务状态
- 监控整体进度

### 状态持久化

- 重要节点创建检查点
- 定期备份 `.opc/memory/`
- 使用 Git 同享团队知识

## 参考链接

- [知识库管理 API](../knowledge-library/api_guide/main.md)
- [任务编排 API](../opc-task-orchestration/api_guide/main.md)
- [工作流规范 API](../workflow-specs/api_guide/main.md)