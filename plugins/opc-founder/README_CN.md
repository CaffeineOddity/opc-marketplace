# opc-founder

一人公司编排器插件 —— 协调所有其他代理完成完整产品生命周期的 CEO 代理。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/opc` | 一键入口 —— 自动评估任务并编排代理 |
| `/opc-plugin` | 管理插件 —— 安装、更新、卸载、列表、状态 |
| `/opc-hud` | 配置 HUD 状态栏 —— 安装、卸载、状态 |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| founder-agent | opus | CEO 代理，支持 4 种编排模式 |

### MCP 工具（状态管理）

| 工具 | 描述 |
|------|------|
| `opc_state_init` | 初始化项目状态，创建 session |
| `opc_state_read` | 读取项目进度和阶段状态 |
| `opc_state_write` | 更新阶段状态、进度、产出物 |
| `opc_checkpoint_create` | 创建检查点 |
| `opc_checkpoint_list` | 列出所有检查点 |
| `opc_checkpoint_rollback` | 回滚到检查点 |
| `opc_handoff` | 记录代理交接上下文 |
| `opc_memory` | 读写项目记忆 |
| `opc_task_group_create` | 创建并行/串行任务组 |
| `opc_task_update` | 更新任务状态和进度 |
| `opc_task_group_status` | 获取任务组状态 |

## 快速开始

```shell
/opc <任务描述>
```

### 示例

| 命令 | 执行内容 |
|------|----------|
| `/opc build a user management feature` | 完整流水线：产品 → 设计 → 开发 → 测试 → 发布 |
| `/opc research the competitor landscape` | 派遣 product-agent 进行调研 |
| `/opc fix this bug` | 并行：开发 + 测试代理 |
| `/opc security audit` | 派遣 security-auditor (opus) |
| `/opc ship the new release` | 顺序：测试 → 运维 → 营销 |
| `/opc status` | 显示当前项目进度 |
| `/opc resume` | 恢复上次活跃的 session |

## 状态管理

OPC 为多阶段项目提供持久化状态管理：

### 功能特性

- **跨会话记忆** — 暂停和恢复项目
- **阶段追踪** — 追踪 product → design → dev → qa → ship → growth 进度
- **并行任务组** — 追踪并发代理，支持每个任务的进度
- **代理交接** — 在代理之间传递工作时保留上下文
- **检查点** — 在风险操作前创建恢复点
- **项目记忆** — 存储决策、模式和经验教训

### 状态文件

```
.opc/
├── state/
│   ├── sessions/{session-id}/project-state.json
│   └── checkpoints/{checkpoint-id}.json
├── memory/project-memory.json
└── logs/
```

### 使用方式

founder-agent 自动为多阶段项目管理状态。你也可以使用命令：

```shell
/opc status              # 显示当前项目进度
/opc resume              # 恢复上次活跃的 session
```

## 插件管理

```shell
/opc-plugin install          # 交互式安装
/opc-plugin install all      # 安装全部 7 个插件
/opc-plugin install web      # Web 产品 (product + design + dev + qa + ship + growth)
/opc-plugin install mobile   # Mobile App (product + design + dev + qa + ship)
/opc-plugin install designer # 产品设计专注 (product + design + docs)
/opc-plugin update           # 更新市场 + 所有插件
/opc-plugin uninstall        # 卸载所有 OPC 插件
/opc-plugin list             # 列出已安装插件
```

## HUD 状态栏

OPC 提供 HUD（状态栏显示）：

```
[OPC#1.0] | Opus | session:5m | skill:opc-plugin | ctx:45% | 🔧3 ⚡1 🎯2
```

| 元素 | 说明 |
|------|------|
| `[OPC#版本]` | OPC 市场标识 |
| `Opus/Sonnet/Haiku` | 当前模型名称 |
| `session:Xm` | 会话时长 |
| `skill:名称` | 最后激活的 skill |
| `ctx:X%` | 上下文使用率（绿/黄/红） |
| `🔧N ⚡N 🎯N` | 工具/Agent/Skill 调用次数 |

```shell
/opc-hud setup      # 安装 HUD
/opc-hud uninstall  # 卸载 HUD
/opc-hud status     # 显示 HUD 状态
```

## 卸载

| 命令 | 删除插件 | 删除 HUD |
|------|:--------:|:--------:|
| `/opc-plugin uninstall` | ✅ | ❌ |
| `/opc-hud uninstall` | ❌ | ✅ |
| `/plugin remove opc-marketplace` | ✅ | ✅ |

**注意：** HUD 存储在 `~/.claude/plugins/cache/opc-marketplace/hud/`，因此 `/plugin remove opc-marketplace` 会自动清理插件和 HUD。

## 编排模式

| 模式 | 方法 | 使用场景 |
|------|------|----------|
| **单代理** | 一次 Agent 调用 | 单阶段，单个代理 |
| **流水线** | 顺序 Agent 调用 | 多阶段，有依赖关系 |
| **并行** | 同时调用多个 Agent | 独立任务 |
| **团队** | TeamCreate + TaskCreate + SendMessage | 复杂项目，3+ 代理 |

## 代理网络（29 个代理）

founder-agent 编排 8 个插件中的 29 个专业代理：

| 插件 | 代理 | 阶段 |
|------|------|------|
| **product-kit** | product-agent, startup-analyst, business-analyst | 产品 |
| **design-kit** | brand-agent, web-agent, mobile-agent, design-reviewer | 设计 |
| **dev-kit** | frontend-agent, backend-agent, backend-architect, security-auditor, mobile-developer, database-architect, performance-engineer, ai-engineer, prompt-engineer, technical-writer | 开发 |
| **qa-kit** | qa-agent, accessibility-expert | 测试 |
| **ship-kit** | devops-agent, cloud-architect, incident-responder | 发布 |
| **growth-kit** | marketing-agent, data-analyst, seo-keyword-strategist, seo-content-writer, seo-content-planner | 增长 |
| **docs-kit** | docs-agent | 文档 |

## 工作流模式

### 新功能（完整流水线）

```
阶段 1: product-agent → 调研 + 需求
阶段 2: brand-agent → web-agent → design-reviewer → 设计规范
阶段 3: frontend-agent + backend-agent (并行) → 实现
阶段 4: qa-agent → security-auditor → 验证
阶段 5: devops-agent → 部署
阶段 6: marketing-agent → 发布
```

### 安全审查

```
security-auditor (opus) → 审计发现
    → backend-agent → 修复后端问题
    → frontend-agent → 修复前端问题
    → qa-agent → 验证修复
```

### 事故响应

```
incident-responder → 分类 + 诊断
    → devops-agent → 缓解措施
    → cloud-architect → 基础设施变更
```

### 增长冲刺

```
seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent
```
