---
name: OPC State 使用指南
description: OPC State 状态管理系统的完整使用指南，包括快速开始、知识库使用、任务组管理、最佳实践和常见问题。
category: guide
topic: opc-state
created_at: 2026-05-09T08:36:26.111Z
updated_at: 2026-05-09T08:36:26.111Z
tags: [guide, usage, mcp, state-management]
---
# OPC State 使用指南

## 快速开始

### 1. 初始化新任务

```typescript
// 调用 opc_state_init 初始化新任务
opc_state_init({
  project_name: "用户认证功能",
  project_description: "实现用户登录、注册和密码重置功能"
})
```

**返回示例：**
```
## OPC Task Initialized

**Lock ID:** pid-12345-1715234567890
**Project:** 用户认证功能
**Requirement ID:** 20260509_001_auto_assembled
**Knowledge Topic:** (not set)

🔧 **Pipeline:** Auto-assembled

🆕 **Created new task:** 20260509_001_auto_assembled

### Pipeline Stages

- **product** (required) - 需求分析和规格定义
```

### 2. 查看当前状态

```typescript
opc_state_read()
```

**返回示例：**
```
## OPC Project State

**Project:** 用户认证功能
**Requirement ID:** 20260509_001_auto_assembled
**Lock ID:** pid-12345-1715234567890
**Current Stage:** product

### Pipeline Progress

🔄 **product**: in_progress — 需求分析和规格定义
⏳ **design**: pending
⏳ **dev**: pending
⏳ **qa**: pending
```

### 3. 更新状态

```typescript
// 更新阶段状态
opc_state_write({
  stage: "product",
  stage_status: "completed",
  artifact: "spec.md"
})

// 设置知识主题
opc_state_write({
  knowledge_topic: "user-auth"
})

// 记录进度
opc_state_write({
  stage: "dev",
  progress: {
    "red": 100,
    "green": 50,
    "refactor": 0
  }
})

// 记录阻塞
opc_state_write({
  blocker: "等待 API 文档更新"
})
```

### 4. 清除当前任务

```typescript
opc_state_clear()
```

## 知识库使用

### 1. 初始化知识主题

```typescript
opc_knowledge_init({
  title: "用户认证系统",
  en_topic_name: "user-auth"
})
```

### 2. 写入知识文档

```typescript
opc_knowledge_write({
  category: "backend",
  doc: "api",
  content: "# 用户认证 API\n\n## 登录接口\n...",
  name: "用户认证API文档",
  description: "描述登录、注册、密码重置等API接口",
  tags: ["api", "authentication"],
  mode: "overwrite"
})
```

**写入模式：**
- `overwrite` - 完全覆盖现有文档
- `append` - 追加内容到文档末尾
- `update` - 更新特定章节

### 3. 读取知识文档

```typescript
// 读取特定文档
opc_knowledge_read({
  topic: "user-auth",
  category: "backend",
  doc: "api"
})

// 读取类别下所有文档
opc_knowledge_read({
  topic: "user-auth",
  category: "backend"
})
```

### 4. 列出知识主题

```typescript
// 列出所有主题
opc_knowledge_list()

// 按状态过滤
opc_knowledge_list({ status: "in_progress" })

// 按类别过滤
opc_knowledge_list({ category: "backend" })
```

### 5. 检查文档存在

```typescript
opc_knowledge_exists({
  topic: "user-auth",
  category: "backend",
  doc: "api"
})
```

### 6. 重建知识索引

当知识索引损坏或手动操作文件后：

```typescript
opc_knowledge_rebuild_index()
```

## 任务组管理

### 1. 创建并行任务组

```typescript
opc_task_group_create({
  stage: "dev",
  group_name: "前后端并行开发",
  tasks: [
    {
      agent: "frontend-agent",
      description: "实现登录页面 UI"
    },
    {
      agent: "backend-agent",
      description: "实现登录 API"
    }
  ],
  parallel: true,
  completion_condition: "all"
})
```

**完成条件：**
- `all` - 所有任务完成
- `any` - 任一任务完成
- `threshold` - 达到阈值数量

### 2. 更新任务状态

```typescript
opc_task_update({
  task_id: "tg-abc123-task-0",
  status: "completed",
  progress: 100,
  artifact: "src/pages/Login.tsx"
})
```

### 3. 查看任务组状态

```typescript
// 查看所有任务组
opc_task_group_status()

// 查看特定阶段
opc_task_group_status({ stage: "dev" })

// 查看特定任务组
opc_task_group_status({ group_id: "tg-abc123" })
```

## Agent 交接

```typescript
opc_handoff({
  from_agent: "product-agent",
  to_agent: "backend-agent",
  artifacts: ["spec.md", "user-stories.md"],
  constraints: ["必须使用 PostgreSQL", "API 需要 JWT 认证"],
  context: "用户认证功能需求已完成，包含登录、注册、密码重置三个核心功能"
})
```

## 工作流匹配

### 自动匹配

当调用 `opc_state_init` 时，系统会自动：

1. 扫描 `.opc/workflows/` 目录下的工作流规格
2. 根据关键词和正则模式匹配
3. 应用匹配的工作流配置

### 工作流规格示例

```json
{
  "name": "feature-development",
  "description": "标准功能开发流程",
  "triggers": {
    "keywords": ["功能", "feature", "实现", "开发"],
    "patterns": ["build\\s+\\w+", "create\\s+\\w+"]
  },
  "pipeline": [
    {
      "stage": "product",
      "required": true,
      "agents": ["product-agent"],
      "skills": ["spec-driven-development"],
      "knowledge": {
        "domain": "requirement",
        "doc": "main",
        "write_after": true
      }
    },
    {
      "stage": "dev",
      "required": true,
      "agents": ["frontend-agent", "backend-agent"],
      "agent_mode": "parallel",
      "constraints": ["tdd_red_first"],
      "knowledge": {
        "frontend": {
          "domain": "platforms",
          "doc": "tech",
          "read_before": ["requirement"],
          "write_after": true
        },
        "backend": {
          "domain": "backend",
          "doc": "api",
          "read_before": ["requirement"],
          "write_after": true
        }
      }
    }
  ],
  "gates": [
    {
      "name": "sdd_spec_required",
      "description": "Product 必须产出 Spec",
      "check": "stages.product.artifacts.includes('spec.md')",
      "blocker": "Dev 阻止：缺少 Spec"
    }
  ],
  "rules": {
    "tdd": true,
    "sdd": true,
    "parallel_allowed": true,
    "knowledge_enabled": true
  }
}
```

## 最佳实践

### 1. 任务命名

**推荐：**
- "用户认证功能"
- "订单管理系统"
- "支付流程优化"

**避免：**
- "做用户认证"（动词开头）
- "auth"（过于简短）
- "实现一个可以让用户登录的功能"（过长）

### 2. 知识主题命名

**推荐：**
- `user-auth`（功能名）
- `ios-localization`（平台-功能）
- `payment-integration`（功能名）

**避免：**
- `auth`（过于简短）
- `用户认证系统`（中文，不利于路径）
- `ios-user-authentication-feature`（过长）

### 3. 文档命名

**推荐：**
- `architecture`（架构文档）
- `api`（API 文档）
- `guide`（使用指南）
- `test-plan`（测试计划）

**避免：**
- `user-auth-architecture`（冗余，路径已包含主题）
- `doc1`、`notes`（无意义）

### 4. 阶段流转

```
product → design → dev → qa → ship → growth
```

**状态转换：**
- `pending` → `in_progress` → `completed`
- 任何阶段都可以变为 `blocked`

### 5. 知识流

**Before Stage:**
```typescript
// 1. 读取当前状态获取 requirement_id
const state = opc_state_read()

// 2. 根据阶段配置读取知识
opc_knowledge_read({
  topic: state.knowledge_topic,
  category: "requirement"
})
```

**After Stage:**
```typescript
// 写入知识供后续阶段使用
opc_knowledge_write({
  category: "backend",
  doc: "api",
  content: "...",
  name: "API文档",
  description: "..."
})
```

## 常见问题

### Q: 如何恢复之前的任务？

A: 使用 `opc_state_init` 并提供相似的项目名称，系统会自动匹配（相似度 >= 50%）。

### Q: 如何处理陈旧的锁？

A: 系统会自动检测并清理超过 30 秒且进程已终止的锁。

### Q: 知识索引损坏怎么办？

A: 调用 `opc_knowledge_rebuild_index` 从文件系统重建索引。

### Q: 如何查看所有历史任务？

A: 调用 `opc_sessions_list` 列出所有任务。

### Q: 一个窗口可以有多个任务吗？

A: 不可以。一个窗口同时只能有一个活跃任务。要切换任务，先 `opc_state_clear` 清除当前任务。

## 目录结构参考

```
.opc/
├── state/
│   ├── sessions/
│   │   ├── 20260509_001_auto_assembled.json  # 任务状态
│   │   └── 20260509_002_matched.json
│   ├── sessions.json       # Session 索引
│   └── locks/
│       └── pid-12345-1715234567890.lock
├── knowledge/
│   ├── index.json          # 知识索引
│   └── user-auth/          # 知识主题
│       ├── requirement/
│       │   └── main.md
│       ├── backend/
│       │   └── api.md
│       └── ios/
│           └── guide.md
└── workflows/
    └── feature-development.json
```