# 动态阶段顺序设计

## 核心原则

**stages 是动态编排的，不是固定的。**

不同的 workflow 或 auto-assembled 会产生不同的阶段组合：
- 完整流水线: `product → design → dev → qa → ship → growth`
- 简化流程: `product → qa`
- 安全审计: `product → dev → qa`
- 移动应用: `product → design → dev → qa → ship`

## 错误做法

❌ 使用预定义的阶段顺序：
```typescript
const stageOrder = ['product', 'design', 'dev', 'qa', 'ship', 'growth'];
```

这会破坏动态编排能力，导致阶段推进错误。

## 正确做法

✅ 在初始化时保存阶段顺序，后续使用保存的顺序：

```typescript
// types.ts
interface ProjectState {
  pipeline: {
    current_stage: string;
    stage_order?: string[];  // 保存阶段顺序
    stages: Record<string, StageState>;
  };
}

// state.ts - initializeProjectState
const stageOrder = Object.keys(stages);
return {
  pipeline: {
    current_stage: firstStage,
    stage_order: stageOrder,  // 保存顺序
    stages,
  },
};

// handlers/state.ts - handleStateWrite
const stageOrder = state.pipeline.stage_order || Object.keys(state.pipeline.stages);
```

## Why: 保持动态编排能力，同时确保阶段推进一致性
## How to apply: 所有涉及阶段顺序的操作都应使用 stage_order，而非预定义数组