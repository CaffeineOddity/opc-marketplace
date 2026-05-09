---
name: OPC State API 参考
description: OPC State 所有 MCP 工具的完整 API 参考，包括参数、返回值和类型定义。
category: api
topic: opc-state
created_at: 2026-05-09T08:38:23.044Z
updated_at: 2026-05-09T08:38:23.044Z
tags: [api, reference, mcp, typescript]
---
# OPC State API 参考

## State 工具

### opc_state_read

读取当前 OPC 项目状态。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录（默认为 cwd） |

**返回：**
```
## OPC Project State

**Project:** {project_name}
**Requirement ID:** {requirement_id}
**Knowledge Topic:** {knowledge_topic}
**Lock ID:** {lock_id}
**Current Stage:** {current_stage}
**Workflow:** {workflow_name} ({source}, {confidence}% match)

### Pipeline Progress

{stage_icon} **{stage_name}** ({required}): {status} — {description}

### Rules
- ✅ TDD enabled
- ✅ SDD enabled
- ✅ Parallel execution allowed
- ✅ Knowledge flow enabled

### Artifacts
- **{stage}**: {artifact1}, {artifact2}
```

---

### opc_state_init

初始化新 OPC 项目状态，自动关联知识库。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| project_name | string | 是 | 项目名称 |
| project_description | string | 否 | 项目描述 |
| workingDirectory | string | 否 | 工作目录 |

**行为：**
1. 获取当前窗口 lock_id
2. 检查是否已有活跃任务
3. 查找相似任务（相似度 >= 50%）
4. 匹配工作流规格
5. 生成 requirement_id
6. 匹配知识主题
7. 绑定 session 到 requirement
8. 初始化 ProjectState
9. 更新 .gitignore

**返回：**
```
## OPC Task Initialized

**Lock ID:** {lock_id}
**Project:** {project_name}
**Requirement ID:** {requirement_id}
**Knowledge Topic:** {knowledge_topic}

🔧 **Pipeline:** Auto-assembled
🆕 **Created new task:** {requirement_id}

### Pipeline Stages
- **product** (required) - 需求分析和规格定义
- **dev** (required) - TDD 开发
- **qa** (required) - 测试验证
```

---

### opc_state_write

更新 OPC 项目状态。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| project_name | string | 否 | 项目名称（新项目） |
| project_description | string | 否 | 项目描述 |
| knowledge_topic | string | 否 | 知识主题 |
| stage | string | 否 | 阶段名称 |
| stage_status | string | 否 | 阶段状态 |
| agent | string | 否 | Agent 名称 |
| artifact | string | 否 | 产物路径 |
| progress | object | 否 | 进度百分比 |
| blocker | string | 否 | 阻塞描述 |
| workingDirectory | string | 否 | 工作目录 |

**阶段枚举：**
- `product` - 需求分析
- `design` - 设计
- `dev` - 开发
- `qa` - 测试
- `ship` - 部署
- `growth` - 增长

**状态枚举：**
- `pending` - 待处理
- `in_progress` - 进行中
- `completed` - 已完成
- `blocked` - 已阻塞

**返回：**
```
State updated.

**Current Stage:** {stage}
**Stage Status:** {status}
```

---

### opc_state_clear

清除当前任务。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录 |

**返回：**
```
## Task Unbound

**Previous Requirement:** {requirement_id}

The current window has been unbound from this requirement.
```

---

## Session 工具

### opc_sessions_list

列出所有 OPC 任务。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录 |

**返回：**
```
## OPC Sessions

| Requirement ID | Project | Stage | Status | Updated |
|----------------|---------|-------|--------|---------|
| 20260509_001   | 用户认证 | dev   | in_progress | 2026-05-09 |
```

---

## Task Group 工具

### opc_task_group_create

创建并行任务组。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| stage | string | 是 | 阶段名称 |
| group_name | string | 是 | 任务组名称 |
| tasks | array | 是 | 任务列表 |
| parallel | boolean | 否 | 并行执行（默认 true） |
| completion_condition | string | 否 | 完成条件 |
| threshold | number | 否 | 阈值数量 |
| workingDirectory | string | 否 | 工作目录 |

**任务结构：**
```typescript
{
  agent: string;        // Agent 名称
  description: string;  // 任务描述
  dependencies?: string[]; // 依赖任务 ID
}
```

**完成条件：**
- `all` - 所有任务完成
- `any` - 任一任务完成
- `threshold` - 达到阈值

**返回：**
```
Task group created.

**Group ID:** {group_id}
**Stage:** {stage}
**Tasks:** {count} tasks
```

---

### opc_task_update

更新任务状态。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| task_id | string | 是 | 任务 ID |
| status | string | 是 | 新状态 |
| progress | number | 否 | 进度（0-100） |
| artifact | string | 否 | 产物路径 |
| workingDirectory | string | 否 | 工作目录 |

**状态枚举：**
- `pending` - 待处理
- `in_progress` - 进行中
- `completed` - 已完成
- `failed` - 已失败

---

### opc_task_group_status

获取任务组状态。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| stage | string | 否 | 阶段名称 |
| group_id | string | 否 | 任务组 ID |
| workingDirectory | string | 否 | 工作目录 |

---

## Handoff 工具

### opc_handoff

Agent 交接，保留上下文和约束。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| from_agent | string | 是 | 交接方 Agent |
| to_agent | string | 是 | 接收方 Agent |
| artifacts | string[] | 是 | 交接产物 |
| constraints | string[] | 否 | 约束条件 |
| context | string | 否 | 额外上下文 |
| workingDirectory | string | 否 | 工作目录 |

**返回：**
```
## Handoff Recorded

**Handoff ID:** {handoff_id}
**From:** {from_agent}
**To:** {to_agent}
**Artifacts:** {artifacts}
**Constraints:** {constraints}
```

---

## Workflow 工具

### opc_workflows_path

获取工作流目录路径。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录 |

**返回：**
```
## Workflows Path

**Path:** /path/to/project/.opc/workflows/
```

---

## Knowledge 工具

### opc_knowledge_init

初始化知识库主题。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| title | string | 是 | 主题标题（可中文） |
| en_topic_name | string | 是 | 英文主题名（目录命名） |
| workingDirectory | string | 否 | 工作目录 |

**命名规范：**
- 格式：`{platform}-{feature}` 或 `{feature}`
- 示例：`ios-localization`、`user-auth`、`payment-integration`

---

### opc_knowledge_read

读取知识文档。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| topic | string | 否 | 知识主题（默认当前任务主题） |
| category | string | 是 | 知识类别 |
| doc | string | 否 | 文档名称 |
| workingDirectory | string | 否 | 工作目录 |

**行为：**
- 指定 `doc`：读取特定文档
- 不指定 `doc`：读取类别下所有文档

---

### opc_knowledge_write

写入知识文档。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| topic | string | 否 | 知识主题 |
| category | string | 是 | 知识类别 |
| doc | string | 是 | 文档名称 |
| content | string | 是 | 文档内容 |
| name | string | 是 | 文档标题（人类可读） |
| description | string | 是 | 文档描述 |
| tags | string[] | 是 | 标签 |
| mode | string | 否 | 写入模式 |
| section | string | 否 | 章节名称 |
| workingDirectory | string | 否 | 工作目录 |

**写入模式：**
- `overwrite` - 完全覆盖
- `append` - 追加内容
- `update` - 更新章节

---

### opc_knowledge_exists

检查知识文档是否存在。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| topic | string | 否 | 知识主题 |
| category | string | 否 | 知识类别 |
| doc | string | 否 | 文档名称 |
| workingDirectory | string | 否 | 工作目录 |

**返回：** `true` 或 `false`

---

### opc_knowledge_list

列出知识主题。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| status | string | 否 | 按状态过滤 |
| category | string | 否 | 按类别过滤 |
| workingDirectory | string | 否 | 工作目录 |

**状态枚举：**
- `in_progress` - 进行中
- `completed` - 已完成
- `paused` - 已暂停

---

### opc_knowledge_docs

列出类别下的文档。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| topic | string | 否 | 知识主题 |
| category | string | 是 | 知识类别 |
| workingDirectory | string | 否 | 工作目录 |

---

### opc_knowledge_list_brief

简要列出所有知识文档。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| topic | string | 否 | 按主题过滤 |
| category | string | 否 | 按类别过滤 |
| workingDirectory | string | 否 | 工作目录 |

**返回：**
```
## Knowledge Documents (Brief)

| Topic | Category | Name | Description |
|-------|----------|------|-------------|
| user-auth | backend | API文档 | 用户认证API接口 |
```

---

### opc_knowledge_rebuild_index

重建知识索引。

**参数：**
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录 |

**用途：**
- 索引损坏时
- 手动操作文件后
- 迁移版本后

**返回：**
```
## Knowledge Index Rebuilt

### Statistics
- **Topics found:** 5
- **Categories found:** 12
- **Documents found:** 28

### Changes
**Added topics:** new-topic
**Removed topics:** old-topic
```

---

## 类型定义

### ProjectState

```typescript
interface ProjectState {
  project: {
    name: string;
    description: string;
    requirement_id?: string;
    knowledge_topic?: string;
    knowledge_category?: string;
    created_at: string;
    updated_at: string;
  };
  pipeline: {
    current_stage: string;
    stage_order?: string[];
    stages: Record<string, StageState>;
  };
  workflow?: {
    name: string;
    source: 'matched' | 'auto_assembled';
    matched_at?: string;
    confidence?: number;
  };
  gates?: Gate[];
  rules?: {
    tdd?: boolean;
    sdd?: boolean;
    parallel_allowed?: boolean;
    knowledge_enabled?: boolean;
  };
  context: {
    lock_id: string;
    worktree: string;
  };
  _meta: {
    version: string;
    updated_by: string;
  };
}
```

### StageState

```typescript
interface StageState {
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  agents_used?: string[];
  artifacts?: string[];
  started_at?: string;
  completed_at?: string;
  verification_passed?: boolean;
  progress?: Record<string, number>;
  blockers?: string[];
  task_groups?: TaskGroup[];
  active_parallel_tasks?: string[];
  config?: StageConfig;
  gates_passed?: string[];
  gates_blocked?: string[];
}
```

### TaskGroup

```typescript
interface TaskGroup {
  group_id: string;
  name: string;
  tasks: ParallelTask[];
  parallel: boolean;
  completion_condition: 'all' | 'any' | 'threshold';
  threshold?: number;
  started_at?: string;
  completed_at?: string;
}
```

### KnowledgeDocMeta

```typescript
interface KnowledgeDocMeta {
  name: string;
  description: string;
  category: string;
  topic: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}
```

---

## 错误处理

所有工具在出错时返回：

```typescript
{
  content: [{ type: 'text', text: 'Error: {error_message}' }],
  isError: true
}
```

**常见错误：**
- `No active task` - 未初始化任务
- `Unknown tool` - 未知工具名
- `Missing required parameter` - 缺少必需参数
- `Knowledge document not found` - 知识文档不存在