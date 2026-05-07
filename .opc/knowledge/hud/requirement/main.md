# HUD 知识库需求规格

## 项目概述

HUD (Heads-Up Display) 是 OPC Marketplace 的状态栏显示系统，为开发者提供实时的项目状态信息。

## 用户故事

### US-1: 实时状态显示

**作为** 开发者
**我希望** 在状态栏看到当前会话的关键信息
**以便** 快速了解项目状态，无需切换上下文

**验收标准:**
- 显示 OPC 版本标识
- 显示当前使用的模型 (Opus/Sonnet/Haiku)
- 显示会话持续时间
- 显示最后激活的 skill
- 显示上下文窗口使用百分比
- 显示 Tool/Agent/Skill 调用计数

### US-2: 自动安装

**作为** 开发者
**我希望** HUD 在安装 plugin 时自动配置
**以便** 无需手动配置即可使用

**验收标准:**
- 执行 `/opc-plugin install` 时自动安装 HUD
- 无需重启 Claude Code
- 配置持久化到 settings.json

### US-3: Context 警告

**作为** 开发者
**我希望** 当 context 接近上限时看到警告
**以便** 及时进行 compaction

**验收标准:**
- 0-50% 显示绿色
- 50-75% 显示黄色
- 75-100% 显示红色

## 功能需求

### FR-1: HUD 显示格式

```
[OPC#version] | Model | session:Xm | skill:name | ctx:X% | 🔧N ⚡N 🎯N
```

| 元素 | 类型 | 更新频率 |
|------|------|----------|
| OPC#version | String | 静态 |
| Model | Enum | 模型切换时 |
| session:Xm | Duration | 每分钟 |
| skill:name | String | Skill 激活时 |
| ctx:X% | Percentage | 实时 |
| 🔧N ⚡N 🎯N | Counters | 每次调用 |

### FR-2: MCP Tools 集成

HUD 数据来源于 MCP tools:

| Tool | 数据 |
|------|------|
| `opc_state_read` | 当前 task, stage |
| `opc_sessions_list` | Session 信息 |
| Context API | Context 使用百分比 |

### FR-3: 状态持久化

- Session 绑定到 lock_id
- State 存储在 `.opc/state/`
- Knowledge 存储在 `.opc/knowledge/`

## 非功能需求

### NFR-1: 性能

- HUD 更新延迟 < 100ms
- 不影响主工作流程性能
- 最小化内存占用

### NFR-2: 可用性

- 信息密度高但不拥挤
- 不干扰主要工作区域
- 一行显示所有关键信息

### NFR-3: 兼容性

- 支持 Claude Code CLI
- 支持 Claude Code Desktop
- 支持各种终端尺寸

## 技术约束

### TC-1: Statusline API

- 使用 Claude Code statusline setting
- 配置存储在 `~/.claude/settings.json`

### TC-2: 目录结构

```
.opc/
├── workflows/          # Git tracked
├── memory/             # Git tracked
├── state/              # Git ignored
├── knowledge/          # Git tracked
└── .project-init       # Git ignored
```

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `src/mcp/state.ts` | State management |
| `src/mcp/session.ts` | Session tracking |
| `src/mcp/knowledge.ts` | Knowledge library |
| `src/mcp/tools.ts` | MCP tool definitions |

## 里程碑

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | MCP Tools 实现 | ✅ 完成 |
| Phase 2 | Knowledge Library | ✅ 完成 |
| Phase 3 | HUD Statusline | ✅ 完成 |
| Phase 4 | 知识库文档 | 🔄 进行中 |