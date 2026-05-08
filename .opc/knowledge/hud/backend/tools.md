---
name: tools
description: 生成 HUD 知识库 - 为 OPC Marketplace 的 HUD 组件创建完整的知识库文档
category: backend
topic: hud
created_at: 2026-05-07T04:30:24.788Z
updated_at: 2026-05-08T06:43:10.613Z
---
# HUD MCP Tools Reference

## State Tools

### opc_state_read

读取当前 OPC 项目状态，显示 pipeline 进度、stage 状态和 agent 活动。

**Input Schema:**
```json
{
  "workingDirectory": { "type": "string", "description": "Working directory (defaults to cwd)" }
}
```

**Output Fields:**
- `project.name` - 项目名称
- `project.requirement_id` - 需求 ID
- `project.knowledge_topic` - 知识库主题
- `pipeline.current_stage` - 当前阶段
- `pipeline.stages` - 各阶段状态
- `workflow` - Workflow 元数据
- `rules` - TDD/SDD/Parallel 等规则

### opc_state_write

更新 OPC 项目状态，用于 founder-agent 跟踪 pipeline 进度。

**Input Schema:**
```json
{
  "project_name": { "type": "string" },
  "project_description": { "type": "string" },
  "stage": { "type": "string", "enum": ["product", "design", "dev", "qa", "ship", "growth"] },
  "stage_status": { "type": "string", "enum": ["pending", "in_progress", "completed", "blocked"] },
  "agent": { "type": "string" },
  "artifact": { "type": "string" },
  "progress": { "type": "object" },
  "blocker": { "type": "string" },
  "workingDirectory": { "type": "string" }
}
```

### opc_state_init

初始化新的 OPC 项目状态，自动关联知识库。一个窗口只能有一个任务。

**Input Schema:**
```json
{
  "project_name": { "type": "string", "required": true },
  "project_description": { "type": "string" },
  "requirement_id": { "type": "string", "description": "Optional: 'REQ-XXX' to use existing, 'new' to force new" },
  "workingDirectory": { "type": "string" }
}
```

**Behavior:**
- 自动创建/匹配知识库主题
- 自动生成或匹配 requirement ID
- 匹配 workflow 或 auto-assemble pipeline
- 设置第一个 stage 为 in_progress

### opc_state_clear

清除当前任务，用于放弃或重启。

## Checkpoint Tools

### opc_checkpoint_create

创建 checkpoint，用于风险操作前的回滚点。

**Input Schema:**
```json
{
  "description": { "type": "string", "required": true },
  "workingDirectory": { "type": "string" }
}
```

### opc_checkpoint_list

列出所有可用 checkpoint。

### opc_checkpoint_rollback

回滚到指定 checkpoint。

## Handoff Tools

### opc_handoff

Agent 间交接，保留上下文和约束。

**Input Schema:**
```json
{
  "from_agent": { "type": "string", "required": true },
  "to_agent": { "type": "string", "required": true },
  "artifacts": { "type": "array", "items": { "type": "string" }, "required": true },
  "constraints": { "type": "array", "items": { "type": "string" } },
  "context": { "type": "string" },
  "workingDirectory": { "type": "string" }
}
```

## Memory Tools

### opc_memory

项目记忆管理，存储决策、模式、教训。

**Input Schema:**
```json
{
  "action": { "type": "string", "enum": ["read", "write", "search"], "required": true },
  "category": { "type": "string", "enum": ["decision", "pattern", "lesson", "constraint"] },
  "content": { "type": "string" },
  "query": { "type": "string" },
  "workingDirectory": { "type": "string" }
}
```

## Session Tools

### opc_sessions_list

列出所有 OPC 任务，显示任务名称、当前阶段和状态。

## Task Group Tools

### opc_task_group_create

创建并行任务组，用于跟踪多个并发 agent。

**Input Schema:**
```json
{
  "stage": { "type": "string", "required": true },
  "group_name": { "type": "string", "required": true },
  "tasks": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "agent": { "type": "string", "required": true },
        "description": { "type": "string", "required": true },
        "dependencies": { "type": "array", "items": { "type": "string" } }
      }
    },
    "required": true
  },
  "parallel": { "type": "boolean", "default": true },
  "completion_condition": { "type": "string", "enum": ["all", "any", "threshold"] },
  "threshold": { "type": "number" },
  "workingDirectory": { "type": "string" }
}
```

### opc_task_update

更新并行任务状态。

### opc_task_group_status

获取任务组状态。

## Knowledge Tools

### opc_knowledge_init

初始化知识库主题。

### opc_knowledge_read

读取知识文档。

### opc_knowledge_write

写入知识文档，支持 append/update/overwrite 模式。

### opc_knowledge_exists

检查知识文档是否存在。

### opc_knowledge_list

列出知识库主题。

### opc_knowledge_docs

列出主题下的文档。

## Workflow Tools

### opc_workflows_path

获取 workflows 目录路径，始终使用 git toplevel root。