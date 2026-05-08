---
name: architecture
description: 生成 HUD 知识库 - 为 OPC Marketplace 的 HUD 组件创建完整的知识库文档
category: backend
topic: hud
created_at: 2026-05-07T04:30:24.788Z
updated_at: 2026-05-08T06:43:10.609Z
---
# HUD (Heads-Up Display) Architecture

## Overview

HUD 是 OPC Marketplace 的状态栏显示系统，用于实时展示当前会话的关键信息，帮助开发者快速了解项目状态。

## HUD 显示格式

```
[OPC#version] | Model | session:Xm | skill:name | ctx:X% | 🔧N ⚡N 🎯N
```

### 元素说明

| Element | Description | Example |
|---------|-------------|---------|
| `[OPC#version]` | OPC marketplace identifier | `[OPC#1.0]` |
| `Opus/Sonnet/Haiku` | Current model name | `Opus` |
| `session:Xm` | Session duration | `session:5m` |
| `skill:name` | Last activated skill | `skill:opc-plugin` |
| `ctx:X%` | Context window usage (green/yellow/red) | `ctx:45%` |
| `🔧N ⚡N 🎯N` | Tool/Agent/Skill call counts | `🔧3 ⚡1 🎯2` |

## Context Window Color Coding

| Range | Color | Meaning |
|-------|-------|---------|
| 0-50% | Green | Healthy context usage |
| 50-75% | Yellow | Approaching limit |
| 75-100% | Red | Critical, consider compaction |

## Implementation

HUD 通过 Claude Code 的 statusline 设置实现，在 `/opc-plugin install` 时自动安装。

### Statusline 配置位置

HUD 配置存储在 Claude Code 的 settings 中：

```
~/.claude/settings.json → statusline setting
```

### 自动安装流程

1. 用户执行 `/opc-plugin install`
2. Plugin hook 检测安装事件
3. 自动配置 HUD statusline
4. HUD 立即生效，无需重启

## Design Principles

### 1. Minimal Footprint
- HUD 只占用一行状态栏
- 信息密度高但不拥挤
- 不干扰主要工作区域

### 2. Real-time Updates
- Session duration 实时更新
- Context usage 动态计算
- Call counts 即时反映

### 3. Actionable Information
- Context 超过 75% 提示需要 compaction
- Session 时间帮助判断是否需要 checkpoint
- Call counts 显示工作强度

## Integration Points

### MCP Tools Integration
HUD 数据来源：
- `opc_state_read` → 获取当前 task 和 stage
- `opc_sessions_list` → 获取 session 信息
- Context window API → 获取使用百分比

### Skill Activation Tracking
- 每次 Skill 调用更新 `skill:name` 显示
- Skill 计数器 `🎯N` 增加

### Agent Dispatch Tracking
- 每次 Agent 调用更新 `⚡N` 计数
- Tool 调用更新 `🔧N` 计数

## Related Files

| File | Purpose |
|------|---------|
| `src/mcp/state.ts` | State management for HUD data |
| `src/mcp/session.ts` | Session tracking |
| `src/mcp/tools.ts` | MCP tool definitions |
| `plugins/opc-founder/hooks/` | HUD installation hooks |