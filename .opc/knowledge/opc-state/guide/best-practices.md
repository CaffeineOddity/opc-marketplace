---
name: OPC Knowledge 最佳实践
description: OPC Knowledge 最佳实践，包括任务命名、知识主题命名、知识流、任务组管理、Agent 交接等最佳实践。
category: guide
topic: opc-state
created_at: 2026-05-09T09:05:30.344Z
updated_at: 2026-05-09T09:05:30.344Z
tags: [best-practices, guide, conventions, teamwork]
---
# OPC Knowledge 最佳实践

## 任务命名

### 推荐

- "用户认证功能" - 名词短语
- "订单管理系统" - 清晰描述
- "支付流程优化" - 包含目标

### 避免

- "做用户认证" - 动词开头
- "auth" - 过于简短
- "实现一个可以让用户登录的功能" - 过长

## 知识主题命名

### 推荐

- `user-auth` - 功能名
- `ios-localization` - 平台-功能
- `payment-integration` - 功能名

### 避免

- `auth` - 过于简短
- `用户认证系统` - 中文，不利于路径
- `ios-user-authentication-feature` - 过长

## 知识文档命名

### 推荐

- `architecture` - 架构文档
- `api` - API 文档
- `guide` - 使用指南
- `test-plan` - 测试计划

### 避免

- `user-auth-architecture` - 冗余（路径已包含主题）
- `doc1`、`notes` - 无意义

## 知识文档元数据

### 必须提供

```typescript
opc_knowledge_write({
  category: "backend",
  doc: "api",
  content: "...",
  name: "用户认证API文档",        // 人类可读名称
  description: "描述登录、注册、密码重置等API接口",  // 清晰描述
  tags: ["api", "authentication"]  // 相关标签
})
```

### 元数据指南

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | 人类可读名称 | `用户认证API文档` |
| `description` | 文档内容和用途 | `描述登录、注册、密码重置等API接口` |
| `tags` | 过滤标签 | `["api", "authentication"]` |

## 阶段流转

### 标准流程

```
product → design → dev → qa → ship → growth
```

### 状态转换

| 当前状态 | 可转换到 | 触发条件 |
|----------|----------|----------|
| pending | in_progress | Agent 开始工作 |
| in_progress | completed | 工作完成 |
| in_progress | blocked | 遇到阻塞 |
| blocked | in_progress | 阻塞解除 |

## 知识流最佳实践

### Before Stage

```typescript
// 1. 获取当前状态
const state = opc_state_read()

// 2. 读取前置知识
const requirement = opc_knowledge_read({
  topic: state.knowledge_topic,
  category: "requirement"
})

const design = opc_knowledge_read({
  topic: state.knowledge_topic,
  category: "design"
})

// 3. 注入到 Agent 上下文
```

### After Stage

```typescript
// 提取知识更新
const knowledgeUpdate = extractFromAgentOutput(output)

// 写入知识
opc_knowledge_write({
  category: currentCategory,
  doc: "tech",
  content: knowledgeUpdate,
  name: "技术方案文档",
  description: "描述技术实现方案",
  tags: ["tech", "implementation"],
  mode: "append"  // 默认追加模式
})
```

## 任务组管理

### 创建任务组

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

### 完成条件选择

| 条件 | 使用场景 |
|------|----------|
| `all` | 所有任务都必须完成 |
| `any` | 任一任务完成即可 |
| `threshold` | 达到指定数量完成 |

## Agent 交接

### 交接内容

```typescript
opc_handoff({
  from_agent: "product-agent",
  to_agent: "backend-agent",
  artifacts: ["spec.md", "user-stories.md"],
  constraints: [
    "必须使用 PostgreSQL",
    "API 需要 JWT 认证",
    "支持多租户"
  ],
  context: "用户认证功能需求已完成，包含登录、注册、密码重置三个核心功能"
})
```

### 交接最佳实践

1. **明确产物** - 列出所有相关文件
2. **清晰约束** - 技术选型、架构决策
3. **完整上下文** - 业务背景、决策原因

## Git 集成

### 应提交的内容

| 目录 | 提交 | 说明 |
|------|------|------|
| `.opc/knowledge/` | ✅ | 团队共享知识 |
| `.opc/workflows/` | ✅ | 工作流规格 |
| `.opc/.project-init` | ✅ | 初始化标记 |
| `.opc/state/` | ❌ | 个人会话数据 |

### .gitignore 配置

```gitignore
# OPC state - personal session data
.opc/state/

# Knowledge and workflows should be committed
# .opc/knowledge/
# .opc/workflows/
```

## 错误处理

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `No active task` | 未初始化任务 | 调用 `opc_state_init` |
| `Knowledge document not found` | 文档不存在 | 检查 topic/category/doc |
| `Unknown tool` | 工具名错误 | 检查工具名拼写 |

### 错误恢复

```typescript
// 索引损坏时重建
opc_knowledge_rebuild_index()

// 任务状态异常时清除
opc_state_clear()
```

## 性能优化

### 批量读取

```typescript
// 使用 list_brief 获取文档列表
const docs = opc_knowledge_list_brief({
  topic: "user-auth"
})

// 按需读取具体文档
for (const doc of docs) {
  if (needThisDoc(doc)) {
    opc_knowledge_read({
      topic: doc.topic,
      category: doc.category,
      doc: doc.name
    })
  }
}
```

### 避免重复写入

```typescript
// 检查文档是否存在
if (!opc_knowledge_exists({
  topic: "user-auth",
  category: "backend",
  doc: "api"
})) {
  // 不存在时创建
  opc_knowledge_write({...})
}
```

## 团队协作

### 知识共享

1. 提交 `.opc/knowledge/` 到 Git
2. 拉取最新知识后再开始工作
3. 完成后推送知识更新

### 工作流共享

1. 提交 `.opc/workflows/` 到 Git
2. 团队使用统一的工作流规格
3. 修改工作流需要团队评审

### 命名约定

1. 使用英文主题名（路径友好）
2. 使用中文文档名（人类可读）
3. 遵循团队约定的类别划分
