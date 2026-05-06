# 状态管理系统

## 目录结构

```
.opc/
├── workflows/                 # 工作流规范 (提交到 git)
│   ├── feature-development.json
│   ├── bug-fix.json
│   └── my-custom-workflow.json
├── knowledge/                 # 知识库 (提交到 git)
│   ├── REQ-001/
│   │   ├── requirement/
│   │   ├── design/
│   │   ├── backend/
│   │   └── ...
│   └── index.json
├── memory/
│   └── project-memory.json    # 项目记忆 (提交到 git)
├── state/
│   ├── sessions/              # 会话状态 (不提交)
│   └── checkpoints/           # 回滚点 (可选)
├── artifacts/                 # 产出文件 (可选)
└── .project-init              # 初始化标记 (不提交)
```

## Git 建议

| 路径 | 提交? | 原因 |
|------|:-----:|------|
| `.opc/workflows/` | ✅ | 团队共享工作流规范 |
| `.opc/knowledge/` | ✅ | 团队共享项目知识 |
| `.opc/memory/` | ✅ | 团队共享项目记忆 |
| `.opc/state/` | ❌ | 个人会话数据 |
| `.opc/state/checkpoints/` | 可选 | 回滚点 |
| `.opc/artifacts/` | 可选 | 取决于项目 |
| `.opc/.project-init` | ❌ | 本地安装标记 |

## MCP 工具

| 工具 | 用途 |
|------|------|
| `opc_state_init` | 初始化项目状态和知识库 |
| `opc_state_read` | 读取当前状态 |
| `opc_state_write` | 更新状态 |
| `opc_checkpoint_create` | 创建回滚点 |
| `opc_checkpoint_rollback` | 回滚到检查点 |
| `opc_handoff` | 代理间交接 |
| `opc_memory` | 项目记忆管理 |
| `opc_knowledge_*` | 知识库管理 |

## Why: 跨会话持久化确保工作连续性，知识库确保跨阶段上下文一致性
## How to apply: 所有代理操作应通过 MCP 工具管理状态