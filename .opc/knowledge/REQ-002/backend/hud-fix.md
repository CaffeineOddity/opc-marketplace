# HUD 状态栏实时更新修复

## 问题描述

1. **目录结构不匹配**: HUD 的 `findProjectState` 函数查找旧的 `pid-*` 目录格式，而 MCP 服务器使用新的 `${requirementId}_${source}` 目录格式
2. **阶段顺序错误**: `handleStateWrite` 使用 `Object.keys(state.pipeline.stages)` 获取阶段顺序，导致阶段完成后无法正确推进到下一个阶段
3. **状态图标不正确**: `formatPipelineStatus` 总是给当前阶段显示 `🔄` 图标，没有根据实际状态显示

## 修复内容

### 1. HUD 目录结构修复 (`hud/opc-hud.mjs`)

**修改 `findProjectState` 函数**:
- 优先读取 `sessions.json` 获取当前会话
- 支持新的 `${requirementId}_${source}` 目录格式
- 向后兼容旧的 `pid-*` 目录格式

### 2. 阶段顺序修复 (`src/mcp/handlers/state.ts`)

**修改 `handleStateWrite` 函数**:
- 使用预定义的阶段顺序 `['product', 'design', 'dev', 'qa', 'ship', 'growth']`
- 而不是 `Object.keys(state.pipeline.stages)`

### 3. 状态图标修复 (`hud/opc-hud.mjs`)

**修改 `formatPipelineStatus` 函数**:
- 根据实际状态显示图标: `✅` completed, `🔄` in_progress, `🚫` blocked, `⏳` pending
- 而不是总是给当前阶段显示 `🔄`

## 测试验证

```
# 新任务初始化
[OPC] | Opus | ctx:45% | REQ-003 product 🔄 → design

# product 完成后
[OPC] | Opus | ctx:45% | REQ-003 product ✅ → qa ⏳ → ship

# qa 开始后
[OPC] | Opus | ctx:45% | REQ-003 product ✅ → qa 🔄 → ship
```

## Why: 确保 HUD 实时反映项目状态变化
## How to apply: 所有状态更新应通过 opc_state_write 进行，HUD 会自动读取最新状态