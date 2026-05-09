---
name: OPC State 技术架构文档
description: 描述 OPC State 状态管理系统的技术架构，包括核心模块、数据流、MCP 工具集和扩展性。
category: tech-doc
topic: opc-state
created_at: 2026-05-09T08:35:30.294Z
updated_at: 2026-05-09T08:35:30.294Z
tags: [architecture, mcp, state-management, typescript]
---
# OPC State 技术架构

## 概述

OPC State 是一个基于 MCP (Model Context Protocol) 的状态管理服务器，为 OPC Founder Agent 提供跨会话持久化、阶段追踪和 Agent 交接能力。

## 核心设计理念

### 1. 多任务历史模型

```
┌─────────────────────────────────────────────────────────────────┐
│                    多任务历史模型                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ Session Index   │    │ State Files     │                    │
│  │ (sessions.json) │    │ (per task)      │                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           │  lock_id ────────────┼──→ requirement_id           │
│           │                      │                              │
│           ▼                      ▼                              │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ One Window      │    │ All Task        │                    │
│  │ One Active Task │    │ History         │                    │
│  └─────────────────┘    │ Preserved       │                    │
│                         └─────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**关键特性：**
- 每个 requirement 有独立的状态文件（保留历史）
- 一个窗口 = 一个活跃任务（通过 session binding）
- Session index 映射 lock_id → requirement_id
- 所有任务历史保存在 `.opc/state/sessions/`

### 2. 窗口锁定机制

采用 PID + O_CREAT|O_EXCL 原子文件创建实现窗口检测：

```typescript
// 进程会话 ID 格式
processSessionId = `pid-${pid}-${startTimestamp}`

// 锁文件路径
.opc/state/locks/{lockId}.lock
```

**锁文件内容：**
```json
{
  "lockId": "pid-12345-1715234567890",
  "pid": 12345,
  "timestamp": 1715234567890
}
```

**陈旧锁检测：**
- 默认 30 秒超时
- 通过 `process.kill(pid, 0)` 检测进程存活
- 自动清理陈旧锁

## 目录结构

```
.opc/
├── state/
│   ├── sessions/           # 任务状态文件
│   │   ├── 20260509_001_auto_assembled.json
│   │   └── 20260509_002_matched.json
│   ├── sessions.json       # Session 索引
│   └── locks/              # 窗口锁文件
│       └── pid-12345-1715234567890.lock
├── knowledge/              # 知识库
│   ├── index.json          # 知识索引
│   └── {topic}/            # 按主题组织
│       └── {category}/     # 按类别组织
│           └── {doc}.md    # 文档
└── workflows/              # 工作流规格
    └── {workflow}.json
```

## 核心模块

### 1. State 模块 (`state.ts`)

**职责：** 项目状态管理和持久化

**核心函数：**
```typescript
// 初始化项目状态
initializeProjectState(name, description, lockId, requirementId?, ...)

// 读写项目状态
readProjectState(requirementId, source, cwd?)
writeProjectState(state, cwd?)

// 任务组管理
createTaskGroup(state, stage, groupName, tasks, parallel, ...)
updateTask(state, taskId, status, progress?, artifact?)
getTaskGroups(state, stage?, groupId?)
```

**状态结构：**
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
  rules?: Rules;
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

### 2. Session 模块 (`session.ts`)

**职责：** 会话索引和任务绑定

**核心函数：**
```typescript
// Requirement ID 生成
generateNextRequirementId(source, cwd?)

// Session 绑定
bindSessionToRequirement(lockId, requirementId, source, ...)

// Session 查询
getCurrentSession(lockId, cwd?)
getCurrentRequirementId(lockId, cwd?)
getCurrentTask(cwd?)

// 任务列表
listAllTasks(cwd?)
findSimilarTask(projectName, projectDescription, cwd?, threshold?)
```

**Requirement ID 格式：**
```
YYYYMMDD_XXX_source
例如：20260509_001_auto_assembled
```

### 3. Knowledge 模块 (`knowledge.ts`)

**职责：** 知识库管理

**核心函数：**
```typescript
// 主题管理
createTopic(topicSlug, title, description, cwd?)
topicExists(topicSlug, cwd?)
getTopic(topic, cwd?)

// 文档读写
readKnowledgeDoc(topic, category, doc, cwd?)
readAllKnowledgeDocs(topic, category, cwd?)
writeKnowledgeDoc(topic, category, doc, content, mode, ...)

// 索引管理
readKnowledgeIndex(cwd?)
writeKnowledgeIndex(index, cwd?)
rebuildKnowledgeIndex(cwd?)
```

**知识库结构：**
```typescript
interface KnowledgeIndex {
  topics: Record<string, {
    title: string;
    description?: string;
    status: 'in_progress' | 'completed' | 'paused';
    created_at: string;
    updated_at: string;
    domains: Record<string, string[]>;  // category -> [doc names]
  }>;
}
```

### 4. Workflow 模块 (`workflow.ts`)

**职责：** 工作流发现和匹配

**核心函数：**
```typescript
// 工作流发现
readAllWorkflows(cwd?)

// 工作流匹配
matchWorkflow(taskDescription, workflows)

// 阶段构建
buildStagesFromWorkflow(workflow)
buildStagesAuto(taskDescription)
buildDefaultGates(stages)
```

**工作流规格：**
```typescript
interface WorkflowSpec {
  name: string;
  description: string;
  triggers: {
    keywords: string[];
    patterns: string[];
  };
  pipeline: StageDefinition[];
  gates?: Gate[];
  rules?: Rules;
  execution_flow?: ExecutionFlow;
}
```

### 5. Lock 模块 (`lock.ts`)

**职责：** 窗口锁定和进程检测

**核心函数：**
```typescript
// 进程会话 ID
getProcessSessionId(): string

// 窗口锁
acquireWindowLock(cwd?): string
getCurrentLockId(cwd?): string

// 进程检测
isProcessAlive(pid: number): boolean
isLockStale(lockPath: string, staleLockMs?): boolean
```

## MCP 工具集

### State 工具

| 工具名 | 描述 |
|--------|------|
| `opc_state_read` | 读取当前项目状态 |
| `opc_state_init` | 初始化新项目状态 |
| `opc_state_write` | 更新项目状态 |
| `opc_state_clear` | 清除当前任务 |

### Session 工具

| 工具名 | 描述 |
|--------|------|
| `opc_sessions_list` | 列出所有任务 |

### Task Group 工具

| 工具名 | 描述 |
|--------|------|
| `opc_task_group_create` | 创建并行任务组 |
| `opc_task_update` | 更新任务状态 |
| `opc_task_group_status` | 获取任务组状态 |

### Handoff 工具

| 工具名 | 描述 |
|--------|------|
| `opc_handoff` | Agent 交接 |

### Workflow 工具

| 工具名 | 描述 |
|--------|------|
| `opc_workflows_path` | 获取工作流目录路径 |

### Knowledge 工具

| 工具名 | 描述 |
|--------|------|
| `opc_knowledge_init` | 初始化知识库主题 |
| `opc_knowledge_read` | 读取知识文档 |
| `opc_knowledge_write` | 写入知识文档 |
| `opc_knowledge_exists` | 检查文档是否存在 |
| `opc_knowledge_list` | 列出知识主题 |
| `opc_knowledge_docs` | 列出类别文档 |
| `opc_knowledge_list_brief` | 简要列出文档 |
| `opc_knowledge_rebuild_index` | 重建知识索引 |

## 数据流

### 任务初始化流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    任务初始化流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. opc_state_init(project_name, project_description)           │
│     │                                                            │
│     ▼                                                            │
│  2. getCurrentLockId() → lockId                                  │
│     │                                                            │
│     ▼                                                            │
│  3. findSimilarTask() → 检查相似任务                             │
│     │                                                            │
│     ├── 找到相似任务 (score >= 0.5)                              │
│     │   └── 复用现有 requirement_id                              │
│     │                                                            │
│     └── 未找到相似任务                                           │
│         │                                                        │
│         ▼                                                        │
│     4. matchWorkflow() → 匹配工作流                              │
│         │                                                        │
│         ▼                                                        │
│     5. generateNextRequirementId(source) → 新 requirement_id   │
│                                                                  │
│     ▼                                                            │
│  6. findSimilarKnowledgeTopic() → 匹配知识主题                   │
│     │                                                            │
│     ▼                                                            │
│  7. bindSessionToRequirement(lockId, requirementId, source)     │
│     │                                                            │
│     ▼                                                            │
│  8. initializeProjectState(...) → 创建 ProjectState              │
│     │                                                            │
│     ▼                                                            │
│  9. writeProjectState(state)                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 知识流模式

```
┌─────────────────────────────────────────────────────────────────┐
│                    知识流模式                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE STAGE:                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. opc_state_read() → requirement_id                    │   │
│  │ 2. 解析 workflow 的 knowledge config                     │   │
│  │ 3. 对每个 read_before domain:                           │   │
│  │    - opc_knowledge_read(requirementId, domain)          │   │
│  │ 4. 合并所有知识到 context                                │   │
│  │ 5. 注入知识上下文到 agent dispatch                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  STAGE EXECUTION: Agent 执行任务（带完整上下文）                  │
│                              ↓                                   │
│  AFTER STAGE:                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 6. 提取知识更新从 agent output                           │   │
│  │ 7. opc_knowledge_write(requirementId, domain, doc, ...) │   │
│  │ 8. 知识现在可用于下一阶段                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 技术栈

- **运行时：** Node.js
- **协议：** MCP (Model Context Protocol)
- **SDK：** @modelcontextprotocol/sdk
- **语言：** TypeScript
- **构建：** esbuild (bundle) + tsc (declarations)

## 文件 I/O 策略

### 原子写入

```typescript
function atomicWriteJson(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tempPath, filePath);
}
```

### 安全读取

```typescript
function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
```

## Git 集成

### 自动更新 .gitignore

```typescript
// 添加到 .gitignore
# OPC state - personal session data, don't commit
.opc/state/
```

### Git Root 检测

```typescript
function getWorktreeRoot(cwd?: string): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: effectiveCwd,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return effectiveCwd;
  }
}
```

## 扩展性

### 添加新工具

1. 在 `tools.ts` 中定义工具 schema
2. 在 `handlers/` 中实现 handler
3. 在 `handlers/index.ts` 中注册

### 添加新工作流

1. 在 `.opc/workflows/` 中创建 JSON 文件
2. 定义 triggers、pipeline、gates、rules

### 添加新知识类别

知识类别是灵活的字符串类型，无需预定义。推荐类别：
- requirement, design, backend, ios, android, harmony, web, miniprogram
- qa, ship, growth
- bug-fix, issue, tech-doc, guide, api, architecture