---
name: OPC Knowledge 快速开始
description: OPC Knowledge 快速开始指南，包括安装、基本使用、常用命令和工作流示例。
category: guide
topic: opc-state
created_at: 2026-05-09T09:04:54.243Z
updated_at: 2026-05-09T09:04:54.243Z
tags: [quick-start, guide, tutorial, getting-started]
---
# OPC Knowledge 快速开始

## 安装

OPC Knowledge 是 opc-founder 插件的一部分，通过 MCP 服务器提供工具。

### 前置条件

- Node.js 18+
- Claude Code CLI

### 安装 opc-founder 插件

```bash
# 通过 /opc-plugin 安装
/opc-plugin install

# 或安装完整套件
/opc-plugin install all
```

## 基本使用

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
**Knowledge Topic:** user-auth (matched 75%)

🔧 **Pipeline:** Auto-assembled

### Pipeline Stages

- **product** (required) - 需求分析和规格定义
- **design** (required) - UI/UX 设计
- **dev** (required) - TDD 开发
- **qa** (required) - 测试验证
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
**Knowledge Topic:** user-auth
**Current Stage:** product

### Pipeline Progress

🔄 **product**: in_progress
⏳ **design**: pending
⏳ **dev**: pending
⏳ **qa**: pending

### Rules
- ✅ TDD enabled
- ✅ SDD enabled
- ✅ Knowledge flow enabled
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
```

### 4. 知识库操作

```typescript
// 初始化知识主题
opc_knowledge_init({
  title: "用户认证系统",
  en_topic_name: "user-auth"
})

// 写入知识文档
opc_knowledge_write({
  category: "backend",
  doc: "api",
  content: "# 用户认证 API\n\n## 登录接口\n...",
  name: "用户认证API文档",
  description: "描述登录、注册、密码重置等API接口",
  tags: ["api", "authentication"],
  mode: "overwrite"
})

// 读取知识文档
opc_knowledge_read({
  topic: "user-auth",
  category: "backend",
  doc: "api"
})
```

## 常用命令

### 状态管理

| 命令 | 描述 |
|------|------|
| `opc_state_init` | 初始化新任务 |
| `opc_state_read` | 查看当前状态 |
| `opc_state_write` | 更新状态 |
| `opc_state_clear` | 清除当前任务 |

### 知识库

| 命令 | 描述 |
|------|------|
| `opc_knowledge_init` | 初始化知识主题 |
| `opc_knowledge_read` | 读取知识文档 |
| `opc_knowledge_write` | 写入知识文档 |
| `opc_knowledge_list` | 列出知识主题 |
| `opc_knowledge_exists` | 检查文档存在 |

### 任务管理

| 命令 | 描述 |
|------|------|
| `opc_sessions_list` | 列出所有任务 |
| `opc_task_group_create` | 创建任务组 |
| `opc_task_update` | 更新任务状态 |
| `opc_handoff` | Agent 交接 |

## 工作流示例

### 新功能开发

```
1. /opc 实现用户认证功能
   → 自动匹配 feature-development 工作流
   → 创建任务和知识主题

2. Product 阶段
   → product-agent 执行
   → 写入 requirement/main.md

3. Design 阶段
   → 读取 requirement 知识
   → design-agent 执行
   → 写入 design/ui.md

4. Dev 阶段
   → 读取 requirement + design 知识
   → frontend-agent + backend-agent 并行
   → 写入 web/tech.md + backend/api.md

5. QA 阶段
   → 读取所有实现知识
   → qa-agent 执行
   → 写入 qa/test-plan.md
```

### Bug 修复

```
1. /opc 修复登录页面的崩溃问题
   → 自动匹配 bug-fix 工作流
   → 创建任务

2. Diagnosis 阶段
   → 分析问题根因

3. Dev 阶段
   → 修复代码
   → 更新相关知识

4. QA 阶段
   → 验证修复
```

## 目录结构

```
.opc/
├── state/
│   ├── sessions/
│   │   └── 20260509_001_auto_assembled.json
│   ├── sessions.json
│   └── locks/
│       └── pid-12345-1715234567890.lock
├── knowledge/
│   ├── index.json
│   └── user-auth/
│       ├── requirement/
│       │   └── main.md
│       ├── design/
│       │   └── ui.md
│       └── backend/
│           └── api.md
└── workflows/
    └── feature-development.json
```

## 下一步

- [使用指南](guide.md) - 完整使用指南
- [API 参考](../api/reference.md) - MCP 工具 API
- [技术架构](../tech-doc/architecture.md) - 架构设计
