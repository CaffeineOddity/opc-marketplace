---
name: API 指南
description: OPC 知识库管理 MCP 工具 API 规范，包括知识初始化、读写操作、特征匹配和文档组织等能力。
category: api_guide
feature_name: knowledge-library
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [api_guide]
---

## 概览

OPC 知识库管理系统提供自进化的知识积累能力。通过 MCP 工具，系统自动为每个功能创建知识域，实现跨阶段上下文传递和知识复用。

### 核心能力

| 能力 | 工具 | 描述 |
|------|------|------|
| 知识初始化 | opc_knowledge_init | 创建知识域目录结构 |
| 知识读取 | opc_knowledge_read | 按类别读取知识文档 |
| 知识写入 | opc_knowledge_write | 写入或更新知识文档 |
| 知识存在检查 | opc_knowledge_exists | 检查知识是否存在 |
| 知识列表 | opc_knowledge_list | 列出所有知识特征 |
| 文档列表 | opc_knowledge_docs | 列出类别下的文档 |
| 简要列表 | opc_knowledge_list_brief | 渐进加载的元数据列表 |
| 索引重建 | opc_knowledge_rebuild_index | 重建知识库索引 |

## 认证与授权

MCP 工具在 Claude Code 环境内运行，继承其认证机制。知识文件存储在项目目录，可提交到 Git 实现团队共享。

### 数据安全

- 知识文件存储在 `.opc/knowledge/` 目录
- 可提交到 Git，团队共享
- 不包含敏感信息
- 明文存储，人类可读

## 知识类别

| 类别 | 阶段 | 描述 |
|------|------|------|
| requirement | Product | 需求规格、用户故事 |
| design | Design | UI/UX 设计、交互流程 |
| architecture | Dev | 系统架构、技术选型 |
| tech_guide | Dev | 技术指南、实现要点 |
| api_guide | Dev | API 文档、接口规范 |
| core_flows | Dev | 核心业务流程 |
| data_flows | Dev | 数据流转设计 |
| qa_test | QA | 测试计划、测试用例 |
| issues | Dev | 问题记录、Bug 修复 |
| growth | Growth | 增长指标、分析报告 |
| adr | Dev | 架构决策记录 |
| security | Dev | 安全设计、审计报告 |
| operations | Ship | 运维手册、部署指南 |
| observability | Ship | 监控告警配置 |
| release | Ship | 发布记录、变更日志 |
| migration | Dev | 迁移计划、数据迁移 |
| glossary | All | 术语表、缩写说明 |
| research | Product | 调研报告、竞品分析 |

## API 列表

### opc_knowledge_init - 初始化知识域

**描述**: 为功能创建知识域目录结构和索引条目。

**调用方式**:
```javascript
opc_knowledge_init({
  title: string,
  feature_name: string,
  scaffold?: boolean,
  categories?: string[],
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| title | string | 是 | 功能标题（中英文均可） |
| feature_name | string | 是 | 特征目录名（如 "localization", "app-login"） |
| scaffold | boolean | 否 | 是否创建标准文档模板，默认 true |
| categories | array | 否 | 自定义类别列表，默认使用推荐类别 |
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**返回值**:

```markdown
## Knowledge Library Initialized

**Feature:** ios-localization
**Title:** iOS 多语言支持
**Path:** .opc/knowledge/ios-localization/

Knowledge documents can be created on-demand, or scaffolded during init.

### Available Categories

- `requirement`
- `architecture`
- `design`
- `tech_guide`
- `api_guide`
- `core_flows`
- `qa_test`
- `issues`
- `growth`
- `adr`
- `security`
- `operations`
- `observability`
- `release`
- `migration`
- `glossary`
- `research`

(You can also use custom categories)

### Naming Convention

**Feature name** should be semantic and concise:
- Format: `{platform}-{feature}` or `{feature}`
- Examples: `ios-localization`, `app-login`, `app-launch`, `hud-status-update`

**Document name** should describe the *purpose*, not the feature:
- Use: `architecture`, `guide`, `api`, `test-plan`
- Avoid: `localization-architecture`, `login-guide` (redundant with feature path)

**Example path structure:**
```
.opc/knowledge/ios-localization/
├── requirement/
│   └── main.md
├── architecture/
│   └── main.md
└── qa_test/
    └── main.md
```

### Scaffolded Docs

- `requirement/main.md`
- `architecture/main.md`
- `design/main.md`
- `tech_guide/main.md`
- `api_guide/main.md`
- `core_flows/main.md`
- `qa_test/main.md`
```

### opc_knowledge_read - 读取知识

**描述**: 从知识库读取知识文档。可读取特定文档或类别下所有文档。

**调用方式**:
```javascript
opc_knowledge_read({
  feature_name?: string,
  category: string,
  doc?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| feature_name | string | 否 | 特征目录名，不指定则使用当前任务的 feature_name |
| category | string | 是 | 知识类别 |
| doc | string | 否 | 文档名（不含 .md 扩展名），不指定则读取类别下所有文档 |
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**返回值**:

```markdown
# 架构文档

## 系统概览

用户认证系统采用前后端分离架构...

## 组件分解

- **前端**: React + TypeScript
- **后端**: Node.js + Express
- **数据库**: PostgreSQL

## API 设计

...
```

**读取类别下所有文档**:

```javascript
opc_knowledge_read({
  feature_name: "user-auth",
  category: "requirement"
})
// 返回 requirement 目录下所有文档内容
```

### opc_knowledge_write - 写入知识

**描述**: 写入或更新知识文档。支持追加、更新章节、覆盖三种模式。

**调用方式**:
```javascript
opc_knowledge_write({
  feature_name?: string,
  category: string,
  doc: string,
  content: string,
  name?: string,
  description?: string,
  tags?: string[],
  section?: string,
  mode?: 'append' | 'update' | 'overwrite',
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| feature_name | string | 否 | 特征目录名，不指定则使用当前任务的 feature_name |
| category | string | 是 | 知识类别 |
| doc | string | 是 | 文档名（不含 .md 扩展名） |
| content | string | 是 | 文档内容 |
| name | string | 否 | 文档标题（人类可读名称） |
| description | string | 否 | 文档简要描述 |
| tags | array | 否 | 标签列表 |
| section | string | 否 | 要更新的章节标题 |
| mode | string | 否 | 写入模式，默认 'append' |
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**写入模式**:

| 模式 | 描述 |
|------|------|
| append | 追加内容到文档末尾（默认） |
| update | 更新指定章节内容 |
| overwrite | 完全覆盖文档内容 |

**返回值**:

```markdown
## Knowledge Written

**Feature:** user-auth
**Document:** architecture/main.md
**Name:** 架构文档
**Description:** 用户认证系统架构设计
**Mode:** append

Content has been appended.

💡 **Naming Convention:**
- **Document name** should describe the *purpose*, not the feature (e.g., `main`, `ui`, `index`)
- Since the path already includes feature and category, avoid redundant prefixes
- Example: For feature `ios-localization`, use `tech_guide/main.md` not `localization-tech.md`

📁 **Path:** `.opc/knowledge/user-auth/architecture/main.md`
```

**更新特定章节**:

```javascript
opc_knowledge_write({
  category: "architecture",
  doc: "main",
  content: "新的 API 设计内容...",
  section: "API 设计",
  mode: "update"
})
```

### opc_knowledge_exists - 检查知识存在

**描述**: 检查知识文档是否存在。

**调用方式**:
```javascript
opc_knowledge_exists({
  feature_name?: string,
  category?: string,
  doc?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| feature_name | string | 否 | 特征目录名 |
| category | string | 否 | 知识类别 |
| doc | string | 否 | 文档名 |
| workingDirectory | string | 否 | 工作目录 |

**返回值**:

```markdown
true
```

或

```markdown
false
```

### opc_knowledge_list - 列出知识特征

**描述**: 列出知识库中所有特征。

**调用方式**:
```javascript
opc_knowledge_list({
  status?: 'in_progress' | 'completed' | 'paused',
  category?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| status | string | 否 | 按状态过滤 |
| category | string | 否 | 按类别过滤 |
| workingDirectory | string | 否 | 工作目录 |

**返回值**:

```markdown
## Knowledge Library

| Feature | Title | Status | Categories | Updated |
|---------|-------|--------|------------|---------|
| user-auth | 用户认证 | in_progress | requirement, architecture, api_guide | 2026-05-12 |
| payment-integration | 支付集成 | completed | requirement, architecture, qa_test | 2026-05-11 |
| ios-localization | iOS 多语言 | paused | requirement, tech_guide | 2026-05-10 |
```

### opc_knowledge_docs - 列出文档

**描述**: 列出类别下的所有文档。

**调用方式**:
```javascript
opc_knowledge_docs({
  feature_name?: string,
  category: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| feature_name | string | 否 | 特征目录名 |
| category | string | 是 | 知识类别 |
| workingDirectory | string | 否 | 工作目录 |

**返回值**:

```markdown
## user-auth/architecture Documents

- main.md
- database.md
- security.md
```

### opc_knowledge_list_brief - 简要列表

**描述**: 列出所有知识文档的简要元数据，支持渐进加载。

**调用方式**:
```javascript
opc_knowledge_list_brief({
  feature_name?: string,
  category?: string,
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| feature_name | string | 否 | 按特征过滤 |
| category | string | 否 | 按类别过滤 |
| workingDirectory | string | 否 | 工作目录 |

**返回值**:

```markdown
## Knowledge Documents (Brief)

| Feature | Category | Name | Description |
|---------|----------|------|-------------|
| user-auth | requirement | 需求文档 | 用户认证功能需求说明 |
| user-auth | architecture | 架构文档 | 系统架构设计 |
| user-auth | api_guide | API 文档 | 接口规范说明 |

💡 Use `opc_knowledge_read` to read full content of specific documents.
```

### opc_knowledge_rebuild_index - 重建索引

**描述**: 从文件系统重建知识库索引。用于索引损坏、丢失或与实际文件不同步时。

**调用方式**:
```javascript
opc_knowledge_rebuild_index({
  workingDirectory?: string
})
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录 |

**返回值**:

```markdown
## Knowledge Index Rebuilt

### Statistics
- **Features found:** 5
- **Categories found:** 12
- **Documents found:** 23

### Changes
- **Added features:** new-feature
- **Removed features:** deprecated-feature

### Current Index

| Feature | Title | Status | Categories | Docs |
|---------|-------|--------|------------|------|
| user-auth | 用户认证 | in_progress | requirement, architecture, api_guide | 5 |
| payment-integration | 支付集成 | completed | requirement, architecture, qa_test | 8 |
| ios-localization | iOS 多语言 | paused | requirement, tech_guide | 3 |

📁 **Path:** `.opc/knowledge/index.json`

💡 Use `opc_knowledge_list` to see detailed document listing.
```

## 知识文档结构

### YAML Frontmatter

每个知识文档都包含自描述的元数据：

```markdown
---
name: 架构文档
description: 用户认证系统架构设计，包括前后端分离、数据库选型等。
category: architecture
feature_name: user-auth
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T11:30:00.000Z
tags: [architecture, auth, security]
---

# 系统架构

## 概览

用户认证系统采用前后端分离架构...

## 组件分解

...
```

### 目录结构

```
.opc/knowledge/
├── index.json                    # 知识库索引
├── user-auth/                    # 特征目录
│   ├── requirement/
│   │   └── main.md
│   ├── architecture/
│   │   ├── main.md
│   │   └── database.md
│   ├── api_guide/
│   │   └── main.md
│   └── qa_test/
│       └── main.md
├── payment-integration/
│   └── ...
└── ios-localization/
    └── ...
```

### 索引文件

```json
{
  "version": "1.0.0",
  "updated_at": "2026-05-12T12:00:00.000Z",
  "features": {
    "user-auth": {
      "title": "用户认证",
      "status": "in_progress",
      "created_at": "2026-05-12T10:00:00.000Z",
      "updated_at": "2026-05-12T11:30:00.000Z",
      "categories": {
        "requirement": ["main"],
        "architecture": ["main", "database"],
        "api_guide": ["main"],
        "qa_test": ["main"]
      }
    }
  }
}
```

## 特征匹配机制

### 相似度计算

系统自动计算任务描述与现有特征的相似度：

| 相似度 | 行为 |
|--------|------|
| > 50% | 自动复用现有特征 |
| 30-50% | 显示候选列表，询问确认 |
| < 30% | 创建新特征 |

### 匹配示例

```javascript
// 用户输入
/opc 实现iOS多语言功能

// 系统匹配
findSimilarKnowledgeFeature("iOS多语言功能", "", cwd, 0.5)
// 找到 "ios-localization" 特征，相似度 75%
// 自动设置 knowledge_feature_name = "ios-localization"
```

## 阶段到类别映射

| 阶段 | 读取类别 | 写入类别 |
|------|----------|----------|
| product | - | requirement |
| design | requirement | design |
| dev | requirement, design | architecture, api_guide, tech_guide |
| qa | requirement, architecture, api_guide | qa_test |
| ship | architecture, tech_guide | operations, release |
| growth | requirement | growth |

## 错误处理

### 常见错误

| 错误码 | 描述 | 处理建议 |
|--------|------|----------|
| FEATURE_NOT_FOUND | 特征不存在 | 检查 feature_name 或使用 `opc_knowledge_init` 创建 |
| DOCUMENT_NOT_FOUND | 文档不存在 | 检查文档路径或使用 `opc_knowledge_write` 创建 |
| CATEGORY_REQUIRED | 类别参数缺失 | 提供必需的 category 参数 |
| INVALID_CATEGORY | 无效类别 | 使用推荐类别或自定义类别 |
| MISSING_FEATURE_NAME | 无特征名 | 提供 feature_name 或先启动任务 |

### 错误响应格式

```json
{
  "content": [{
    "type": "text",
    "text": "No feature_name specified. Provide feature_name or start a task first."
  }],
  "isError": true
}
```

## 最佳实践

### 命名规范

**特征名 (feature_name)**:
- 使用语义化、简洁的名称
- 格式：`{platform}-{feature}` 或 `{feature}`
- 示例：`ios-localization`, `app-login`, `image-upload-r2`

**文档名 (doc)**:
- 描述目的，而非特征
- 使用：`main`, `ui`, `api`, `test-plan`
- 避免：`localization-architecture`, `login-guide`

### 知识流管理

- 每个阶段开始前读取前置知识
- 每个阶段完成后写入知识
- 使用 `section` 参数更新特定章节
- 使用 `tags` 标记知识类型

### 团队协作

- 知识文件提交到 Git
- 使用 `opc_knowledge_list_brief` 渐进加载
- 定期重建索引保持同步
- 使用 `glossary` 类别维护术语表

### 知识积累

- 记录关键决策和原因
- 包含示例和最佳实践
- 定期更新和补充
- 使用 ADR 记录架构决策

## 参考链接

- [状态持久化 API](../state-persistence/api_guide/main.md)
- [任务编排 API](../opc-task-orchestration/api_guide/main.md)
- [工作流规范 API](../workflow-specs/api_guide/main.md)