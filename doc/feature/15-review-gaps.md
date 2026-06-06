# 全量审查：缺点与待补充点

对 MCP 设计、需求文档、方案设计逐层扫描后的分析。

---

## 一、管线生命周期

### 1.1 管线无超时

一条管线可以跑几天甚至永远 pending。没有 TTL。

**建议**：`pipeline-plan.json` 加 `deadline` 字段（可选）。超时后 state-manager 在 status 查询时返回 warning，不自动 abort。

### 1.2 跨管线依赖不表达

如果 pipeline-A（用户认证）跑完后才应该跑 pipeline-B（权限管理），这个依赖关系无法在系统里表达。只能靠用户自觉。

**建议**：轻量方案——brief.md / knowledge_context 里提示"建议等 user-auth 管线完成后再启动本管线"，不做强制约束。

---

## 二、节点系统

### 2.1 节点定义无版本

修改 `api-design.md` 节点定义后，已在跑的管线用的还是旧定义（因为 Agent 执行时才读文件）。但如果节点定义在 `opc_phase_confirm` 后、`opc_node_start` 前被修改，执行结果不可预期。

**建议**：`opc_phase_confirm` 时快照节点定义到 state.json 的节点记录中，后续执行以快照为准。

### 2.2 管线控制节点与任务节点同质化程度不够

两者都是 markdown + frontmatter，但 `used_by` vs `phase` 的区分让它们在加载路径上走不同逻辑。这没问题，但文档里对两者的入参/出参格式没有统一约束。

**建议**：统一所有节点的 output schema，让 `opc_node_complete` 可以一致处理。

---

## 三、错误处理

### 3.1 opc_node_fail 不区分可恢复/不可恢复

所有失败统一标记 `failed`。但 "Agent 网络超时" 和 "用户需求本身矛盾" 是不同级别的失败。

**建议**：error.type 已部分解决（agent_error, test_failure, dependency_failure, user_abort），但缺 `unrecoverable` 类型。此类型的 node 不可 retry，直接要求人工介入。

---

## 四、工程可行性

### 4.1 调用次数线性增长

一个 medium 需求约 40 次 MCP 调用。拆分管线可能 100+ 次。每次 MCP 调用有 JSON-RPC 往返延迟。

**建议**：考虑"phase 自动模式"——高置信度 phase 整段自动执行（phase_start → confirm → 所有 node → phase_complete），只需 1 次 MCP 调用。目前 Claude 手动推 step by step 提供了最大控制力，但成本高。可作为优化方向但不急。

### 4.2 kit 和 plugin.json 的耦合

plugin.json 声明了 capability（agents, skills, nodes），但 `opc_phase_start` 扫描的是 `phases/` 目录和 `opc-nodes/`。声明和实际文件是两套体系，可能不一致。

**建议**：`opc_phase_start` 扫描时对比 plugin.json 声明和实际文件，不一致时 warn。或者反过来：plugin.json 是唯一的 truth，扫描结果必须与声明一致才通过。

---

## 优先级

| 优先级 | 问题 | 理由 |
|--------|------|------|
| **P2** | 2.1 节点无版本快照 | 并发修改问题 |
| **P3** | 1.1 管线超时 | 暂不致命 |
| **P3** | 4.1 调用次数 | 性能优化 |

---

## 明确的未定义行为（需文档化）

这些不是 bug，但当前文档未说明预期行为：

| 场景 | 当前状态 | 需要明确的决策 |
|------|---------|---------------|
| 管线在 node 执行中 crash | 超时检测已设计 | 确认超时阈值 30 分钟，心跳粒度 |
| 同一 knowledge 被多次 write | 版本递增 | 确认不检查内容是否真的变化 |
| 删除的 knowledge 被下游 node 引用 | 未定义 | get 返回 null / 报错 |
