# 07 MCP 工具

节点级 4 个工具完整规范。

---

## 工具总览

| # | 工具 | 说明 |
|---|------|------|
| 16 | `opc_node_start` | node 开始执行（含 Agent 可用性校验） |
| 17 | `opc_node_complete` | node 完成（L1 + L2 校验） |
| 18 | `opc_node_fail` | node 失败（retry_count < max 自动重试） |
| 19 | `opc_node_retry` | 重跑 completed/failed node（自动级联重置下游） |

---

## opc_node_start

> ⚠️ **reflection-registry-guard 前置校验**：本工具受 registry-guard 保护。若 `flow-state.json.pending_reflections[]` 非空，则 reject 并返回 `required_action`，要求先调 `opc_flow_reflect` 登记反思记录。完整契约见 [05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md)。

```
参数: pipeline_id, sub_pipeline_id, node_name

行为:
  ⓪ registry-guard 前置校验 → pending_reflections 非空时 reject
  ① 读取 node 定义（按"项目覆盖优先"解析最终路径），提取 agents.primary[]
  ② 扫描已安装 kit → 构建可用 Agent 集合
  ③ 逐一校验 primary Agent 是否可用 → 不可用立即报错
  ④ 校验 input.knowledge 的 min_version 是否满足（L0）
  ⑤ 全部可用 → 写入 input + status: in_progress + agent + started_at
  ⑥ 读取 node .md body（已剥离 frontmatter），随返回值注入
  ⑦ 更新 flow-state.json:
      · current_pipeline_pointer = { sub_pipeline_id, phase, node: node_name }
      · last_heartbeat_at 刷新

返回:
{
  node: "tdd-implementation",
  status: "in_progress",
  agent: "backend-engineer",
  input_knowledge: [{path, version, content}, ...],   ← 已加载的 input 知识
  node_file_path: "phases/05-implement/nodes/tdd-implementation.md",  ← 已解析覆盖优先级
  node_body: "<node body 全文，不含 frontmatter>",     ← 直接注入，省一次 Read
  dispatch_instruction: "use Task tool with subagent_type='backend-engineer', 在隔离 context 中执行 node_body 指令；执行完毕后回报 evidence",
  dispatch_context: {
    pipeline_id: "pipeline-xxx",
    sub_pipeline_id: "sub-1",
    node_name: "tdd-implementation",
    instruction_template: "你是 backend-engineer，正在执行节点 tdd-implementation。执行以下指令并产出 evidence JSON。所有 opc_knowledge_write 调用必须带 metadata: {pipeline_id, node}。\n\n--- node_body ---\n<node_body>\n--- 已加载知识 ---\n<input_knowledge JSON>"
  },
  unblocked_nodes_check: "本节点完成后才会触发；当前不返回"
}
```

### Agent 委派模式（方案 A：Task 隔离）

`dispatch_instruction` 告知 Claude 主进程使用 Task 工具 spawn sub-agent：

- `subagent_type` 来自 `agents.primary[0]`
- sub-agent 在隔离 context 中执行 `node_body`
- 主进程必须把 `dispatch_context` 完整传入 Task 工具的 prompt，确保 sub-agent 在调用 `opc_knowledge_write` 时带 metadata
- sub-agent 完成后回报 evidence 给主进程，主进程据此调 `opc_node_complete`

这种模式带来 context 隔离 + Skill 按需加载，避免主进程被 node body 污染。

---

## opc_node_complete

```
参数: pipeline_id, sub_pipeline_id, node_name, evidence?

行为:
  ① L1 — 产出物存在性校验（始终执行）
  ② L2 — 质量门校验（仅当 node 声明了 quality_gates）
  ③ 全部通过 → 写入 output + evidence 摘要，标记 completed
  ④ 严格解锁: 扫描 pending 节点，仅当 blocked_by 全部 completed 才纳入 unblocked_nodes
     （并行场景下：A 先完成不会解锁 blocked_by:[A,B] 的下游 C；必须等 B 也 completed）
  ⑤ 更新 flow-state.json:
      · current_pipeline_pointer.node = unblocked_nodes[0]（若非空，便于 resume 接续）
      · 若 phase 内全部 completed → pointer.node 置 null（等待 opc_phase_complete）
      · last_heartbeat_at 刷新

返回:
{
  status: "completed",
  output: [...],
  evidence: {...},
  unblocked_nodes: ["next-node-a", ...],   ← 严格语义：blocked_by 全满足才返回
  flow_next: {
    suggestion: "若 unblocked_nodes 非空 → 启动下一个 opc_node_start；若 phase 内全部 completed → 调 opc_phase_complete"
  }
}

evidence 结构:
{
  "summary": "TDD 实现完成：3 个测试文件，12/12 通过",
  "test_results": { "passed": 12, "failed": 0, "skipped": 0 },
  "lint_results": { "errors": 0, "warnings": 2 },
  "build_passed": true,
  "type_check_passed": true,
  "files_created": ["src/auth/login.ts"],
  "knowledge_written": [{"path": "user-auth/session/api", "version": 2}]
}
```

---

## opc_node_fail

```
参数: pipeline_id, sub_pipeline_id, node_name, error: {message, type}

行为:
  ① retry_count += 1，写入 error 到 state.json
  ② retry_count < max_retries → auto_retrying（不级联）
  ③ retry_count ≥ max_retries → exhausted（标记 failed）
```

---

## opc_node_retry

```
参数: pipeline_id, sub_pipeline_id, node_name, reset_retry_count?: boolean (默认 true)

行为:
  → 检查 node.status ∈ [failed, completed]，否则拒绝
  → 计算影响面:
      同 phase: blocked_by 包含当前 node 的已完成 node
      下游 phase: 所有已完成 node
  → 自动级联重置下游 → 当前 node → in_progress
  → reset_retry_count=true → retry_count 清零（用户手动 retry 视为新一轮）
    reset_retry_count=false → retry_count 保留（用于超时自动 retry）
```

---

## 相关文档

- [05_execution-and-retry.md](05_execution-and-retry.md) — 执行流程 + 三种重试语义
- [06_source-and-override.md](06_source-and-override.md) — Agent 可用性来自 `plugin.json`
- [08_internal-engines.md](08_internal-engines.md) — state-manager 内部校验逻辑
