---
name: 状态持久化系统技术指南
description: OPC 状态持久化系统的使用指南，包括 MCP 工具使用、状态管理流程、检查点操作和最佳实践。
category: tech_guide
feature_name: state-persistence
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide, state, persistence, mcp]
---
## 技术栈

- **协议**：MCP (Model Context Protocol)
- **存储**：JSON 文件
- **目录**：`.opc/state/`, `.opc/memory/`

## 快速开始

### 查看当前状态

```shell
/opc status
```

输出示例：
```
## 当前任务
🔄 用户认证功能 - 执行中

### 流水线状态
✅ product: 已完成 (product-agent)
🔄 design: 执行中 (web-agent)
⏳ dev: 待执行
⏳ qa: 待执行

### 产物
- spec.md
- design/ui.md

### 知识特征
user-auth
```

### 恢复任务

```shell
/opc resume
```

### 清除任务

```shell
/opc status
# 如果需要放弃当前任务
opc_state_clear
```

## MCP 工具参考

### 状态管理工具

#### opc_state_init

初始化新任务会话。

```typescript
opc_state_init({
  project_name: "用户登录功能",
  project_description: "实现用户登录，支持邮箱和手机号"
})
```

返回：
```json
{
  "lock_id": "12345_1700000000",
  "knowledge_feature_name": "user-auth"  // 自动匹配或新建
}
```

#### opc_state_read

读取当前任务状态。

```typescript
opc_state_read()
```

返回：
```json
{
  "lock_id": "12345_1700000000",
  "project": {
    "name": "用户登录功能",
    "knowledge_feature_name": "user-auth"
  },
  "pipeline": {
    "product": {"status": "completed"},
    "design": {"status": "in_progress"}
  },
  "artifacts": ["spec.md"]
}
```

#### opc_state_write

更新任务状态。

```typescript
opc_state_write({
  stage: "design",
  stage_status: "completed",
  agent: "web-agent",
  artifact: "design/ui.md"
})
```

#### opc_state_clear

清除当前任务。

```typescript
opc_state_clear()
```

### 检查点工具

#### opc_checkpoint_create

创建检查点。

```typescript
opc_checkpoint_create({
  description: "设计阶段完成，准备开发"
})
```

返回：
```json
{
  "checkpoint_id": "cp_1700000300"
}
```

#### opc_checkpoint_list

列出所有检查点。

```typescript
opc_checkpoint_list()
```

返回：
```json
{
  "checkpoints": [
    {
      "checkpoint_id": "cp_1700000300",
      "description": "设计阶段完成",
      "created_at": "2026-05-12T10:30:00Z"
    }
  ]
}
```

#### opc_checkpoint_rollback

回滚到检查点。

```typescript
opc_checkpoint_rollback({
  checkpoint_id: "cp_1700000300"
})
```

### 交接和记忆工具

#### opc_handoff

记录 Agent 交接。

```typescript
opc_handoff({
  from_agent: "product-agent",
  to_agent: "web-agent",
  context: {
    decisions: ["使用邮箱登录"],
    constraints: ["必须支持移动端"],
    artifacts: ["spec.md"],
    questions: ["是否需要第三方登录?"]
  }
})
```

#### opc_memory

读写项目记忆。

```typescript
// 写入记忆
opc_memory({
  action: "write",
  category: "decision",
  content: "使用 PostgreSQL 作为主数据库",
  rationale: "支持复杂查询和事务"
})

// 读取记忆
opc_memory({
  action: "read",
  category: "decision"
})
```

#### opc_sessions_list

列出所有会话。

```typescript
opc_sessions_list()
```

## 实现要点

### 单窗口单任务模型

```python
def init_state(project_name, description):
    # 1. 检查当前窗口是否有活跃任务
    current_lock = get_current_lock()
    if current_lock:
        return {"error": "已有活跃任务，请先完成或清除"}

    # 2. 生成 lock_id
    lock_id = f"{os.getpid()}_{int(time.time())}"

    # 3. 创建锁文件
    lock_file = STATE_DIR / "locks" / f"{lock_id}.lock"
    write_json(lock_file, {
        "lock_id": lock_id,
        "pid": os.getpid(),
        "created_at": datetime.now().isoformat()
    })

    # 4. 初始化状态
    state_dir = STATE_DIR / lock_id
    state_dir.mkdir(parents=True)

    state = {
        "lock_id": lock_id,
        "project": {
            "name": project_name,
            "description": description
        },
        "pipeline": {},
        "artifacts": [],
        "created_at": datetime.now().isoformat()
    }

    write_json(state_dir / "project-state.json", state)

    return {"lock_id": lock_id}
```

### 检查点创建

```python
def create_checkpoint(description):
    # 1. 读取当前状态
    state = read_current_state()

    # 2. 生成 checkpoint_id
    checkpoint_id = f"cp_{int(time.time())}"

    # 3. 创建检查点文件
    checkpoint = {
        "checkpoint_id": checkpoint_id,
        "description": description,
        "created_at": datetime.now().isoformat(),
        "state": state
    }

    checkpoint_file = CHECKPOINT_DIR / f"{checkpoint_id}.json"
    write_json(checkpoint_file, checkpoint)

    return {"checkpoint_id": checkpoint_id}
```

### 检查点回滚

```python
def rollback_checkpoint(checkpoint_id):
    # 1. 读取检查点
    checkpoint_file = CHECKPOINT_DIR / f"{checkpoint_id}.json"
    checkpoint = read_json(checkpoint_file)

    # 2. 获取当前 lock_id
    current_lock = get_current_lock()

    # 3. 覆盖当前状态
    state_file = STATE_DIR / current_lock / "project-state.json"
    write_json(state_file, checkpoint["state"])

    return {"success": True}
```

## 使用场景

### 场景1: 新功能开发

```
1. opc_state_init("用户登录功能")
2. product-agent 执行
3. opc_state_write(stage="product", status="completed")
4. opc_checkpoint_create("需求完成")
5. design-agent 执行
6. opc_handoff(from="product-agent", to="design-agent")
7. opc_state_write(stage="design", status="completed")
8. ...
```

### 场景2: 大改动前备份

```
1. 查看当前状态: opc_state_read()
2. 创建检查点: opc_checkpoint_create("重构前备份")
3. 执行重构
4. 如果失败: opc_checkpoint_rollback("重构前备份")
```

### 场景3: 记录重要决策

```
1. 做出重要决策
2. opc_memory(action="write", category="decision", content="...")
3. 后续可查阅: opc_memory(action="read", category="decision")
```

### 场景4: 跨会话恢复

```
1. 新会话开始
2. opc_sessions_list() 查看活跃会话
3. opc_state_read() 查看状态
4. 继续执行未完成的阶段
```

## 最佳实践

### 检查点使用

- **何时创建**：
  - 大改动前（重构、删除代码）
  - 阶段完成后
  - 重要决策后

- **命名规范**：
  - 描述性命名："设计完成"、"重构前备份"
  - 包含阶段信息

### Agent 交接

- **交接内容**：
  - 决策：已做出的重要决定
  - 约束：必须遵守的限制
  - 产物：已生成的文件
  - 问题：待解决的问题

- **交接时机**：
  - 每个阶段完成后
  - Agent 切换时

### 项目记忆

- **记录类型**：
  - `decision` - 技术选型、架构决策
  - `pattern` - 设计模式、代码模式
  - `lesson` - 经验教训、踩坑记录
  - `constraint` - 业务约束、技术约束

- **何时记录**：
  - 重要决策时
  - 发现新模式时
  - 踩坑后
  - 确定约束时

## 常见问题

### Q: 如何查看当前任务？

```
/opc status
# 或调用 opc_state_read()
```

### Q: 如何放弃当前任务？

```
opc_state_clear()
# 然后可以开始新任务
```

### Q: 如何恢复中断的任务？

```
/opc resume
# 或手动查看状态后继续
opc_state_read()
# 继续执行未完成的阶段
```

### Q: 检查点太多怎么办？

```
# 检查点文件在 .opc/state/checkpoints/
# 可以手动删除不需要的检查点文件
# 或保留最近几个即可
```

### Q: 状态文件损坏怎么办？

```
# 1. 检查是否有检查点
opc_checkpoint_list()

# 2. 如果有，回滚到最近的检查点
opc_checkpoint_rollback(checkpoint_id)

# 3. 如果没有，清除任务重新开始
opc_state_clear()
```

### Q: 如何查看历史决策？

```
opc_memory(action="read", category="decision")
```

## 文件路径参考

| 路径 | 用途 |
|------|------|
| `.opc/state/{lock-id}/project-state.json` | 任务状态 |
| `.opc/state/locks/{lock-id}.lock` | 窗口锁 |
| `.opc/state/checkpoints/{checkpoint-id}.json` | 检查点 |
| `.opc/state/{lock-id}/handoffs/{timestamp}.json` | 交接记录 |
| `.opc/memory/project-memory.json` | 项目记忆 |

## Git 提交建议

| 路径 | 提交? | 原因 |
|------|:-----:|------|
| `.opc/state/` | ❌ | 个人会话数据 |
| `.opc/state/checkpoints/` | 可选 | 回滚点 |
| `.opc/memory/` | ✅ | 团队共享的项目知识 |