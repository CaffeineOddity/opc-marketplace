# MCP 服务器实现

## opc-state-server

位置: `plugins/opc-founder/mcp/dist/opc-state-server.bundle.cjs`

### 提供的工具

| 工具 | 功能 |
|------|------|
| opc_state_init | 初始化项目状态和知识库 |
| opc_state_read | 读取当前状态 |
| opc_state_write | 更新状态 |
| opc_state_clear | 清除当前任务 |
| opc_sessions_list | 列出所有 OPC 任务 |
| opc_checkpoint_create | 创建回滚点 |
| opc_checkpoint_list | 列出回滚点 |
| opc_checkpoint_rollback | 回滚到检查点 |
| opc_handoff | 代理间交接 |
| opc_memory | 项目记忆管理 |
| opc_task_group_create | 创建并行任务组 |
| opc_task_group_status | 获取任务组状态 |
| opc_task_update | 更新任务状态 |
| opc_knowledge_init | 初始化知识库 |
| opc_knowledge_read | 读取知识 |
| opc_knowledge_write | 写入知识 |
| opc_knowledge_exists | 检查知识存在 |
| opc_knowledge_docs | 列出文档 |
| opc_knowledge_list | 列出需求 |
| opc_workflows_path | 获取工作流目录路径 |

### 配置方式

```json
{
  "mcpServers": {
    "opc": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/dist/opc-state-server.bundle.cjs"]
    }
  }
}
```

### 数据存储

- 状态文件: `.opc/state/{session-id}/project-state.json`
- 知识库: `.opc/knowledge/{requirement-id}/{category}/{doc}.md`
- 记忆: `.opc/memory/project-memory.json`
- 工作流: `.opc/workflows/*.json`

## Why: MCP 服务器提供跨会话持久化能力
## How to apply: 所有状态操作通过 MCP 工具进行