---
name: API 指南
description: OPC 工作流规范 API 规范，包括 /opc-workflows 命令、工作流 CRUD API 和工作流匹配机制。
category: api_guide
feature_name: workflow-specs
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [api_guide]
---

## 概览

OPC 工作流规范系统提供可复用的任务模板定义能力。通过 `/opc-workflows` 命令，用户可以管理预定义工作流、创建自定义工作流，实现团队流程标准化。

### 核心能力

| 能力 | 描述 |
|------|------|
| 工作流列表 | 查看所有可用工作流 |
| 工作流详情 | 查看工作流完整定义 |
| 工作流创建 | 交互式创建自定义工作流 |
| 工作流更新 | 修改现有工作流定义 |
| 工作流删除 | 删除自定义工作流 |
| 工作流导入导出 | 复制和分享工作流 |

## 认证与授权

工作流管理继承 Claude Code 的认证机制，无需额外配置。工作流文件存储在项目目录，可提交到 Git 团队共享。

## API 列表

### /opc-workflows init - 工作流初始化

**描述**: 复制内置工作流到项目目录。

**调用方式**:
```
/opc-workflows init [options]
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| --force | boolean | 否 | 强制覆盖现有工作流 |
| --dry-run | boolean | 否 | 预览模式，显示将执行的操作 |

**返回值**:

```markdown
## OPC Workflows Init

**Project:** /path/to/project

✅ Copied 8 workflows to .opc/workflows/
  - feature-development.json
  - bug-fix.json
  - security-fix.json
  - api-development.json
  - refactor.json
  - documentation.json
  - product-design.json
  - feature-page.json

ℹ️  2 existing workflows preserved:
  - my-custom-workflow.json
  - team-workflow.json
```

### /opc-workflows list - 工作流列表

**描述**: 列出所有可用工作流。

**调用方式**:
```
/opc-workflows list
```

**返回值**:

```markdown
## Built-in Workflows

| # | Name | Description | Triggers |
|---|------|-------------|----------|
| 1 | feature-development | SDD + TDD | 实现、开发、添加、新增、功能 |
| 2 | bug-fix | Diagnosis + TDD | 修复、bug、错误 |
| 3 | security-fix | Security + TDD | 安全、漏洞、CVE |
| 4 | performance-optimization | Performance tuning | 性能、优化、慢 |
| 5 | api-development | API-First | API、接口、REST |
| 6 | refactor | Keep tests passing | 重构、清理 |
| 7 | documentation | Doc update | 文档、readme |
| 8 | config-change | Config update | 配置、环境变量 |
| 9 | product-design | Design flow | 产品设计 |
| 10 | feature-page | Full page | 独立页面、landing page |

## Custom Workflows

| # | Name | Description |
|---|------|-------------|
| 11 | mobile-development | iOS/Android 开发流程 |
```

### /opc-workflows show - 工作流详情

**描述**: 显示工作流完整定义。

**调用方式**:
```
/opc-workflows show <name>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| name | string | 是 | 工作流名称 |

**返回值**:

```markdown
## Workflow: feature-development

**Description:** 通用功能开发流程，包含 SDD + TDD

### Triggers
- **Keywords:** 实现、开发、添加、新增、功能
- **Patterns:** `^(实现|开发|添加|新增).+功能$`

### Pipeline Stages

| Stage | Required | Agents | Mode | Skills |
|-------|:--------:|--------|------|--------|
| product | ✅ | product-agent | sequential | spec-driven-development |
| design | ❌ | web-agent, mobile-agent | parallel | ui-design |
| dev | ✅ | frontend-agent, backend-agent | parallel | test-driven-development |
| qa | ✅ | qa-agent | sequential | test-plan, e2e-test |
| ship | ❌ | devops-agent | sequential | deploy |

### Gates

| Gate | Description | Blocks |
|------|-------------|--------|
| sdd_spec_required | Product must produce Spec before Dev | dev stage |
| tdd_red_first | Failing test must be written first | implementation |
| design_required | Design must produce wireframes | dev stage (if design enabled) |

### Rules

- ✅ TDD enabled
- ✅ SDD enabled
- ✅ Parallel execution allowed
- ✅ Knowledge flow enabled

### Stage Knowledge Config

**product:**
- Write after: requirement/main

**design:**
- Read before: requirement
- Write after: design/main

**dev:**
- Read before: requirement, design
- Write after: architecture/main, api_guide/main, tech_guide/main

**qa:**
- Read before: requirement, architecture, api_guide
- Write after: qa_test/main
```

### /opc-workflows create - 工作流创建

**描述**: 交互式创建自定义工作流。

**调用方式**:
```
/opc-workflows create <name>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| name | string | 是 | 工作流名称 |

**交互流程**:

```markdown
OPC: Let's create a new workflow spec together.

1. What triggers this workflow? (keywords)
   User: 移动端开发、app、iOS、Android

2. What stages should be executed?
   Available: product, design, dev, qa, ship, growth

   User: product → design → dev → qa

3. For each stage, tell me:
   - Required outputs?
   - Required or optional?
   - Agent mode: parallel or sequential?
   - Special constraints?

   Product stage:
   - Outputs: spec.md, mobile-spec.md
   - Required: yes
   - Agents: product-agent
   - Mode: sequential

   Design stage:
   - Outputs: mobile-design/, platform-specs.md
   - Required: yes (mobile needs design)
   - Agents: web-agent, mobile-agent
   - Mode: parallel

   Dev stage:
   - Outputs: app code
   - Required: yes
   - Agents: mobile-developer, backend-agent
   - Mode: parallel
   - TDD: yes

   QA stage:
   - Outputs: device test report
   - Required: yes
   - Agents: qa-agent
   - Mode: sequential

4. Any gates/constraints?
   User: 必须有移动端设计规范才能开发

5. Summary:

   Workflow: mobile-development
   Triggers: 移动端开发、app、iOS、Android
   Pipeline: Product → Design → Dev → QA

   Gates:
   - mobile_design_required: Design must produce mobile-spec

   Save? [Y/n]
```

### /opc-workflows update - 工作流更新

**描述**: 更新现有工作流定义。

**调用方式**:
```
/opc-workflows update <name>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| name | string | 是 | 工作流名称 |

**返回值**:

```markdown
## Updating Workflow: mobile-development

Current definition loaded. What would you like to change?

1. Triggers (keywords/patterns)
2. Pipeline stages
3. Gates
4. Rules
5. Knowledge config

Select option: _
```

### /opc-workflows delete - 工作流删除

**描述**: 删除自定义工作流。

**调用方式**:
```
/opc-workflows delete <name>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| name | string | 是 | 工作流名称 |

**返回值**:

```markdown
## Delete Workflow: my-custom-workflow

⚠️ This will permanently delete the workflow definition.

Confirm? [y/N] _

[Confirmed]
✅ Deleted .opc/workflows/my-custom-workflow.json
```

### /opc-workflows export - 工作流导出

**描述**: 导出工作流定义到文件。

**调用方式**:
```
/opc-workflows export <name> [file]
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| name | string | 是 | 工作流名称 |
| file | string | 否 | 导出文件路径，默认为当前目录 |

**返回值**:

```markdown
## Export Workflow: feature-development

✅ Exported to: ./feature-development.json

You can share this file with your team or import to another project.
```

### /opc-workflows import - 工作流导入

**描述**: 从文件导入工作流定义。

**调用方式**:
```
/opc-workflows import <file>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| file | string | 是 | 工作流文件路径 |

**返回值**:

```markdown
## Import Workflow

**File:** ./team-workflow.json

### Preview

- **Name:** team-workflow
- **Triggers:** 团队协作、多人
- **Stages:** product, design, dev, qa
- **Gates:** team_sync_required

Import? [Y/n] _

[Confirmed]
✅ Imported to .opc/workflows/team-workflow.json
```

### opc_workflows_path - MCP 工具

**描述**: 获取工作流目录路径，确保基于 git toplevel。

**调用方式**:
```javascript
opc_workflows_path({ workingDirectory })
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| workingDirectory | string | 否 | 工作目录，默认为 cwd |

**返回值**:

```markdown
## Workflows Directory

**Path:** /path/to/project/.opc/workflows/
**Git Root:** /path/to/project/

All workflow files should be read from/written to this directory.
This ensures consistency regardless of current working directory.
```

## 工作流规范结构

```json
{
  "name": "workflow-name",
  "description": "When to use this workflow",
  "triggers": {
    "keywords": ["关键词1", "关键词2"],
    "patterns": ["regex pattern"]
  },
  "pipeline": [
    {
      "stage": "product",
      "required": true,
      "outputs": ["spec.md", "acceptance-criteria.json"],
      "agents": ["product-agent"],
      "agent_mode": "sequential",
      "skills": ["spec-driven-development"],
      "constraints": ["sdd_spec_required"],
      "knowledge": {
        "read_before": [],
        "write_after": {
          "category": "requirement",
          "doc": "main"
        }
      }
    },
    {
      "stage": "dev",
      "required": true,
      "outputs": ["tests/", "implementation"],
      "agents": ["frontend-agent", "backend-agent"],
      "agent_mode": "parallel",
      "skills": ["test-driven-development"],
      "constraints": ["tdd_red_first", "tdd_green_minimal"],
      "knowledge": {
        "read_before": ["requirement", "design"],
        "write_after": {
          "category": "architecture",
          "doc": "main"
        }
      }
    }
  ],
  "gates": [
    {
      "name": "sdd_spec_required",
      "description": "Product must produce Spec before Dev",
      "check": "stages.product.artifacts.includes('spec.md')",
      "blocker": "Dev blocked: No Spec found"
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

### 关键字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| name | string | 工作流唯一标识 |
| description | string | 使用场景描述 |
| triggers.keywords | array | 触发关键词列表 |
| triggers.patterns | array | 正则匹配模式 |
| pipeline | array | 阶段定义列表 |
| gates | array | 门禁检查列表 |
| rules | object | 执行规则配置 |

### 阶段定义字段

| 字段 | 类型 | 描述 |
|------|------|------|
| stage | string | 阶段名称 |
| required | boolean | 是否必需 |
| outputs | array | 期望产出 |
| agents | array | Agent 列表 |
| agent_mode | string | 执行模式：sequential/parallel |
| skills | array | Skill 列表 |
| constraints | array | 约束列表 |
| knowledge | object | 知识流配置 |

### Agent 执行模式

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| sequential | 顺序执行 | 有依赖关系，输出作为下一阶段输入 |
| parallel | 并行执行 | 独立任务，无依赖关系 |

### 门禁类型

| 门禁 | 检查条件 | 阻塞阶段 |
|------|----------|----------|
| sdd_spec_required | Product 产出 spec.md | dev |
| tdd_red_first | 已写失败测试 | implementation |
| design_required | Design 产出 wireframes | dev (如启用 design) |
| security_audit_required | 安全审计通过 | ship |

## 内置工作流

| 工作流 | 触发关键词 | 描述 |
|--------|------------|------|
| feature-development | 实现、开发、添加、新增、功能 | 通用功能开发 (SDD + TDD) |
| bug-fix | 修复、bug、错误 | Bug 诊断 + TDD 修复 |
| security-fix | 安全、漏洞、CVE | 安全审计 + TDD 修复 |
| performance-optimization | 性能、优化、慢 | 性能基准 + 优化 |
| api-development | API、接口、REST | API-First + 契约测试 |
| refactor | 重构、清理 | 保持测试通过 |
| documentation | 文档、readme | 文档更新 |
| config-change | 配置、环境变量 | 配置变更 |
| product-design | 产品设计 | 需求 + 设计 + 评审 |
| feature-page | 独立页面、landing page | 完整功能页面 (前后端并行) |

## 文件位置

```
{git-toplevel}/.opc/
└── workflows/
    ├── feature-development.json
    ├── bug-fix.json
    ├── security-fix.json
    ├── product-design.json
    ├── api-development.json
    ├── refactor.json
    ├── documentation.json
    ├── feature-page.json
    └── my-custom-workflow.json   # 用户自定义
```

## 错误处理

### 常见错误

| 错误码 | 描述 | 处理建议 |
|--------|------|----------|
| WORKFLOW_NOT_FOUND | 工作流不存在 | 检查名称或使用 list 查看 |
| WORKFLOW_ALREADY_EXISTS | 工作流已存在 | 使用 update 或删除后重建 |
| INVALID_WORKFLOW_JSON | JSON 格式错误 | 检查 JSON 语法 |
| MISSING_REQUIRED_FIELD | 缺少必需字段 | 补充 name, pipeline 等字段 |
| CANNOT_DELETE_BUILTIN | 不能删除内置工作流 | 仅可删除自定义工作流 |

### 错误响应格式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": "详细信息"
  }
}
```

## 最佳实践

### 工作流命名

- 使用 kebab-case 格式
- 语义化命名，描述使用场景
- 示例：`mobile-development`, `api-integration`

### 触发器设计

- 关键词应覆盖常见表达
- 正则模式用于精确匹配
- 避免过于宽泛的触发词

### 阶段配置

- 明确 required/optional
- 合理设置 agent_mode
- 配置知识流确保上下文传递

### 门禁设置

- 关键节点设置门禁
- 门禁检查应可验证
- 提供清晰的 blocker 消息

### 团队共享

- 工作流文件提交到 Git
- 使用 export/import 分享
- 定期评审和更新

## 参考链接

- [任务编排 API](../opc-task-orchestration/api_guide/main.md)
- [知识库管理 API](../knowledge-library/api_guide/main.md)
- [核心流程](../workflow-specs/core_flows/main.md)