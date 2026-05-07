# HUD 状态栏实时更新修复

## 问题描述

1. **目录结构不匹配**: HUD 的 `findProjectState` 函数查找旧的 `pid-*` 目录格式，而 MCP 服务器使用新的 `${requirementId}_${source}` 目录格式
2. **阶段顺序丢失**: 当 `opc_state_write` 更新阶段时，使用 `Object.keys(state.pipeline.stages)` 获取阶段顺序，但对象属性顺序不保证与原始定义一致
3. **状态图标不正确**: `formatPipelineStatus` 总是给当前阶段显示 `🔄` 图标，没有根据实际状态显示

## 修复内容

### 1. HUD 目录结构修复 (`hud/opc-hud.mjs`)

**修改 `findProjectState` 函数**:
- 优先读取 `sessions.json` 获取当前会话
- 支持新的 `${requirementId}_${source}` 目录格式
- 向后兼容旧的 `pid-*` 目录格式

### 2. 阶段顺序持久化 (`src/mcp/types.ts`, `src/mcp/state.ts`)

**添加 `stage_order` 字段**:
- 在 `ProjectState.pipeline` 中添加 `stage_order?: string[]`
- 在 `initializeProjectState` 中保存阶段顺序: `stage_order: Object.keys(stages)`

### 3. 使用保存的阶段顺序 (`src/mcp/handlers/state.ts`)

**修改 `handleStateWrite` 函数**:
- 使用 `state.pipeline.stage_order || Object.keys(state.pipeline.stages)`
- 保持动态编排能力，同时确保顺序一致性

### 4. 状态图标修复 (`hud/opc-hud.mjs`)

**修改 `formatPipelineStatus` 函数**:
- 根据实际状态显示图标: `✅` completed, `🔄` in_progress, `🚫` blocked, `⏳` pending

## 设计决策

**为什么使用 `stage_order` 而不是预定义顺序？**

stages 是动态编排的，不同的 workflow 或 auto-assembled 可能产生不同的阶段组合。例如：
- 完整流水线: `product → design → dev → qa → ship → growth`
- 简化流程: `product → qa`
- 安全审计: `product → dev → qa`

使用 `stage_order` 保存初始化时的阶段顺序，既保持了动态编排能力，又确保了阶段推进的一致性。

## Why: 确保 HUD 实时反映项目状态变化，同时保持动态编排能力
## How to apply: 所有状态更新应通过 opc_state_write 进行，HUD 会自动读取最新状态