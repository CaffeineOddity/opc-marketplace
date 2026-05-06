# 工作流规范

## 内置工作流

| 工作流 | 文件 | 适用场景 |
|--------|------|----------|
| feature-development | feature-development.json | 新功能开发 |
| bug-fix | bug-fix.json | Bug 修复 |
| api-development | api-development.json | API 开发 |
| documentation | documentation.json | 文档编写 |
| security-review | security-review.json | 安全审计 |
| mobile-app | mobile-app.json | 移动应用开发 |
| seo-sprint | seo-sprint.json | SEO 优化 |
| incident-response | incident-response.json | 事件响应 |

## 工作流结构

```json
{
  "name": "workflow-name",
  "description": "工作流描述",
  "triggers": {
    "keywords": ["关键词"],
    "patterns": ["正则模式"]
  },
  "stages": [
    {
      "name": "stage-name",
      "agents": ["agent-list"],
      "knowledge": {
        "read_before": ["domain-list"],
        "write_after": ["domain-list"]
      },
      "gates": {
        "before": ["条件"],
        "after": ["条件"]
      }
    }
  ],
  "constraints": {
    "parallel": true/false,
    "timeout": "duration",
    "rollback": true/false
  }
}
```

## 工作流匹配逻辑

```python
def match_workflow(task_description, workflows):
    for workflow in workflows:
        # 检查关键词匹配
        for keyword in workflow.triggers.keywords:
            if keyword.lower() in task_description.lower():
                return workflow
        
        # 检查正则模式匹配
        for pattern in workflow.triggers.patterns:
            if re.search(pattern, task_description):
                return workflow
    
    return None  # 无匹配，使用默认评估
```

## 自定义工作流

1. 在 `.opc/workflows/` 创建 JSON 文件
2. 定义触发条件、阶段、知识流
3. 工作流会自动被 `/opc` 加载和匹配

## Why: 工作流规范提供可复用的任务处理模式
## How to apply: 创建自定义工作流以标准化团队流程