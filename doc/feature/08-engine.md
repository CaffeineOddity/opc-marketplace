# 引擎（Engine）

所有引擎都是 TypeScript 代码，不是 prompt。引擎归属 opc-state-server。

引擎在执行时加载对应的管线控制节点（`platform/opc-orchestrator/pipeline/`），按其 body 中的规则执行。管线控制节点不可项目覆盖。

```
platform/mcp/opc-state-server/engine/
│
├── state-manager.ts       # 管线状态读写、恢复（加载 phase-execution 节点）
├── phase-validator.ts     # 阶段转换校验（加载 phase-execution 节点）
├── task-analyzer.ts       # LLM 任务分析（加载 task-analysis 节点）
└── node-resolver.ts       # 节点依赖解析 + 拓扑排序（加载 phase-execution 节点）
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
  全部通过 → Agent 执行
    → Agent 调用 opc_knowledge_get_batch 加载前置知识
    → 执行 node 指令
    → 成功: opc_knowledge_write + opc_node_complete
    → 失败: opc_node_fail → 用户修复 → opc_node_retry
```

## 各引擎职责

### state-manager

管线状态的唯一读写入口。由 opc-state-server 的 MCP 工具调用。

- 启动：`opc_pipeline_start` — 意图识别 → knowledge_list → 任务分析 + 需求拆分
- 初始化子管线：`opc_pipeline_init_sub` — knowledge_open → brief → state.json
- 恢复：`opc_pipeline_recover` — 检查 owner.pid → 更新 owner
- 完成：`opc_pipeline_complete` — 校验全部子管线 + 生成 manifest.md
- 取消：`opc_pipeline_abort` — 标记全部子管线/phase/node 为 aborted
- 更新：`opc_node_start` / `opc_node_complete`（含质量校验 L1+L2） / `opc_node_fail` / `opc_node_retry`（含级联重置）— node 状态变更
- 读取：`opc_pipeline_status` — 读取 state.json 展示进度
- 校验：`validate_node_completion()` — `opc_node_complete` 时执行 L1（产出物存在性）+ L2（quality_gates）校验
- 级联：`cascade_reset_after_retry()` — `opc_node_retry` 时计算下游影响面，自动重置受影响 node/phase
- 超时：`check_node_timeout()` — 惰性检测 in_progress node 是否超时，未达上限自动 retry，超限标记 failed
- 自动重试：`auto_retry_on_timeout()` — 超时后自动触发 `opc_node_retry`（含级联重置）
- SessionStart：扫描未完成管线，提示恢复

### phase-validator

校验阶段转换是否合法：前置阶段是否完成、当前阶段节点的 input 依赖是否全部满足。

- 输入: 目标阶段、当前管线状态、节点 input 列表
- 输出: `{ valid: boolean, blockers: [...] }`

高置信度场景自动推进，不阻塞用户。

### task-analyzer

唯一调用 LLM 的引擎。加载 `task-analysis` 节点，用 haiku 分析用户意图。

- 输入: 用户原始消息 + knowledge_list 返回的已有 unit 列表及结构
- 输出: `{ intent, confidence, description, tags, complexity, suggested_phases, knowledge_unit, scenario_hints, knowledge_plan }`
- 知识上下文让 task-analyzer 基于项目真实状态判断，而非盲猜 knowledge_unit
- `knowledge_plan`: 每项知识的操作计划（路径 + read/update/create + 当前状态），写入 brief.md
- `complexity` 决定后续执行策略（反思轮次、阶段推进方式、brief 详细度、节点选择粒度），详见 task-analysis 节点
- 每一步分析按节点 body 定义的规则执行：提炼描述 → 打标签 → 判复杂度 → 推阶段 → 提取知识点 → 匹配 scenario → 生成知识操作计划

### node-resolver

对选中的节点列表做依赖解析和拓扑排序，输出分组执行计划。同时检查并行组的冲突：

- **artifacts 冲突**：`output.artifacts` 路径重叠 → 降级串行
- **knowledge 冲突**：`output.knowledge` 路径重叠 → 降级串行（避免后写覆盖先写）

- `resolve(phase, nodes)`: opc_phase_confirm 时解析依赖 + 冲突检测 + 拓扑排序
- `adjust(phase, nodes)`: opc_phase_adjust 时重新生成预览（不锁定）
- 输入: 选中节点列表
- 输出: `[{ group: 1, nodes: [...], parallel: true }, { group: 2, nodes: [...], parallel: false }]`

### opc-knowledge-server

独立的知识库 MCP 服务，不属于引擎层。提供 7 个工具：`opc_knowledge_open/get/get_batch/write/delete/list/search`。详见 [03 知识体系](03-knowledge.md)。
