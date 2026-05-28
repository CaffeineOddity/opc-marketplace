# 引擎（Engine）

所有引擎都是 TypeScript 代码，不是 prompt。

```
platform/opc-core/mcp/engine/
│
├── gate-evaluator.ts      # 门禁条件求值
├── stage-validator.ts     # 阶段转换校验
├── task-analyzer.ts       # LLM 任务分析
├── node-resolver.ts       # 节点依赖解析 + 拓扑排序
└── knowledge-flow.ts      # 知识流强制执行
```

## Gate 强制执行流程

```
执行 tdd-implementation 节点:
         │
         ▼
  stage-validator:  前置阶段 completed？entry-gates 满足？
  gate-evaluator:   节点 entry_gates [spec-exists, architecture-reviewed] 满足？
  node-resolver:    depends_on 节点全部 completed？
         │
         ▼
  全部通过 → knowledge-flow 加载前置知识 → Agent 执行
         │
         ▼
  Agent 完成 → knowledge-save 写入 opc-knowledge → exit-gate 检查
```

## 各引擎职责

### gate-evaluator

对 entry-gates 和 exit-gates 的每一条规则求值，返回通过/不通过及原因。

- 输入: gate 配置（类型、路径、规则）
- 输出: `{ passed: boolean, failures: [{gate, reason}] }`

### stage-validator

校验阶段转换是否合法：前置阶段是否完成、当前阶段的前置知识是否就绪。

- 输入: 目标阶段、当前管线状态
- 输出: `{ valid: boolean, blockers: [...] }`

### task-analyzer

唯一调用 LLM 的引擎。用 haiku 分析用户意图，输出任务描述、tags、复杂度、推荐阶段、scenario hints。

- 输入: 用户原始消息
- 输出: `{ intent, confidence, description, tags, complexity, suggested_stages, scenario_hints }`

### node-resolver

对选中的节点列表做依赖解析和拓扑排序，输出分组执行计划。同时检查并行组的文件域冲突。

- 输入: 选中节点列表
- 输出: `[{ group: 1, nodes: [...], parallel: true }, { group: 2, nodes: [...], parallel: false }]`

### knowledge-flow

管理知识在 node 间的流转：加载前置知识注入到 Agent 上下文，将 Agent 产出写入 opc-knowledge。

- 加载: 读取 `requires.knowledge` → 从 opc-knowledge 读取对应条目 → 注入 Agent prompt
- 保存: Agent 完成后 → 按 `provides.knowledge` 写入 opc-knowledge（draft 状态）
