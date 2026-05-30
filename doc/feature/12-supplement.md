# 补充设计

## 1. 阶段回退（Phase Rollback）

实现过程中发现设计问题，允许回退到之前的阶段：

```
用户在 04-implementation 中:
  "这个设计有问题，需要重新规划 API 结构"
  
→ 管线暂停，当前阶段标记为 blocked
→ 02-planning 重新进入 in_progress
→ api-design 节点的 knowledge 被标记为 "需要更新"
→ 完成后，04-implementation 恢复执行
```

回退规则：
- 回退后，回退阶段之后的所有 knowledge 条目标记为 `draft`（需要重新验证）
- 回退阶段后的 node 状态重置为 `pending`
- 用户可手动回退（`/opc-phase back 02-planning`）

## 2. 错误恢复（Error Recovery）

node 执行失败时的处理策略：

| 失败类型 | 策略 | 说明 |
|---------|------|------|
| Agent 执行错误 | 自动重试 1 次 | 网络超时、临时性错误 |
| 依赖节点失败 | 阻塞下游 | 串行节点等待前置节点修复 |
| 用户中断 | 保存进度（state.json） | 下次启动可恢复 |

失败节点状态流转：`in_progress → failed → (retry) in_progress / (skip) skipped / (abort) aborted`

## 3. 管线暂停与恢复

用户可能中途关闭 Claude Code。下次启动时 state-manager 扫描 `.opc/state/pipelines/`：

```
SessionStart:
  → state-manager 扫描 .opc/state/pipelines/*.json
  → 检查 status: in_progress 的管线
  → 如有 → 提示: "检测到未完成的管线: user-auth (04-implementation 阶段)。继续？"
  → 用户确认 → 定位第一个 in_progress 的 node → 恢复执行
```

state.json 格式见 [06 管线状态](06-state.md)。

## 4. 多 Feature 并行

用户可能同时开发多个 feature（如 "user-auth" 和 "payment"）：

```
.opc/state/
├── pipelines/
│   ├── pipeline-20260530-001.json    # user-auth 管线
│   └── pipeline-20260530-002.json    # payment 管线 (独立的阶段和节点)
```

- 每个 feature 有独立的管线状态
- `/opc-status` 展示所有活跃管线
- `/opc-nodes` 根据当前活跃的 feature 上下文展示节点
- 切换上下文：`/opc-phase --feature payment` 或自然语言 "切换到 payment"
