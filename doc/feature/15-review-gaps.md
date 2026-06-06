# 全量审查：缺点与待补充点

对 MCP 设计、需求文档、方案设计逐层扫描后的分析。

---

## 一、知识体系

### 1.1 写入非原子化（已解决）

~~`opc_knowledge_write` 先写 .md 文件，再更新 `index.json`。两者之间 crash 会导致 index.json 与实际文件不一致。~~

**决策**：移除 index.json。version 直接存入 .md 文件 frontmatter，写入只涉及单文件原子操作。`opc_knowledge_list` 用 readdir 扫描目录，`opc_knowledge_search` 走派生索引 .opc-knowledge.idx（可重建）。数据一致性风险消除。

### 1.2 并行写入冲突

两个并行 node 同时写 `user-auth/session/api`，后写覆盖先写。当前没有任何冲突检测。

**建议**：node-resolver 在文件域检查时，除了 artifacts 路径重叠，还要检查 `output.knowledge` 路径重叠。同一 knowledge 路径出现在两个并行 node 的 output 中 → 降级为串行，或标记冲突让用户决策。

### 1.3 知识依赖粒度太粗

`_refs` 只在 unit 级别（"authorization 依赖 user-auth"），不精确到 section/subsection。node 的 `input.knowledge` 路径精确但只用于加载，不参与依赖推导。

**建议**：node-resolver 推导依赖时优先用 node 声明的精确路径，`_refs` 仅作为 fallback。

### 1.4 回退没有级联失效（已解决）

~~回退到 04-implement-design 时，该阶段产出的 knowledge version 降为 0。但 05-implement 中已经基于旧 version 写完的代码产物不会回滚。代码和知识不一致了。~~

**决策**：采用分层策略（方案 D），废弃 `opc_phase_rollback`：
- L0（调整节点）：`opc_phase_adjust`（已有）
- L1（重做单个产出）：`opc_node_retry`（已有）
- L2（废弃整个 phase 知识）：`opc_phase_reset` — `opc_phase_confirm` 时快照 knowledge 文件，reset 时恢复快照 + 下游级联 pending
- L3（全量回退）：用户自行 git，OPC 不封装

快照仅覆盖知识文件，代码不回退（由 node 重跑时基于新知识修正）。不依赖 git。

---

## 二、MCP 工具

### 2.1 opc_pipeline_start 返回值类型不稳定

```
intent=chat       → { intent: "chat" }
intent=project_question → { intent, results: [...] }  
intent=task,low   → { intent, complexity: "low", knowledge_context }
intent=task,medium→ { intent, complexity, knowledge_unit, suggested_phases, ... }
intent=task,decomposed → { intent, needs_decomposition: true, sub_pipelines: [...] }
```

同一个工具返回 5 种不同 schema，调用方需要根据 `intent` 字段分发。容易出错。

**建议**：所有返回统一包含 `intent` + `complexity`（非 task 时为 null），额外字段用可选 key。

### 2.2 缺少 opc_phase_pause

`opc_node_fail` 后当前 phase 的其他 node 继续跑。但如果 failed node 产出的 knowledge 被下游依赖，继续跑没意义。

**建议**：`opc_node_fail` 检查是否有其他 pending node 的 blocked_by 依赖本节点。如有，返回 `phase_should_pause: true`，让 Claude 决定是否暂停整个 phase 待修复。

### 2.3 缺少 node 重试上限

`opc_node_retry` 可以无限调用。没有熔断机制。

**建议**：state.json 的 node 记录加 `retry_count`，超过 3 次自动拒绝重试，要求用户介入。

### 2.4 opc_node_start 不校验 Agent 可用性

node 定义了 `agents.primary: [backend-engineer]`，但 `opc_node_start` 不检查该 Agent 是否在已安装的 kit 中注册。

**建议**：`opc_node_start` 校验 Agent 可用性，不可用时立即返回 error（error.type: `agent_unavailable`），不等到执行中才发现。

### 2.5 缺少管线修改工具

`opc_pipeline_create` 创建后无法修改。用户想加一条子管线或调整 execution_order，只能 abort 重来。

**建议**：至少加 `opc_pipeline_replan`，允许在第一个 phase 启动前调整子管线列表和依赖关系。进入 phase 执行后锁定不可改。

---

## 三、管线生命周期

### 3.1 管线无超时

一条管线可以跑几天甚至永远 pending。没有 TTL。

**建议**：`pipeline-plan.json` 加 `deadline` 字段（可选）。超时后 state-manager 在 status 查询时返回 warning，不自动 abort。

### 3.2 部分完成无交付路径

拆分管线 sub-1 和 sub-2 完成，sub-3 失败。sub-1 的产物无法独立"发布"——整个管线只有 completed 或 failed 两个终态。

**建议**：`pipeline-plan.json` 的子管线加 `releasable: true/false`。`opc_pipeline_status` 展示哪些子管线已完成且可独立使用。

### 3.3 跨管线依赖不表达

如果 pipeline-A（用户认证）跑完后才应该跑 pipeline-B（权限管理），这个依赖关系无法在系统里表达。只能靠用户自觉。

**建议**：轻量方案——brief.md / knowledge_context 里提示"建议等 user-auth 管线完成后再启动本管线"，不做强制约束。

### 3.4 SessionStart 恢复逻辑未定义谁触发

文档说 "SessionStart → 扫描孤儿管线"。但 SessionStart 不是 MCP 工具，是 Claude Code 的生命周期事件。opc-state-server 如何感知 SessionStart？

**建议**：opc-state-server 提供一个 `opc_session_init` 工具，Claude Code 在 session 启动时调用。该工具内部执行孤儿管线扫描、返回待恢复管线列表。或者，直接在 `opc_pipeline_status`（不传参数时）自动附带孤儿检测结果。

---

## 四、节点系统

### 4.1 节点定义无版本

修改 `api-design.md` 节点定义后，已在跑的管线用的还是旧定义（因为 Agent 执行时才读文件）。但如果节点定义在 `opc_phase_confirm` 后、`opc_node_start` 前被修改，执行结果不可预期。

**建议**：`opc_phase_confirm` 时快照节点定义到 state.json 的节点记录中，后续执行以快照为准。

### 4.2 并行 Agent 无协调协议

`mode: parallel` 的 node 内多个 Agent 同时工作。但它们如何避免互相覆盖代码？当前只靠 file domain 检查（opc-node-resolver 层面），没有 Agent 间的实时通信。

**建议**：在 node 定义中加 `coordination` 字段，声明并行 Agent 的协作方式：`independent`（各写各的）、`sequential_write`（排队写共享文件）、`reviewer`（一个写一个审）。

### 4.3 管线控制节点与任务节点同质化程度不够

两者都是 markdown + frontmatter，但 `used_by` vs `phase` 的区分让它们在加载路径上走不同逻辑。这没问题，但文档里对两者的入参/出参格式没有统一约束。

**建议**：统一所有节点的 output schema，让 `opc_node_complete` 可以一致处理。

---

## 五、错误处理

### 5.1 下游 node 不知道上游重试了

`opc_node_retry("api-design")` 重跑后产出了新版本的 knowledge（v3）。但 `database-schema` 已经用 v2 跑完了，状态是 completed。它不会自动重新跑。

**建议**：`opc_node_retry` 成功后，检查哪些已完成的下游 node 的 input.knowledge 版本低于新产出的版本。返回 `stale_nodes: ["database-schema"]`，提示用户这些可能需要重跑。

### 5.2 opc_node_fail 不区分可恢复/不可恢复

所有失败统一标记 `failed`。但 "Agent 网络超时" 和 "用户需求本身矛盾" 是不同级别的失败。

**建议**：error.type 已部分解决（agent_error, test_failure, dependency_failure, user_abort），但缺 `unrecoverable` 类型。此类型的 node 不可 retry，直接要求人工介入。

---

## 六、可观测性

### 6.1 无审计日志

哪个 Agent 在哪个 node 写了哪条 knowledge？什么时候？只能靠 git log 推断。

**建议**：`opc_knowledge_write` 时在文件 frontmatter 中写入来源信息（pipeline_id, node_name, agent, timestamp）。不依赖 MCP 做审计存储。

### 6.2 opc_pipeline_status 是只读快照

没有事件流或 push 通知。Claude 需要主动轮询才能知道状态变化（目前靠 `opc_node_complete` 的返回值避免轮询，这是好的设计）。

**建议**：当前轮询问题已通过 `unblocked_nodes` 和 `ready_sub_pipelines` 返回值缓解。维持现状即可，不做 push 事件流。

---

## 七、工程可行性

### 7.1 调用次数线性增长

一个 medium 需求约 40 次 MCP 调用。拆分管线可能 100+ 次。每次 MCP 调用有 JSON-RPC 往返延迟。

**建议**：考虑"phase 自动模式"——高置信度 phase 整段自动执行（phase_start → confirm → 所有 node → phase_complete），只需 1 次 MCP 调用。目前 Claude 手动推 step by step 提供了最大控制力，但成本高。可作为优化方向但不急。

### 7.2 用户决策疲劳

每个 phase 都有反思确认环节。单管线 3 个 phase = 至少 3 次用户确认。拆分管线 4 条 × 3 phase = 12 次。

**建议**：medium 复杂度且 scenario_hints 高置信度命中时，可以"一键同意所有推荐"跳过逐 phase 确认。在 `opc_pipeline_create` 时提供一个 `auto_approve_phases: true` 选项，用户选择后全程自动推进。

### 7.3 kit 和 plugin.json 的耦合

plugin.json 声明了 capability（agents, skills, nodes），但 `opc_phase_start` 扫描的是 `phases/` 目录和 `opc-nodes/`。声明和实际文件是两套体系，可能不一致。

**建议**：`opc_phase_start` 扫描时对比 plugin.json 声明和实际文件，不一致时 warn。或者反过来：plugin.json 是唯一的 truth，扫描结果必须与声明一致才通过。

---

## 优先级

| 优先级 | 问题 | 理由 |
|--------|------|------|
| ~~P0~~ | ~~1.1 写入非原子化~~ | ✅ 已解决 — 移除 index.json，version 存 .md frontmatter |
| ~~P0~~ | ~~1.4 回退无级联失效~~ | ✅ 已解决 — 分层策略 + `opc_phase_reset` 快照恢复 |
| **P1** | 1.2 并行写入冲突 | 并行 node 场景必现 |
| **P1** | 2.3 缺少重试上限 | 无限重试循环 |
| **P1** | 4.2 并行 Agent 无协调 | 并行执行可能互相覆盖 |
| **P1** | 5.1 下游不知道上游重试 | 已完成 node 的产出过期 |
| **P2** | 2.1 返回值类型不稳定 | 调用方复杂度高 |
| **P2** | 2.4 Agent 可用性校验 | 提前发现问题 |
| **P2** | 3.4 SessionStart 触发 | 实现细节待定 |
| **P2** | 4.1 节点无版本快照 | 并发修改问题 |
| **P3** | 2.2 opc_phase_pause | 边缘场景 |
| **P3** | 2.5 管线修改工具 | 可通过 abort+重来绕过 |
| **P3** | 3.1 管线超时 | 暂不致命 |
| **P3** | 3.2 部分完成 | 拆分管线场景 |
| **P3** | 6.1 审计日志 | 可后续补 |
| **P3** | 7.1 调用次数 | 性能优化 |
| **P3** | 7.2 用户疲劳 | 体验优化 |

---

## 明确的未定义行为（需文档化）

这些不是 bug，但当前文档未说明预期行为：

| 场景 | 当前状态 | 需要明确的决策 |
|------|---------|---------------|
| 两个并行 node 写同一 knowledge | 未定义 | 降级串行 / 标记冲突 / 后写覆盖 |
| 回退后已完成的下游 node | 已定义 | `opc_phase_reset` 级联下游 phase/node → pending |
| 管线在 node 执行中 crash | 超时检测已设计 | 确认超时阈值 30 分钟，心跳粒度 |
| 同一 knowledge 被多次 write | 版本递增 | 确认不检查内容是否真的变化 |
| 删除的 knowledge 被下游 node 引用 | 未定义 | get 返回 null / 报错 |
