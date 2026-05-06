# 编排模式

## 四种编排模式

| 模式 | 方法 | 使用场景 |
|------|------|----------|
| Single | 一次 Agent 调用 | 单阶段、单代理 |
| Pipeline | 顺序 Agent 调用 | 多阶段有依赖关系 |
| Parallel | 多个 Agent 同时调用 | 独立任务 |
| Team | TeamCreate + TaskCreate + SendMessage | 复杂项目、3+ 代理 |

## 模式选择逻辑

```python
def classify_task(task):
    if is_question(task):
        return "Info"  # 直接回答
    
    if single_domain(task) and clear_scope(task):
        return "Simple"  # Single
    
    if multi_stage(task) and sequential_dependencies(task):
        return "Pipeline"  # Sequential
    
    if multiple_independent_parts(task):
        return "Parallel"  # Parallel
    
    if complex(task) and needs_3_plus_agents(task):
        return "Project"  # Team
```

## 常见工作流

### 新功能 (完整流水线)
```
product-agent → brand-agent → web-agent → design-reviewer 
  → frontend-agent + backend-agent → qa-agent → devops-agent → marketing-agent
```

### 安全审计
```
security-auditor → backend-agent → qa-agent
```

### 事件响应
```
incident-responder → devops-agent → cloud-architect
```

### 增长冲刺
```
seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent → data-analyst
```

## Why: 自动选择最优编排模式提高效率
## How to apply: founder-agent 根据任务特征自动选择模式