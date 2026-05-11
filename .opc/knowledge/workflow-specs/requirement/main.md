---
name: 工作流规范系统需求说明
description: 定义 OPC 工作流规范系统的核心功能需求，包括工作流定义、匹配机制、阶段编排和约束检查等能力。
category: requirement
feature_name: workflow-specs
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [requirement, workflow, specification, automation]
---
# WHAT（要做什么）

OPC 工作流规范系统 (`/opc-workflows`) 提供可复用的任务执行模板，定义了不同类型任务的标准化流程。系统管理 8 种内置工作流，支持用户创建自定义工作流。

**内置工作流：**

| 工作流 | 触发关键词 | 描述 |
|--------|-----------|------|
| feature-development | 实现、开发、添加、新增、功能 | 新功能开发 (SDD + TDD) |
| bug-fix | 修复、bug、错误 | Bug 诊断 + TDD 修复 |
| security-fix | 安全、漏洞、CVE | 安全审计 + TDD 修复 |
| api-development | API、接口、REST | API-First + 契约测试 |
| refactor | 重构、清理 | 保持测试通过 |
| documentation | 文档、readme | 文档更新 |
| product-design | 产品设计 | 需求 + 设计 + 评审 |
| feature-page | 独立页面、landing page | 完整功能页面（前后端并行） |

核心功能：

1. **工作流定义** - JSON 格式定义触发条件、阶段、Agent、约束
2. **自动匹配** - 根据任务描述关键词和模式匹配工作流
3. **阶段编排** - 定义执行顺序、并行/串行模式
4. **Gate 约束** - 阶段间检查点，确保质量
5. **知识流配置** - 每个阶段的读写知识配置
6. **自定义创建** - 用户可创建专属工作流

# WHY（为什么要做）

不同类型任务有不同的最佳实践流程：

| 任务类型 | 最佳实践 |
|----------|----------|
| 新功能 | SDD (规格驱动) + TDD (测试驱动) |
| Bug 修复 | 诊断 + TDD 修复 |
| 安全修复 | 安全审计 + TDD 修复 |
| API 开发 | API-First + 契约测试 |
| 重构 | 保持测试通过 |

工作流规范系统解决：

| 痛点 | 解决方案 |
|------|----------|
| 流程不一致 | 标准化工作流 |
| 质量难以保证 | Gate 约束强制检查 |
| 重复配置 | 可复用模板 |
| 团队协作困难 | 共享工作流定义 |

## 功能性需求

### 核心功能

1. **工作流定义结构**
   - `name` - 工作流名称
   - `description` - 使用场景描述
   - `triggers` - 触发条件（关键词 + 正则）
   - `pipeline` - 阶段定义数组
   - `gates` - 约束检查点
   - `rules` - 执行规则（TDD、SDD、并行等）

2. **阶段定义**
   - `stage` - 阶段名称（product/design/dev/qa/ship/growth）
   - `required` - 是否必需
   - `outputs` - 必需产物
   - `agents` - 执行 Agent 列表
   - `agent_mode` - 执行模式（sequential/parallel）
   - `skills` - 调用的 Skill
   - `constraints` - 阶段约束
   - `knowledge` - 知识流配置

3. **自动匹配机制**
   - 关键词匹配：检查 `triggers.keywords`
   - 正则匹配：检查 `triggers.patterns`
   - 多候选处理：按相似度排序，询问用户

4. **Gate 约束系统**
   - `sdd_spec_required` - Dev 前必须有 Spec
   - `tdd_red_first` - 实现前必须写失败测试
   - `verification_required` - 完成前必须验证
   - `design_required` - Dev 前必须有设计
   - `security_audit_required` - Ship 前必须安全审计

5. **知识流配置**
   - `read_before` - 执行前读取的知识类别
   - `write_after` - 执行后写入的知识类别
   - `content_template` - 知识内容模板

6. **工作流管理命令**
   - `init` - 初始化工作流目录
   - `list` - 列出所有工作流
   - `show <name>` - 查看工作流详情
   - `create <name>` - 创建自定义工作流
   - `update <name>` - 更新工作流
   - `delete <name>` - 删除工作流

### 辅助功能

1. **执行规则**
   - `tdd: true` - 强制 TDD 流程
   - `sdd: true` - 强制 SDD 流程
   - `parallel_allowed: true` - 允许并行执行
   - `knowledge_enabled: true` - 启用知识流

2. **跳过条件**
   - `skip_conditions` - 可选阶段的跳过条件
   - 示例：`["UI简单", "后端任务", "Spec已包含设计"]`

## 非功能性需求

- **性能**：
  - 工作流匹配 < 1秒
  - 工作流加载 < 500ms
  - Gate 检查 < 100ms

- **安全性**：
  - 工作流文件存储在项目目录
  - 可提交到 Git，团队共享
  - 不包含敏感信息

- **可靠性**：
  - 无效工作流不阻塞系统
  - 匹配失败时使用默认评估
  - Gate 失败时清晰提示原因

- **可用性**：
  - JSON 格式，易读易写
  - 内置工作流覆盖常见场景
  - 交互式创建自定义工作流

## 不做什么（Non-goals）

1. **不支持动态工作流** - 工作流在执行前定义
2. **不支持嵌套工作流** - 每个工作流独立
3. **不支持条件分支** - 线性流程，无 if-else
4. **不支持工作流版本** - 始终使用最新版本

## 验收标准（Done Definition）

- [ ] 8 种内置工作流正确定义
- [ ] 关键词匹配正确工作
- [ ] 正则匹配正确工作
- [ ] 多候选时询问用户确认
- [ ] Gate 约束正确检查
- [ ] 阶段按顺序正确执行
- [ ] 并行模式正确执行
- [ ] 知识流配置正确应用
- [ ] `/opc-workflows list` 显示所有工作流
- [ ] `/opc-workflows show` 显示工作流详情
- [ ] `/opc-workflows create` 交互式创建
- [ ] `/opc-workflows init` 正确初始化
- [ ] 自定义工作流可被匹配和使用