# 05 — 可靠性设计（失败矩阵 + 降级链 + 健康度）

> 本章定义 reflection-server 自身的失败处理：失败矩阵、降级链、
> 健康度统计与自动 unlearn、超时处理、server 不可达降级、
> 以及"永不阻塞主流程"的工程保证。

## 一、设计原则

1. **永不阻塞主流程**：reflection-server 的任何失败，最坏结果是 `validator-only + ask_user`，不会卡住 pipeline
2. **可降级不可崩溃**：每种失败都有明确的降级路径，不存在"等待超时 / 无限重试"
3. **失败即学习**：每次失败都计入 method 健康度，驱动自动 unlearn
4. **隔离失败半径**：一个 sub-agent 的失败不影响其他 sub-agent 或 step

## 二、失败矩阵

### 2.1 失败分类

| # | 失败类型 | 影响范围 | 严重度 | 频率预期 |
|---|---|---|---|---|
| F1 | sub-agent 超时 | 单次 reflection round | medium | ~2% |
| F2 | sub-agent 返回无效输出 | 单次 reflection round | medium | ~3% |
| F3 | meta-validator reject | 单次 reflection round | medium | ~5% |
| F4 | corrections 库读写错误 | 单次 reflection round | low | ~1% |
| F5 | reflection-server 进程不可达 | 当前 step 及后续 | critical | ~0.1% |
| F6 | 连续 reject 同一 method | 该 method 所有调用 | high | ~1% |
| F7 | token 预算耗尽 | 当前 step 的后续 rounds | medium | ~5% |
| F8 | pending_reflection 过期未登记 | 单次 reflection | low | ~2% |

### 2.2 每类失败的响应

#### F1 — sub-agent 超时

```
opc_reflect_execute 内部 Task spawn 超时（默认 120s）:
    ① 丢弃当前 round 的结果
    ② 若 primary method 超时 → 降级到 secondary method
    ③ 若 secondary 也超时 → 降级到 ask_user
    ④ 计入 method 健康度（超时率）
    ⑤ 不创建 pending_reflection
```

#### F2 — sub-agent 返回无效输出

```
meta-validator 检查 sub-agent 输出:
    ① 输出不符合 output_contract → reject
    ② 计入 method FP 率
    ③ 降级到 secondary method
    ④ 若 secondary 也无效 → ask_user
```

#### F3 — meta-validator reject

```
meta-validator 判定 sub-agent 输出不可信:
    ① 整次 reflection round 作废
    ② 降级到 secondary method
    ③ 若 secondary 也被 reject → ask_user
    ④ FP 率 +1（用于健康度统计）
```

#### F4 — corrections 库读写错误

```
opc_corrections 调用失败:
    ① reflection 继续执行（不依赖 corrections）
    ② prior_corrections 返回空数组
    ③ 记录 warning 到 reflection_log
    ④ 不阻塞 reflection
```

#### F5 — reflection-server 不可达

最严重的失败。详见 §四。

#### F6 — 连续 reject 同一 method

```
同一 method 近 100 次调用中 FP 率 > THRESH_FP (0.3):
    ① 自动 unlearn 该 method (TTL = UNLEARN_TTL_HOURS, 默认 24h)
    ② 被 unlearn 的 method 从候选池移除
    ③ primary 被移除 → secondary 升级为 primary
    ④ primary + secondary 都被移除 → validator-only + ask_user
    ⑤ opc_reflect_admin({action:"unlearn_method"}) 也可手动触发
```

#### F7 — token 预算耗尽

```
累计 token > budget:
    ① 停止当前 step 的所有 secondary method
    ② 未执行的方法标记 skipped: budget_exceeded
    ③ 降级到 validator-only + ask_user
    ④ 记录 opc_corrections({action:"record", ...}) 标记 budget_exhausted
```

#### F8 — pending_reflection 过期

```
pending_reflection.expires_at 到达:
    ① state-server 检测到过期 pending
    ② 写 reflection_log: { verdict: "expired_pending_decision" }
    ③ 下一次 opc_flow_query → ask_user (resume / discard / skip)
    ④ artifact 文件保留 7 天
```

## 三、降级链

```
完整 reflection (primary + secondary)
    │
    ├── primary 超时/无效/reject
    │       │
    │       ▼
    │   secondary 接管
    │       │
    │       ├── secondary 通过 → record correction + done
    │       │
    │       └── secondary 也失败
    │               │
    │               ▼
    │           validator-only (V1-V5 确定性校验)
    │               │
    │               ├── validator pass → done (无 reflection 增强)
    │               │
    │               └── validator objection
    │                       │
    │                       ▼
    │                   ask_user (用户介入)
    │                       │
    │                       ├── 用户回复 → opc_flow_correct
    │                       │
    │                       └── 用户无响应 / skip
    │                               │
    │                               ▼
    │                           skip (标记 skipped_by_user)
    │                           不阻塞流程，继续下一步
    │
    └── budget 耗尽
            │
            ▼
        validator-only + ask_user
```

关键保证：**链的末端永远是 ask_user + skip。任何情况都不会死锁。**

## 四、Reflection-Server 不可达（M18.g）

### 4.1 检测

Host 在调 `opc_reflect_plan` 时检测到 MCP transport 异常（连接超时 / 协议错误）。

### 4.2 入口

```
state-server.FlowServer.reflectionUnavailable({
  session_id,
  step_id,
  reason,              // "connection_timeout" | "protocol_error" | ...
  severity?,           // "ask_user" (default) | "warning_only"
  validator_summary?,  // V1-V5 内部已执行的结果
  context_artifacts?,  // validator artifact 路径列表
  pipeline_pointer_ref?
})
```

### 4.3 两种严重度

**`severity: "ask_user"`（默认）**：

```
① 合成 pending_user_question:
    question_id: "uq-rs-unavailable-<ulid>"
    question: "Reflection server unreachable. Continue with validator-only?"
    options: ["continue", "abort", "retry"]
    expires_at: now + 30min

② 下一个写类工具被 pending-question-guard 拦截
③ 用户必须走 opc_flow_user_reply 或 opc_flow_correct 才能继续

④ reflection_log 记录:
    { verdict: "validator_only_fallback",
      trigger: "reflection_server_unavailable" }

⑤ user_interventions[] 记录:
    { trigger: "reflection_server_unavailable_acknowledged" }
```

**`severity: "warning_only"`**：

```
① 仅写 reflection_log，不阻塞
② 适用于 P4 brief / P6 critique / P7 CoVe 三类豁免场景
   这些场景不应阻断 unblocked_nodes 推进或 phase_complete
```

### 4.4 恢复

reflection-server 恢复后，后续 step 正常走 reflection。
之前被 skip 的 step 不做回溯（可通过 on_demand 事后反思）。

## 五、健康度统计

### 5.1 统计维度

```
每种 method × step 的组合，追踪最近 100 次调用:
    ① FP_rate = meta_validator_rejections / total_calls
    ② timeout_rate = timeouts / total_calls
    ③ objection_to_diff_rate = (kept_objections 导致 evidence_diff) / total_objections
    ④ avg_latency_ms
    ⑤ avg_tokens_in / avg_tokens_out
    ⑥ unlearned: boolean
    ⑦ unlearn_until: ISO8601 | null
```

### 5.2 查询

```
opc_reflect_admin({action:"query_stats", method:"M4-critique", window:"7d"})
```

### 5.3 自动 unlearn 阈值

| 指标 | 阈值 | 动作 |
|---|---|---|
| `FP_rate` | > 0.3 | unlearn 24h |
| `timeout_rate` | > 0.15 | unlearn 24h |
| `objection_to_diff_rate` | < 0.1 且 total_calls > 50 | 建议降级（不自动 unlearn） |

### 5.4 恢复

- TTL 到期后自动恢复，统计清零
- 手动恢复：`opc_reflect_admin({action:"unlearn_method", method, undo: true})`
- 恢复后 method 以正常优先级重新参与候选

## 六、超时与重试

### 6.1 超时配置

| 操作 | 超时 | 说明 |
|---|---|---|
| `opc_reflect_plan` | 5s | 查 corrections + 选 method，应很快 |
| `opc_reflect_execute({inline:true})` | 120s | 含 sub-agent Task spawn 时间 |
| `opc_reflect_complete` | 10s | meta-validator + 写盘，应很快 |
| `opc_reflect_admin({action:"record_interventions"})` | 180s | distiller 处理多条介入，可能较慢 |
| `opc_corrections` | 5s | 读写文件操作 |

### 6.2 重试策略

- sub-agent 超时不重试（直接降级到 secondary）
- corrections 读写错误不重试（reflection 不依赖 corrections 也能运行）
- reflection-server 不可达不重试（直接走 validator-only fallback）

**不做指数退避重试**。OPC 的设计立场：reflection 是增强，不是必要条件。
重试浪费用户时间，降级到 validator-only 已经足够安全。

## 七、相关文档

- [00 Server 设计总览](./00_overview.md) — 可靠性总述 + reflection-registry-guard
- [04 Sub-Agent 权限](./04_subagent-permissions.md) — 双保险机制
- [06 可观测性](./06_observability.md) — 健康度统计的日志记录
- [04-reflection-flow/06_call-sequence-contract.md](../04-reflection-flow/06_call-sequence-contract.md) — pending 过期处理契约
- [父文档](../00_index.md) — reflection-server 总索引
