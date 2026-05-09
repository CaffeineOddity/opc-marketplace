---
name: OPC Knowledge 常见问题
description: OPC Knowledge 常见问题解答，包括任务管理、知识库、窗口锁、工作流、任务组、Agent 交接等问题。
category: guide
topic: opc-state
created_at: 2026-05-09T09:06:06.517Z
updated_at: 2026-05-09T09:06:06.517Z
tags: [faq, troubleshooting, guide, questions]
---
# OPC Knowledge 常见问题

## 任务管理

### Q: 如何恢复之前的任务？

A: 使用 `opc_state_init` 并提供相似的项目名称，系统会自动匹配（相似度 >= 50%）。

```typescript
opc_state_init({
  project_name: "用户认证功能"  // 与之前任务相似
})
// 系统会自动匹配并复用现有 requirement_id
```

### Q: 如何切换到不同的任务？

A: 先清除当前任务，再初始化新任务。

```typescript
// 清除当前任务
opc_state_clear()

// 初始化新任务
opc_state_init({
  project_name: "新任务"
})
```

### Q: 一个窗口可以有多个任务吗？

A: 不可以。一个窗口同时只能有一个活跃任务。要切换任务，先 `opc_state_clear` 清除当前任务。

### Q: 如何查看所有历史任务？

A: 调用 `opc_sessions_list` 列出所有任务。

```typescript
opc_sessions_list()
```

---

## 知识库

### Q: 知识索引损坏怎么办？

A: 调用 `opc_knowledge_rebuild_index` 从文件系统重建索引。

```typescript
opc_knowledge_rebuild_index()
```

**使用场景：**
- `index.json` 损坏或丢失
- 手动操作文件后
- 迁移版本后

### Q: 如何删除知识主题？

A: 目前需要手动删除目录和更新索引。

```bash
# 删除主题目录
rm -rf .opc/knowledge/my-topic

# 重建索引
opc_knowledge_rebuild_index()
```

### Q: 知识文档支持什么格式？

A: 知识文档使用 Markdown 格式，支持 YAML frontmatter。

```markdown
---
name: 文档名称
description: 文档描述
category: backend
topic: user-auth
tags: [api, authentication]
---

# 文档内容

...
```

### Q: 如何批量读取知识文档？

A: 使用 `opc_knowledge_list_brief` 获取列表，然后按需读取。

```typescript
// 获取文档列表
const docs = opc_knowledge_list_brief({
  topic: "user-auth"
})

// 读取特定文档
opc_knowledge_read({
  topic: "user-auth",
  category: "backend"
})
```

---

## 窗口锁

### Q: 如何处理陈旧的锁？

A: 系统会自动检测并清理超过 30 秒且进程已终止的锁。

如果需要手动清理：

```bash
# 查看锁文件
ls .opc/state/locks/

# 删除陈旧锁（确保进程已终止）
rm .opc/state/locks/pid-xxxxx.lock
```

### Q: 为什么显示"窗口已被占用"？

A: 可能原因：
1. 另一个 Claude Code 窗口正在运行
2. 之前的进程异常退出，锁未清理

**解决方案：**
1. 关闭其他窗口
2. 等待 30 秒让系统自动清理
3. 手动删除陈旧锁

---

## 工作流

### Q: 如何创建自定义工作流？

A: 在 `.opc/workflows/` 目录下创建 JSON 文件。

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
    }
  ],
  "rules": {
    "tdd": true,
    "knowledge_enabled": true
  }
}
```

### Q: 工作流匹配不正确怎么办？

A: 检查触发条件设置：

1. **关键词优先** - 系统先检查关键词
2. **正则模式** - 关键词不匹配时检查正则
3. **顺序匹配** - 第一个匹配的工作流生效

**调试方法：**
```typescript
// 查看工作流目录
opc_workflows_path()

// 读取工作流文件检查触发条件
```

### Q: 如何禁用某个阶段？

A: 设置 `required: false` 或添加 `skip_conditions`。

```json
{
  "stage": "design",
  "required": false,
  "skip_conditions": ["no_ui_changes"]
}
```

---

## 任务组

### Q: 任务组什么时候标记完成？

A: 根据完成条件：

| 条件 | 规则 |
|------|------|
| `all` | 所有任务完成 |
| `any` | 任一任务完成 |
| `threshold` | 达到阈值数量 |

### Q: 如何追踪并行任务进度？

A: 使用 `opc_task_group_status`。

```typescript
opc_task_group_status({
  stage: "dev"
})
```

### Q: 任务之间可以有依赖吗？

A: 可以，在创建任务时指定 `dependencies`。

```typescript
opc_task_group_create({
  tasks: [
    { agent: "a", description: "任务A" },
    { agent: "b", description: "任务B", dependencies: ["tg-xxx-task-0"] }
  ]
})
```

---

## Agent 交接

### Q: 交接记录存在哪里？

A: 存储在 `.opc/state/{lock_id}/handoffs.json`。

### Q: 如何查看交接历史？

A: 交接记录通过 `opc_handoff` 写入，后续 Agent 可以读取相关 artifacts 获取上下文。

### Q: 交接时应该传递什么信息？

A: 建议包含：

1. **artifacts** - 产出的文件路径
2. **constraints** - 技术约束和决策
3. **context** - 业务背景和原因

---

## 性能

### Q: 知识库变慢怎么办？

A: 可能原因和解决方案：

| 原因 | 解决方案 |
|------|----------|
| 文档过多 | 使用 `list_brief` 按需加载 |
| 索引过大 | 重建索引清理无效条目 |
| 网络存储 | 使用本地存储 |

### Q: 如何优化知识读取？

A: 建议：

1. 使用 `list_brief` 先获取列表
2. 按需读取具体文档
3. 缓存已读取的知识

---

## 故障排除

### Q: 状态更新不生效？

A: 检查：

1. 是否有活跃任务（`opc_state_read`）
2. 参数是否正确
3. 文件权限是否正确

### Q: 知识写入失败？

A: 可能原因：

1. 目录权限问题
2. 磁盘空间不足
3. 路径包含特殊字符

### Q: 如何重置整个系统？

A: 警告：这会删除所有数据！

```bash
# 删除所有 OPC 数据
rm -rf .opc/

# 重新初始化
/opc-plugin init
```

---

## 更多帮助

- [使用指南](guide.md) - 完整使用指南
- [API 参考](../api/reference.md) - MCP 工具 API
- [技术架构](../tech-doc/architecture.md) - 架构设计
