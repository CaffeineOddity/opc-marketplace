# 知识库协议

## Stage-to-Domain 映射

| Stage | Domain | Doc | 读取 | 写入 |
|-------|--------|-----|------|------|
| product | requirement | main | - | 需求、用户故事 |
| design | design | ui, interaction | requirement | UI 规范、交互流程 |
| dev (web) | platforms | web/tech | requirement, design | 技术决策、架构 |
| dev (backend) | backend | api, architecture | requirement, design | API 契约、Schema |
| qa | backend | test | requirement, backend | 测试计划、边界用例 |
| ship | shared | infrastructure | backend, platforms | 部署配置 |
| growth | growth | metrics | requirement | 成功指标 |

## 知识流模式

```
BEFORE STAGE:
1. 获取 requirement_id: opc_state_read().project.requirement_id
2. 解析阶段的 knowledge config
3. 对每个 read_before domain: opc_knowledge_read(requirementId, domain)
4. 合并所有知识到 context
5. 注入知识上下文到 agent dispatch

STAGE EXECUTION: 代理执行工作

AFTER STAGE:
6. 从代理输出提取知识更新
7. opc_knowledge_write(requirementId, domain, doc, content)
8. 知识现在可供下一阶段使用
```

## 知识库 API

```javascript
// 初始化
opc_knowledge_init(requirementId, title)

// 读取
opc_knowledge_read(requirementId, category, doc?)

// 写入
opc_knowledge_write(requirementId, category, doc, content, mode)

// 检查存在
opc_knowledge_exists(requirementId, category, doc)

// 列出文档
opc_knowledge_docs(requirementId, category)

// 列出需求
opc_knowledge_list(category?, status?)
```

## Why: 知识库是跨阶段上下文一致性的核心机制
## How to apply: 每个阶段必须先读取前置知识，完成后写入本阶段知识