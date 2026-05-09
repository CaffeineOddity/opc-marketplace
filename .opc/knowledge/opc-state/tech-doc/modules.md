---
name: OPC Knowledge 核心模块详解
description: 详细描述 OPC Knowledge 系统的五个核心模块：State、Session、Knowledge、Workflow 和 Lock 的实现细节。
category: tech-doc
topic: opc-state
created_at: 2026-05-09T09:02:03.450Z
updated_at: 2026-05-09T09:02:03.450Z
tags: [modules, implementation, typescript, mcp]
---
# OPC Knowledge 核心模块详解

## 概述

本文档详细描述 OPC Knowledge 系统的五个核心模块：State、Session、Knowledge、Workflow 和 Lock。

## 1. State 模块 (`state.ts`)

### 职责

项目状态管理和持久化，包括：
- 项目状态初始化
- 状态读写
- 任务组管理
- Agent 交接记录

### 核心函数

#### 状态管理

```typescript
// 初始化项目状态
initializeProjectState(
  name: string,
  description: string,
  lockId: string,
  requirementId?: string,
  cwd?: string,
  workflow?: WorkflowSpec | null,
  workflowSource?: 'matched' | 'auto_assembled',
  workflowConfidence?: number,
  knowledgeTopic?: string,
  knowledgeCategory?: string
): ProjectState

// 读取项目状态
readProjectState(
  requirementId: string,
  source: 'matched' | 'auto_assembled',
  cwd?: string
): ProjectState | null

// 写入项目状态
writeProjectState(state: ProjectState, cwd?: string): void
```

#### 任务组管理

```typescript
// 创建任务组
createTaskGroup(
  state: ProjectState,
  stage: string,
  groupName: string,
  tasks: Array<{ agent: string; description: string; dependencies?: string[] }>,
  parallel: boolean,
  completionCondition: 'all' | 'any' | 'threshold',
  threshold?: number,
  cwd?: string
): { state: ProjectState; groupId: string }

// 更新任务状态
updateTask(
  state: ProjectState,
  taskId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  progress?: number,
  artifact?: string,
  cwd?: string
): ProjectState

// 获取任务组
getTaskGroups(
  state: ProjectState,
  stage?: string,
  groupId?: string
): TaskGroup[]
```

#### Agent 交接

```typescript
// 记录交接
recordHandoff(
  fromAgent: string,
  toAgent: string,
  artifacts: string[],
  constraints: string[],
  context: string,
  lockId: string,
  cwd?: string
): HandoffRecord

// 获取交接记录
getHandoffs(lockId: string, cwd?: string): HandoffRecord[]
```

### 状态结构

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

---

## 2. Session 模块 (`session.ts`)

### 职责

会话索引和任务绑定，包括：
- Requirement ID 生成
- Session 绑定和查询
- 任务列表管理
- 相似任务匹配

### 核心函数

#### Requirement ID 生成

```typescript
// 生成下一个 Requirement ID
// 格式: YYYYMMDD_XXX_source
generateNextRequirementId(
  source: 'matched' | 'auto_assembled' = 'auto_assembled',
  cwd?: string
): string
```

**ID 格式说明：**
- `YYYYMMDD` - 日期部分
- `XXX` - 当日序号（001, 002, ...）
- `source` - 来源（matched 或 auto_assembled）

**示例：**
- `20260509_001_auto_assembled` - 2026年5月9日第1个自动组装的任务
- `20260509_002_matched` - 2026年5月9日第2个匹配工作流的任务

#### Session 绑定

```typescript
// 绑定 session 到 requirement
bindSessionToRequirement(
  lockId: string,
  requirementId: string,
  source: 'matched' | 'auto_assembled',
  workflowName?: string,
  cwd?: string
): void

// 获取当前 session
getCurrentSession(
  lockId: string,
  cwd?: string
): SessionIndex['sessions'][string] | null

// 获取当前 requirement_id
getCurrentRequirementId(lockId: string, cwd?: string): string | null
```

#### 任务查询

```typescript
// 列出所有任务
listAllTasks(cwd?: string): string[]

// 查找相似任务
findSimilarTask(
  projectName: string,
  projectDescription: string,
  cwd?: string,
  threshold: number = 0.5
): { requirementId: string; source: string; state: ProjectState; score: number } | null

// 获取当前任务
getCurrentTask(cwd?: string): ProjectState | null

// 清除当前任务
clearCurrentTask(cwd?: string): boolean
```

### 相似度匹配算法

```typescript
// 简单的词频匹配算法
function calculateSimilarity(query: string, target: string): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const targetWords = target.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  
  let matchCount = 0;
  for (const queryWord of queryWords) {
    for (const targetWord of targetWords) {
      if (queryWord === targetWord || 
          queryWord.includes(targetWord) || 
          targetWord.includes(queryWord)) {
        matchCount++;
        break;
      }
    }
  }
  
  return queryWords.length > 0 ? matchCount / queryWords.length : 0;
}
```

---

## 3. Knowledge 模块 (`knowledge.ts`)

### 职责

知识库管理，包括：
- 主题管理
- 文档读写
- Frontmatter 处理
- 索引管理

### 核心函数

#### 主题管理

```typescript
// 创建主题
createTopic(
  topicSlug: string,
  title: string,
  description: string,
  cwd?: string
): { topic: string; title: string }

// 检查主题存在
topicExists(topicSlug: string, cwd?: string): boolean

// 获取主题信息
getTopic(topic: string, cwd?: string): KnowledgeIndex['topics'][string] | null

// 生成主题 slug
generateTopicSlug(title: string): string
```

#### 文档读写

```typescript
// 读取单个文档
readKnowledgeDoc(
  topic: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): string | null

// 读取类别下所有文档
readAllKnowledgeDocs(
  topic: string,
  category: KnowledgeCategory,
  cwd?: string
): string | null

// 写入文档
writeKnowledgeDoc(
  topic: string,
  category: KnowledgeCategory,
  doc: string,
  content: string,
  mode: 'append' | 'update' | 'overwrite' = 'append',
  section?: string,
  cwd?: string,
  meta?: Partial<KnowledgeDocMeta>
): void

// 检查文档存在
knowledgeExists(
  topic: string,
  category?: KnowledgeCategory,
  doc?: string,
  cwd?: string
): boolean
```

#### Frontmatter 处理

```typescript
// 解析 frontmatter
parseFrontmatter(content: string): { meta: Partial<KnowledgeDocMeta>; content: string }

// 生成 frontmatter
generateFrontmatter(meta: KnowledgeDocMeta): string

// 读取带元数据的文档
readKnowledgeDocWithMeta(
  topic: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): KnowledgeDocWithMeta | null
```

#### 索引管理

```typescript
// 读取索引
readKnowledgeIndex(cwd?: string): KnowledgeIndex

// 写入索引
writeKnowledgeIndex(index: KnowledgeIndex, cwd?: string): void

// 重建索引
rebuildKnowledgeIndex(cwd?: string): {
  index: KnowledgeIndex;
  stats: {
    topicsFound: number;
    categoriesFound: number;
    docsFound: number;
    topicsAdded: string[];
    topicsRemoved: string[];
  };
}

// 列出文档简要信息
listKnowledgeDocsBrief(
  topic?: string,
  category?: KnowledgeCategory,
  cwd?: string
): KnowledgeDocMeta[]
```

### 文档类型默认值

系统为常见文档类型提供默认元数据：

| 文档类型 | 默认名称 | 默认描述 |
|----------|----------|----------|
| `architecture` | 技术架构文档 | 描述系统的整体架构设计 |
| `tech` | 技术方案文档 | 描述技术实现方案 |
| `api` | API接口文档 | 描述API端点和格式 |
| `main` | 需求规格文档 | 描述功能需求和验收标准 |
| `ui` | UI设计文档 | 描述用户界面设计 |
| `test-plan` | 测试计划文档 | 描述测试策略和范围 |
| `deployment` | 部署文档 | 描述部署流程和配置 |

---

## 4. Workflow 模块 (`workflow.ts`)

### 职责

工作流发现和匹配，包括：
- 工作流发现
- 关键词和模式匹配
- 阶段构建
- Gate 和 Rule 处理

### 核心函数

```typescript
// 读取所有工作流
readAllWorkflows(cwd?: string): WorkflowSpec[]

// 匹配工作流
matchWorkflow(
  taskDescription: string,
  workflows: WorkflowSpec[]
): WorkflowSpec | null

// 从工作流构建阶段
buildStagesFromWorkflow(workflow: WorkflowSpec): Record<string, StageState>

// 自动构建阶段
buildStagesAuto(taskDescription: string): Record<string, StageState>

// 构建默认 gates
buildDefaultGates(stages: Record<string, StageState>): Gate[]
```

### 工作流匹配逻辑

```typescript
function matchWorkflow(taskDescription: string, workflows: WorkflowSpec[]): WorkflowSpec | null {
  for (const workflow of workflows) {
    // 检查关键词匹配
    for (const keyword of workflow.triggers.keywords) {
      if (keyword.toLowerCase() in taskDescription.toLowerCase()) {
        return workflow;
      }
    }
    
    // 检查正则模式匹配
    for (const pattern of workflow.triggers.patterns) {
      if (new RegExp(pattern, 'i').test(taskDescription)) {
        return workflow;
      }
    }
  }
  
  return null;
}
```

---

## 5. Lock 模块 (`lock.ts`)

### 职责

窗口锁定和进程检测，包括：
- 进程会话 ID 生成
- 窗口锁获取
- 陈旧锁检测和清理

### 核心函数

```typescript
// 获取进程会话 ID
// 格式: pid-{PID}-{startTimestamp}
getProcessSessionId(): string

// 获取窗口锁
acquireWindowLock(cwd?: string): string

// 获取当前锁 ID
getCurrentLockId(cwd?: string): string

// 检测进程存活
isProcessAlive(pid: number): boolean

// 检测陈旧锁
isLockStale(lockPath: string, staleLockMs?: number): boolean
```

### 锁文件格式

```json
{
  "lockId": "pid-12345-1715234567890",
  "pid": 12345,
  "timestamp": 1715234567890
}
```

### 陈旧锁检测

- 默认超时：30 秒
- 检测方式：`process.kill(pid, 0)` 检测进程存活
- 自动清理：检测到陈旧锁时自动删除

---

## 模块间依赖关系

```
┌─────────────────────────────────────────────────────────────────┐
│                    模块依赖关系                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐                                                    │
│  │  Lock   │ ← 提供窗口锁                                       │
│  └────┬────┘                                                    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────┐     ┌────────────┐                                 │
│  │ Session │ ←── │  Workflow  │                                 │
│  └────┬────┘     └────────────┘                                 │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────┐     ┌────────────┐                                 │
│  │  State  │ ←── │ Knowledge  │                                 │
│  └─────────┘     └────────────┘                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 错误处理

所有模块遵循统一的错误处理模式：

```typescript
// 返回 null 表示不存在或失败
readProjectState(...): ProjectState | null
readKnowledgeDoc(...): string | null

// 抛出异常表示严重错误
writeProjectState(state: ProjectState): void  // 无 requirement_id 时抛出
```

## 文件 I/O 策略

### 原子写入

```typescript
function atomicWriteJson(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tempPath, filePath);  // 原子操作
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
