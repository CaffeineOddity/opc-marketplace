---
name: OPC Knowledge 数据流与生命周期
description: 描述 OPC Knowledge 系统中的数据流和生命周期管理，包括任务初始化、知识流转、状态更新等关键流程。
category: tech-doc
topic: opc-state
created_at: 2026-05-09T09:03:14.242Z
updated_at: 2026-05-09T09:03:14.242Z
tags: [data-flow, lifecycle, state-management, workflow]
---
# OPC Knowledge 数据流与生命周期

## 概述

本文档描述 OPC Knowledge 系统中的数据流和生命周期管理，包括任务初始化、知识流转、状态更新等关键流程。

## 任务初始化流程

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
│     5. generateNextRequirementId(source) → 新 requirement_id     │
│                                                                  │
│     ▼                                                            │
│  6. findSimilarKnowledgeTopic() → 匹配知识主题                   │
│     │                                                            │
│     ├── 找到相似主题 (score >= 0.5)                              │
│     │   └── 设置 knowledge_topic                                 │
│     │                                                            │
│     └── 未找到相似主题                                           │
│         └── knowledge_topic 待后续设置                           │
│                                                                  │
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

## 知识流模式

知识流是 OPC Knowledge 的核心机制，确保跨阶段的知识传递和积累。

```
┌─────────────────────────────────────────────────────────────────┐
│                    知识流模式                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE STAGE:                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. opc_state_read() → knowledge_topic                  │   │
│  │ 2. 解析 workflow 的 knowledge config                     │   │
│  │ 3. 对每个 read_before category:                         │   │
│  │    - opc_knowledge_read(topic, category)                │   │
│  │ 4. 合并所有知识到 context                                │   │
│  │ 5. 注入知识上下文到 agent dispatch                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  STAGE EXECUTION: Agent 执行任务（带完整上下文）                  │
│                              ↓                                   │
│  AFTER STAGE:                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 6. 提取知识更新从 agent output                           │   │
│  │ 7. opc_knowledge_write(topic, category, doc, ...)       │   │
│  │ 8. 知识现在可用于下一阶段                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 知识流配置

工作流中的知识配置：

```typescript
interface StageKnowledgeConfig {
  domain?: string;           // 知识域
  doc?: string;              // 文档名
  read_before?: string[] | boolean;  // 读取前置知识
  write_after?: boolean;     // 完成后写入
  content_template?: string; // 内容模板
}
```

### 阶段到类别映射

| Stage | Category | Doc | 读取 | 写入 |
|-------|----------|-----|------|------|
| product | requirement | main | - | ✅ |
| design | design | ui, interaction | requirement | ✅ |
| dev (web) | web | tech | requirement, design | ✅ |
| dev (ios) | ios | tech | requirement, design | ✅ |
| dev (backend) | backend | api, architecture | requirement, design | ✅ |
| qa | qa | test-plan | requirement, backend | ✅ |
| ship | ship | deployment | backend, web | ✅ |
| growth | growth | metrics | requirement | ✅ |

## 状态生命周期

### 阶段状态

```
pending → in_progress → completed
    │           │
    │           └──→ blocked
    │                   │
    └───────────────────┘
```

### 状态转换规则

| 当前状态 | 可转换到 | 触发条件 |
|----------|----------|----------|
| pending | in_progress | Agent 开始工作 |
| in_progress | completed | 工作完成 |
| in_progress | blocked | 遇到阻塞 |
| blocked | in_progress | 阻塞解除 |
| blocked | pending | 需要重新开始 |

### 任务组状态

```
┌─────────────────────────────────────────────────────────────────┐
│                    任务组生命周期                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. opc_task_group_create()                                      │
│     │                                                            │
│     ▼                                                            │
│  2. 所有任务初始状态: pending                                     │
│     │                                                            │
│     ▼                                                            │
│  3. Agent 开始工作 → task status: in_progress                    │
│     │                                                            │
│     ▼                                                            │
│  4. 任务完成 → task status: completed/failed                     │
│     │                                                            │
│     ▼                                                            │
│  5. 检查完成条件                                                  │
│     │                                                            │
│     ├── all: 所有任务完成                                        │
│     ├── any: 任一任务完成                                        │
│     └── threshold: 达到阈值数量                                  │
│                                                                  │
│     ▼                                                            │
│  6. 任务组标记完成时间                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Agent 交接流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent 交接流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Agent A 完成工作                                             │
│     │                                                            │
│     ▼                                                            │
│  2. opc_handoff({                                                │
│       from_agent: "agent-a",                                     │
│       to_agent: "agent-b",                                       │
│       artifacts: ["spec.md", "design.md"],                       │
│       constraints: ["必须使用 PostgreSQL"],                       │
│       context: "用户认证功能需求已完成..."                        │
│     })                                                           │
│     │                                                            │
│     ▼                                                            │
│  3. 记录 HandoffRecord                                           │
│     │                                                            │
│     ▼                                                            │
│  4. Agent B 接收工作                                             │
│     │                                                            │
│     ├── 读取 artifacts                                           │
│     ├── 了解 constraints                                         │
│     └── 获取 context                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 交接记录结构

```typescript
interface HandoffRecord {
  handoff_id: string;      // 唯一标识
  created_at: string;      // 创建时间
  from_agent: string;      // 交接方
  to_agent: string;        // 接收方
  artifacts: string[];     // 交接产物
  constraints: string[];   // 约束条件
  context: string;         // 上下文信息
  lock_id: string;         // 关联的锁 ID
}
```

## 知识文档生命周期

### 创建

```
1. opc_knowledge_init(title, en_topic_name)
   │
   ├── 创建主题目录
   ├── 初始化 index.json
   └── 设置状态: in_progress
```

### 写入

```
opc_knowledge_write(topic, category, doc, content, mode, ...)
   │
   ├── mode: overwrite - 完全覆盖
   ├── mode: append - 追加内容（默认）
   └── mode: update - 更新章节
```

### 读取

```
opc_knowledge_read(topic, category, doc?)
   │
   ├── 指定 doc: 读取单个文档
   └── 不指定 doc: 读取类别下所有文档
```

### 索引维护

```
自动维护:
- 写入文档时自动更新 index.json

手动重建:
- opc_knowledge_rebuild_index()
  用于索引损坏或手动操作文件后
```

## 窗口锁生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                    窗口锁生命周期                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 进程启动 → getProcessSessionId()                             │
│     │                                                            │
│     ▼                                                            │
│  2. acquireWindowLock() → 创建锁文件                             │
│     │                                                            │
│     ├── 文件已存在且进程存活 → 返回现有 lockId                    │
│     ├── 文件已存在但进程终止 → 清理陈旧锁，创建新锁               │
│     └── 文件不存在 → 创建新锁                                     │
│                                                                  │
│  3. 任务执行期间                                                  │
│     │                                                            │
│     ├── lockId 用于绑定 session                                  │
│     └── lockId 用于记录 handoff                                  │
│                                                                  │
│  4. 进程终止                                                      │
│     │                                                            │
│     └── 锁文件可能残留（下次启动时清理）                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 数据一致性保证

### 原子写入

所有 JSON 文件写入使用原子操作：

```typescript
function atomicWriteJson(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tempPath, filePath);  // 原子 rename
}
```

### 并发控制

- 一个窗口同时只能有一个活跃任务
- 通过 lock 文件实现进程级别的互斥
- 陈旧锁自动清理机制

### 数据恢复

- 任务状态文件独立存储，互不影响
- 知识索引可从文件系统重建
- 历史任务保留完整记录

## Git 集成

### 自动更新 .gitignore

```gitignore
# OPC state - personal session data, don't commit
.opc/state/

# Knowledge library - should be committed
# .opc/knowledge/

# Workflows - should be committed
# .opc/workflows/
```

### 建议提交的内容

| 目录 | 是否提交 | 说明 |
|------|----------|------|
| `.opc/state/` | ❌ | 个人会话数据 |
| `.opc/knowledge/` | ✅ | 团队共享知识 |
| `.opc/workflows/` | ✅ | 工作流规格 |
| `.opc/.project-init` | ✅ | 初始化标记 |
