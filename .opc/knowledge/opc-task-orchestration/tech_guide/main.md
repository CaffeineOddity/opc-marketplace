---
name: 一键任务调度系统技术指南
description: OPC 一键任务调度系统的使用指南，包括快速开始、命令参考、编排模式、最佳实践和常见问题。
category: tech_guide
feature_name: opc-task-orchestration
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide, usage, best-practices]
---
## 技术栈

- **语言**：Markdown (Skill 定义), Python (脚本), TypeScript (MCP 工具)
- **框架**：Claude Code Skill 系统, MCP 协议
- **依赖**：
  - MCP Tools: `opc_state_*`, `opc_knowledge_*`, `opc_checkpoint_*`, `opc_handoff`, `opc_memory`
  - Agent Tools: `Agent`, `TeamCreate`, `TaskCreate`, `TaskUpdate`, `TaskList`, `SendMessage`

## 快速开始

### 基本用法

```shell
# 创建新任务
/opc 帮我做一个用户管理功能

# 查看当前任务状态
/opc status

# 恢复上次活跃会话
/opc resume
```

### 任务示例

| 命令 | 触发工作流 | 执行流程 |
|------|-----------|----------|
| `/opc 实现用户登录` | feature-development | product → design → dev → qa |
| `/opc 修复登录bug` | bug-fix | dev + qa 并行 |
| `/opc 安全审查` | security-fix | security-auditor → dev → qa |
| `/opc 上线新版本` | - | qa → devops → marketing |
| `/opc 研究竞品市场` | - | product-agent |

## 实现要点

### Step 0: 初始化状态与知识库 (必须)

**每次 `/opc` 调用必须先初始化状态和知识库。**

```
1. 提取任务描述
2. 调用 opc_state_init:
   - project_name: 简短任务摘要
   - project_description: 完整用户输入
3. 系统自动:
   - 匹配相似知识特征 (>50% 相似度)
   - 设置 knowledge_feature_name
   - 或准备创建新特征
```

### Step 1: 匹配工作流规范

```
1. 调用 opc_workflows_path 获取工作流目录
2. 读取所有 JSON 文件
3. 解析 triggers.keywords 和 triggers.patterns
4. 匹配任务描述
```

匹配逻辑：
```python
def match_workflow(task_description, workflows):
    for workflow in workflows:
        # 关键词匹配
        for keyword in workflow.triggers.keywords:
            if keyword.lower() in task_description.lower():
                return workflow
        # 正则匹配
        for pattern in workflow.triggers.patterns:
            if re.search(pattern, task_description):
                return workflow
    return None  # 无匹配
```

### Step 2: 评估任务 (无工作流匹配时)

| 信号 | 分类 | 编排模式 |
|------|------|----------|
| 单领域，范围清晰 | Simple | 单 Agent |
| 多阶段，串行依赖 | Pipeline | 串行调度 |
| 多个独立部分 | Parallel | 并行调度 |
| 复杂，需要 3+ Agent | Project | TeamCreate |
| 仅提问 | Info | 直接回答 |

### Step 3: 选择 Agent

**按阶段选择：**

| 阶段 | Agent | 模型 |
|------|-------|------|
| Product | product-agent, startup-analyst | sonnet, inherit |
| Design | brand-agent, web-agent, mobile-agent | sonnet |
| Dev | frontend-agent, backend-agent, security-auditor | sonnet, opus |
| QA | qa-agent, accessibility-expert | sonnet, inherit |
| Ship | devops-agent, cloud-architect | sonnet, inherit |
| Growth | marketing-agent, data-analyst, seo-* | sonnet, haiku |

### Step 4: 执行编排

**知识流 (关键)：**

```
BEFORE STAGE:
1. 获取 knowledge_feature_name: opc_state_read().project.knowledge_feature_name
2. 解析阶段知识配置
3. 读取前置知识: opc_knowledge_read(feature_name, category)
4. 注入 Agent 上下文

AFTER STAGE:
5. 提取知识更新
6. 写入知识库: opc_knowledge_write(feature_name, category, doc, content)
```

**状态管理：**

```
1. 调度前: opc_state_write(stage, "in_progress", agent)
2. 完成后: opc_state_write(stage, "completed", artifact)
3. 多阶段: opc_handoff 记录交接
```

### Step 5: 报告结果

```
- 已完成的工作
- 产生的产物
- 下一步建议
- 待解决问题
```

## 编排模式详解

### Mode 1: Single Agent

适用场景：单阶段、单领域、范围清晰

```
Agent(product-agent, "调研用户需求")
```

### Mode 2: Pipeline (串行)

适用场景：多阶段、有依赖关系

```
Agent(product-agent, "定义需求") → result1
Agent(web-agent, "设计 UI: " + result1) → result2
Agent(frontend-agent, "实现: " + result2) → result3
```

### Mode 3: Parallel (并行)

适用场景：独立任务、无数据依赖

```
# 单消息多次调用
Agent(frontend-agent, "实现 UI 组件")
Agent(backend-agent, "实现 API 端点")
```

### Mode 4: Team (复杂项目)

适用场景：3+ Agent、需要协调

```
1. TeamCreate("project-name", "description")
2. TaskCreate 为每个阶段创建任务
3. TaskUpdate(owner) 分配 Agent
4. Agent spawns with team_name
5. SendMessage 协调
6. TaskList 监控
```

## Agent 调度模板

```
Agent({agent}, `
## Task: {task}

## Knowledge Context (先阅读)
${knowledgeContext}

## Instructions
1. 审阅知识上下文
2. 理解前一阶段决策
3. 执行当前阶段任务
4. 完成后总结知识更新

## Output
1. 交付物
2. 知识更新 (供下一阶段使用)
`)
```

## 关键决策

### 1. 为什么单窗口单任务？

一人公司专注更高效。多任务并行导致：
- 上下文切换成本
- 状态管理复杂
- 决策质量下降

### 2. 为什么知识库必须？

没有知识库：
- 每个阶段从零开始
- 决策在 Agent 间丢失
- 输出不一致

有知识库：
- 阶段间上下文传递
- 决策可追溯
- 输出连贯一致

### 3. 为什么工作流可选？

内置工作流覆盖常见场景，但：
- 用户可能有特殊流程
- 某些任务难以归类
- 默认评估逻辑兜底

### 4. 模型选择策略

| 模型 | Agent | 原因 |
|------|-------|------|
| opus | security-auditor, ai-engineer | 关键决策、复杂分析 |
| sonnet | 大多数 Agent | 平衡速度和质量 |
| haiku | seo-keyword-strategist | 快速查询、迭代 |
| inherit | startup-analyst | 继承调用者模型 |

## 最佳实践

### 任务描述

**好的描述：**
- `/opc 实现用户登录功能，支持邮箱和手机号`
- `/opc 修复订单支付失败的问题，错误码 E001`
- `/opc 设计一个数据看板，展示日活和转化率`

**不好的描述：**
- `/opc 做个功能` (太模糊)
- `/opc fix` (缺少上下文)
- `/opc 帮我` (没有具体任务)

### 状态管理

- **完成再开始下一个** - 单任务模型
- **使用检查点** - 大改动前创建检查点
- **定期查看状态** - `/opc status` 了解进度

### 知识库

- **让系统自动管理** - 不要手动编辑
- **提交到 Git** - 团队共享知识
- **查看积累** - `/opc status` 显示知识域

### Agent 协作

- **信任编排** - 系统选择最优模式
- **关注交接** - 确保 handoff 保留上下文
- **验证输出** - 检查是否符合预期

## 常见问题

### Q: 任务卡住怎么办？

```
1. 运行 /opc status 查看当前阶段
2. 检查是否有阻塞的 gate
3. 如果需要，回滚到检查点
4. 或放弃当前任务: opc_state_clear
```

### Q: 如何恢复中断的任务？

```
/opc resume
# 或查看状态后手动继续
/opc status
```

### Q: 为什么 Agent 没有使用之前的知识？

```
检查:
1. 是否调用了 opc_state_init
2. knowledge_feature_name 是否正确
3. 工作流是否配置了 read_before
```

### Q: 如何自定义工作流？

```
/opc-workflows create my-workflow
# 按提示创建自定义工作流
```

### Q: 多个相似任务如何处理？

```
系统自动匹配相似特征 (>50%)
- 高匹配: 自动复用
- 中匹配: 询问确认
- 无匹配: 创建新特征
```