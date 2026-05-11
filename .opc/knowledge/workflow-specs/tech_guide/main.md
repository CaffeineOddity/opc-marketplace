---
name: 工作流规范系统技术指南
description: OPC 工作流规范系统的使用指南，包括命令参考、工作流定义、自定义创建和最佳实践。
category: tech_guide
feature_name: workflow-specs
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide, workflow, specification, usage]
---
## 技术栈

- **语言**：JSON (工作流定义), Markdown (Skill 定义), Python (脚本)
- **框架**：Claude Code Skill 系统
- **依赖**：
  - MCP Tools: `opc_workflows_path`
  - 标准库：`json`, `re`, `pathlib`

## 快速开始

### 查看工作流

```shell
# 列出所有工作流
/opc-workflows list

# 查看特定工作流
/opc-workflows show feature-development

# 初始化工作流目录
/opc-workflows init
```

### 使用工作流

```shell
# 自动匹配工作流
/opc 实现用户登录功能

# 显式指定工作流
/opc 实现用户登录 --workflow=api-development
```

### 创建自定义工作流

```shell
# 交互式创建
/opc-workflows create my-workflow
```

## 命令参考

| 命令 | 描述 |
|------|------|
| `init` | 初始化工作流目录 |
| `init --force` | 强制覆盖现有工作流 |
| `init --dry-run` | 预览操作（不执行） |
| `list` | 列出所有工作流 |
| `show <name>` | 显示工作流详情 |
| `create <name>` | 创建自定义工作流 |
| `update <name>` | 更新工作流 |
| `delete <name>` | 删除工作流 |

## 工作流定义结构

### 完整示例

```json
{
  "name": "feature-development",
  "description": "New feature development with SDD + TDD",
  "triggers": {
    "keywords": ["实现", "开发", "添加", "新增", "功能", "feature", "build", "create"],
    "patterns": []
  },
  "pipeline": [
    {
      "stage": "product",
      "required": true,
      "outputs": ["spec.md", "acceptance-criteria.json"],
      "agents": ["product-agent"],
      "skills": ["spec-driven-development"],
      "description": "定义需求规格和验收标准",
      "knowledge": {
        "domain": "requirement",
        "doc": "main",
        "read_before": false,
        "write_after": true
      }
    },
    {
      "stage": "design",
      "required": false,
      "outputs": ["design-spec.md"],
      "agents": ["web-agent", "mobile-agent"],
      "agent_mode": "parallel",
      "skip_conditions": ["UI简单", "后端任务"],
      "description": "UI/UX 设计（可选）"
    },
    {
      "stage": "dev",
      "required": true,
      "outputs": ["tests/", "implementation"],
      "agents": ["frontend-agent", "backend-agent"],
      "agent_mode": "parallel",
      "skills": ["test-driven-development"],
      "constraints": ["tdd_red_first"],
      "description": "TDD 开发"
    },
    {
      "stage": "qa",
      "required": true,
      "outputs": ["test-report.md"],
      "agents": ["qa-agent"],
      "description": "测试验证"
    }
  ],
  "gates": [
    {
      "name": "sdd_spec_required",
      "description": "Product 必须产出 Spec",
      "check": "stages.product.artifacts.includes('spec.md')",
      "blocker": "Dev 阻止：缺少 Spec"
    },
    {
      "name": "tdd_red_first",
      "description": "必须先写失败测试",
      "check": "stages.dev.progress.red_complete === true",
      "blocker": "实现阻止：请先写失败测试"
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

### 字段说明

#### 顶层字段

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| name | string | Y | 工作流名称 |
| description | string | Y | 使用场景描述 |
| triggers | object | Y | 触发条件 |
| pipeline | array | Y | 阶段定义数组 |
| gates | array | N | Gate 约束数组 |
| rules | object | N | 执行规则 |

#### 阶段字段

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| stage | string | Y | 阶段名称 |
| required | boolean | Y | 是否必需 |
| outputs | string[] | N | 必需产物 |
| agents | string[] | Y | 执行 Agent |
| agent_mode | string | N | sequential/parallel |
| skills | string[] | N | 调用的 Skill |
| constraints | string[] | N | 阶段约束 |
| skip_conditions | string[] | N | 跳过条件 |
| knowledge | object | N | 知识流配置 |

#### Gate 字段

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| name | string | Y | Gate 名称 |
| description | string | Y | 描述 |
| check | string | Y | 检查表达式 |
| blocker | string | Y | 阻塞提示 |

## 实现要点

### 触发匹配逻辑

```python
def match_workflow(task_description, workflows):
    matches = []

    for workflow in workflows:
        # 关键词匹配
        for keyword in workflow.triggers.keywords:
            if keyword.lower() in task_description.lower():
                matches.append(workflow)
                break

        # 正则匹配
        for pattern in workflow.triggers.patterns:
            if re.search(pattern, task_description):
                matches.append(workflow)
                break

    # 处理匹配结果
    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        # 询问用户选择
        return ask_user_to_select(matches)
    else:
        return None  # 无匹配，使用默认评估
```

### Gate 检查逻辑

```python
def check_gate(gate, state):
    """检查 Gate 约束"""
    result = evaluate_expression(gate.check, state)

    if not result:
        return {
            "passed": False,
            "message": gate.blocker
        }

    return {"passed": True}
```

### 阶段执行逻辑

```python
def execute_stage(stage_config, context):
    """执行单个阶段"""

    # 1. 检查跳过条件
    if should_skip(stage_config, context):
        return {"skipped": True}

    # 2. 检查 Gate 约束
    for constraint in stage_config.constraints:
        gate = find_gate(constraint)
        result = check_gate(gate, context.state)
        if not result.passed:
            raise BlockedError(result.message)

    # 3. 读取前置知识
    knowledge = read_knowledge(stage_config.knowledge.read_before)

    # 4. 选择 Agent
    agents = stage_config.agents
    mode = stage_config.agent_mode

    # 5. 执行 Agent
    if mode == "parallel":
        results = execute_parallel(agents, knowledge)
    else:
        results = execute_sequential(agents, knowledge)

    # 6. 写入知识
    write_knowledge(stage_config.knowledge.write_after, results)

    # 7. 检查产物
    check_outputs(stage_config.outputs, results)

    return results
```

## 自定义工作流创建

### 交互式创建

```shell
/opc-workflows create mobile-development
```

交互流程：
```
1. 触发关键词？
   用户: 移动端、app、iOS、Android

2. 执行阶段？
   可选: product, design, dev, qa, ship, growth
   用户: product → design → dev → qa

3. 每个阶段配置:
   - 产物要求?
   - 必需/可选?
   - Agent 模式?
   - 约束条件?

4. Gate 约束?
   用户: 必须有移动端设计规范

5. 确认保存?
```

### 手动创建

创建文件 `.opc/workflows/my-workflow.json`：

```json
{
  "name": "my-workflow",
  "description": "自定义工作流",
  "triggers": {
    "keywords": ["自定义"],
    "patterns": []
  },
  "pipeline": [
    {
      "stage": "product",
      "required": true,
      "agents": ["product-agent"]
    },
    {
      "stage": "dev",
      "required": true,
      "agents": ["frontend-agent", "backend-agent"],
      "agent_mode": "parallel"
    }
  ],
  "rules": {
    "tdd": true
  }
}
```

## 内置工作流详解

### feature-development

**触发**: 实现、开发、添加、新增、功能

**流程**: product → design(可选) → dev → qa → ship(可选)

**特点**:
- SDD + TDD 强制
- 前后端并行开发
- Gate: sdd_spec_required, tdd_red_first

### bug-fix

**触发**: 修复、bug、错误

**流程**: dev → qa

**特点**:
- TDD 修复
- 诊断 + 测试 + 修复

### security-fix

**触发**: 安全、漏洞、CVE

**流程**: security-auditor → dev → qa

**特点**:
- 安全审计优先
- opus 模型审计
- TDD 修复

### api-development

**触发**: API、接口、REST

**流程**: product → dev → qa

**特点**:
- API-First 设计
- 契约测试
- OpenAPI 规范

## 最佳实践

### 工作流设计

1. **明确触发条件** - 关键词要具体，避免歧义
2. **合理设置 Gate** - 关键检查点，不过度约束
3. **利用并行** - 独立任务并行执行
4. **知识流配置** - 确保上下文传递

### 阶段配置

1. **必需 vs 可选** - 核心阶段必需，辅助阶段可选
2. **跳过条件** - 明确何时跳过可选阶段
3. **产物定义** - 明确必需产出，便于检查

### Gate 设计

1. **关键检查** - 只检查真正重要的约束
2. **清晰提示** - blocker 信息要明确
3. **可修复** - 约束失败时提供解决建议

## 常见问题

### Q: 工作流匹配错误？

```
检查:
1. 关键词是否正确拼写
2. 正则模式是否有效
3. 多匹配时选择正确工作流
```

### Q: Gate 阻塞怎么办？

```
1. 查看 blocker 提示信息
2. 完成前置要求
3. 重新执行阶段
```

### Q: 如何跳过可选阶段？

```
在阶段配置中设置 skip_conditions:
"skip_conditions": ["UI简单", "后端任务"]
```

### Q: 如何添加新 Gate？

```
在 gates 数组添加:
{
  "name": "my_gate",
  "description": "描述",
  "check": "检查表达式",
  "blocker": "阻塞提示"
}
```

### Q: 工作流文件位置？

```
内置: build-in/workflows/*.json
自定义: .opc/workflows/*.json
```