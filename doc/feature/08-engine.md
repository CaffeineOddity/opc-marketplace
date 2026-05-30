# 引擎（Engine）

所有引擎都是 TypeScript 代码，不是 prompt。

```
platform/opc-core/mcp/engine/
│
├── state-manager.ts       # 管线状态读写、恢复
├── phase-validator.ts     # 阶段转换校验
├── task-analyzer.ts       # LLM 任务分析
├── node-resolver.ts       # 节点依赖解析 + 拓扑排序
└── knowledge-flow.ts      # 知识流强制执行
```

## 节点执行流程

```
执行 tdd-implementation 节点:
         │
         ▼
  phase-validator:  前置阶段 completed？
  node-resolver:    隐式依赖（output → input）全部 completed？
         │
         ▼
  全部通过 → knowledge-flow 加载 input 中的 knowledge → Agent 执行
         │
         ▼
  Agent 完成 → knowledge-save 写入 opc-knowledge
```

## 各引擎职责

### state-manager

管线状态的唯一读写入口。每个 task 创建一份 `state.json`，随执行进度实时更新。

- 创建: 任务分析完成后，创建 `state.json` 并写入 task 元信息
- 更新: 每个 node 状态变更时写入（pending → in_progress → completed/failed）
- 读取: SessionStart 时检查是否有未完成管线，有则提示恢复
- 查询: `/opc-status` 读取 state.json 展示进度

### phase-validator

校验阶段转换是否合法：前置阶段是否完成、当前阶段节点的 input 依赖是否全部满足。

- 输入: 目标阶段、当前管线状态、节点 input 列表
- 输出: `{ valid: boolean, blockers: [...] }`

### task-analyzer

唯一调用 LLM 的引擎。用 haiku 分析用户意图，输出任务描述、tags、复杂度、推荐阶段、scenario hints。

- 输入: 用户原始消息
- 输出: `{ intent, confidence, description, tags, complexity, suggested_phases, scenario_hints }`

### node-resolver

对选中的节点列表做依赖解析和拓扑排序，输出分组执行计划。同时检查并行组的文件域冲突。

- 输入: 选中节点列表
- 输出: `[{ group: 1, nodes: [...], parallel: true }, { group: 2, nodes: [...], parallel: false }]`

### knowledge-flow

管理知识在 node 间的流转：加载前置知识注入到 Agent 上下文，将 Agent 产出写入 opc-knowledge。

- 加载: 读取节点 `input.knowledge` → 从 opc-knowledge 读取对应条目 → 注入 Agent prompt
- 保存: Agent 完成后 → 按 `output.knowledge` 写入 opc-knowledge（draft 状态）
