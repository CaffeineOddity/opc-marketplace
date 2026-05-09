---
name: OPC Knowledge 系统概述
description: OPC Knowledge 系统概述，包括项目定位、核心价值、系统架构、技术栈和核心模块介绍。
category: tech-doc
topic: opc-state
created_at: 2026-05-09T09:01:02.217Z
updated_at: 2026-05-09T09:01:02.217Z
tags: [overview, architecture, mcp, typescript]
---
# OPC Knowledge 系统概述

## 项目定位

OPC Knowledge 是 OPC (One-Person Company) 框架的核心知识管理系统，提供跨会话持久化、阶段追踪和 Agent 交接能力。它是一个基于 MCP (Model Context Protocol) 的状态管理服务器。

## 核心价值

| 特性 | 描述 |
|------|------|
| **跨会话记忆** | 暂停和恢复项目，保留完整上下文 |
| **阶段追踪** | 追踪 product → design → dev → qa → ship → growth 全流程 |
| **知识积累** | 自演化的知识库，每个任务都积累知识 |
| **Agent 交接** | 在代理之间传递工作时保留上下文和约束 |
| **并行任务组** | 追踪并发代理，支持每个任务的进度 |

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPC Knowledge 架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ Founder Agent   │    │ Workflow Specs  │                    │
│  │ (Orchestrator)  │    │ (.opc/workflows)│                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           ▼                      ▼                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    MCP Server                            │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │ State   │ │ Session │ │Knowledge│ │ Workflow│       │   │
│  │  │ Module  │ │ Module  │ │ Module  │ │ Module  │       │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    File System                           │   │
│  │  .opc/                                                   │   │
│  │  ├── state/sessions/    # 任务状态                       │   │
│  │  ├── knowledge/          # 知识库                        │   │
│  │  └── workflows/          # 工作流规格                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | 18+ |
| 协议 | MCP (Model Context Protocol) | Latest |
| SDK | @modelcontextprotocol/sdk | Latest |
| 语言 | TypeScript | 5.x |
| 构建 | esbuild + tsc | Latest |

## 核心模块

### 1. State 模块 (`state.ts`)
- 项目状态管理和持久化
- 任务组管理
- Agent 交接记录

### 2. Session 模块 (`session.ts`)
- 会话索引和任务绑定
- Requirement ID 生成
- 相似任务匹配

### 3. Knowledge 模块 (`knowledge.ts`)
- 知识库管理
- 主题和文档组织
- Frontmatter 解析和生成

### 4. Workflow 模块 (`workflow.ts`)
- 工作流发现和匹配
- 阶段构建
- Gate 和 Rule 处理

### 5. Lock 模块 (`lock.ts`)
- 窗口锁定机制
- 进程检测
- 陈旧锁清理

## MCP 工具集

### State 工具
- `opc_state_read` - 读取项目状态
- `opc_state_init` - 初始化新任务
- `opc_state_write` - 更新状态
- `opc_state_clear` - 清除任务

### Knowledge 工具
- `opc_knowledge_init` - 初始化知识主题
- `opc_knowledge_read` - 读取知识文档
- `opc_knowledge_write` - 写入知识文档
- `opc_knowledge_exists` - 检查文档存在
- `opc_knowledge_list` - 列出知识主题
- `opc_knowledge_list_brief` - 简要列出文档
- `opc_knowledge_docs` - 列出类别文档
- `opc_knowledge_rebuild_index` - 重建索引

### Task Group 工具
- `opc_task_group_create` - 创建任务组
- `opc_task_update` - 更新任务状态
- `opc_task_group_status` - 获取任务组状态

### 其他工具
- `opc_sessions_list` - 列出所有任务
- `opc_handoff` - Agent 交接
- `opc_workflows_path` - 获取工作流路径

## 设计理念

### 多任务历史模型

每个 requirement 有独立的状态文件，保留完整历史。一个窗口同时只能有一个活跃任务。

```
Session Index (sessions.json)
    │
    │  lock_id → requirement_id
    │
    ▼
State Files (sessions/*.json)
    │
    │  每个任务独立存储
    │  保留完整历史
    │
    ▼
Knowledge Library
    │
    │  按主题组织
    │  跨任务共享
    │
    └── 知识积累和复用
```

### 知识主题匹配

系统自动匹配相似的知识主题（>=50% 相似度），实现知识复用。

### 窗口锁定机制

采用 PID + 原子文件创建实现窗口检测，自动清理陈旧锁。

## 扩展性

### 添加新工具
1. 在 `tools.ts` 中定义工具 schema
2. 在 `handlers/` 中实现 handler
3. 在 `handlers/index.ts` 中注册

### 添加新工作流
1. 在 `.opc/workflows/` 中创建 JSON 文件
2. 定义 triggers、pipeline、gates、rules

### 添加新知识类别
知识类别是灵活的字符串类型，无需预定义。

## 相关文档

- [技术架构文档](architecture.md) - 详细的架构设计
- [API 参考](../api/reference.md) - MCP 工具 API
- [使用指南](../guide/guide.md) - 快速开始和最佳实践
