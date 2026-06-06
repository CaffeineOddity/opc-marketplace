# 补充设计

## 1. 阶段重置（Phase Reset）—— 分层回退策略

回退需求按粒度分四层，不同层用不同机制：

| 层 | 场景 | 机制 | 工具 |
|----|------|------|------|
| L0 | 调整节点选择 | 反思中修改节点列表 | `opc_phase_adjust`（已有） |
| L1 | 重做单个知识产出 | 重跑 node，version 正常递增 | `opc_node_retry`（已有） |
| L2 | 废弃整个 phase 的知识产出 | 从快照恢复 knowledge 文件 | `opc_phase_reset`（新增） |
| L3 | 废弃知识+代码，全量回退 | git checkout / git revert | 不封装，用户自行操作 |

### L2 快照机制

`opc_phase_confirm` 锁定节点计划时自动快照该 phase 节点的 `output.knowledge` 路径：

```
opc_phase_confirm → 快照:
  扫描 nodes[].output.knowledge 路径
  → 复制 opc-knowledge/<path>.md → .opc/snapshots/<pipeline>/<sub>/<phase>/
  → 文件不存在则跳过（新建的 knowledge 无旧版本）
```

### `opc_phase_reset` 行为

```
用户在 05-implement 中:
  "这个设计有问题，需要重新规划 API 结构"

→ 调用 opc_phase_reset(pipeline_id, "sub-1", "04-implement-design")
→ 从 .opc/snapshots/.../04-implement-design/ 恢复 knowledge 文件
→ 04-implement-design → pending（所有 node 重置）
→ 05-implement → pending（下游 phase 级联）
→ 06-testing → pending
→ 返回 { reset_phases: ["04-implement-design", "05-implement", "06-testing"] }
→ 用户从 04-implement-design 重新 opc_phase_start
```

关键规则：
- 仅恢复 `opc-knowledge/` 下的 .md 文件，不碰 `src/` 等代码
- 不依赖 git，未 commit 也能用
- 快照在 `opc_phase_confirm` 时创建，管线 completed/aborted 时自动清理
- aborted 管线不可 reset（快照已清理）

## 2. 错误恢复（Error Recovery）

node 执行失败通过 `opc_node_fail` 标记，通过 `opc_node_retry` 重试：

| 失败类型 | 策略 | 说明 |
|---------|------|------|
| Agent 执行错误 | opc_node_retry 重试 | 网络超时、临时性异常，修复后重试 |
| 测试失败 | 用户修复后 opc_node_retry | 代码或测试用例有问题，修复后重跑 |
| 依赖节点失败 | 阻塞下游 | 前置节点不完成，下游保持 pending |
| 用户中断 | 保存进度（state.json） | 下次通过 opc_pipeline_recover 恢复 |

失败节点状态流转：`in_progress → (opc_node_fail) failed → (opc_node_retry) in_progress`

`opc_node_retry` 行为：
- 仅允许从 failed 状态重试
- `dependency_failure` 类型的 failed 需等前置节点修复完成
- retry 后重新加载 node input（可能已被前置重新产出的新版本知识）

## 3. 管线取消（Pipeline Abort）

用户可能中途决定放弃当前管线。`opc_pipeline_abort` 统一处理：

```
用户: "取消" / "不做了"
  → opc_pipeline_abort(pipeline_id)
    → pipeline-plan.json: status → aborted
    → 遍历所有子管线: in_progress → aborted
    → 遍历所有 phase: in_progress → aborted
    → 遍历所有 node: in_progress → aborted
    → 下游 pending 子管线保持 pending（不再推进）
    → 管线不被删除，可手动清理
```

取消后管线目录保留，可手动删除。`aborted` 管线不参与 SessionStart 的恢复扫描。

## 4. 管线暂停与恢复

用户可能中途关闭 Claude Code。下次启动时 state-manager 扫描 `.opc/pipelines/`：

```
SessionStart:
  → state-manager 扫描 .opc/pipelines/*/pipeline-plan.json
  → 检查 status: in_progress 的管线
  → 检查 owner.pid 是否存活：
    ├── 存活 → 跳过（其他 session 正在跑）
    └── 已死 → 孤儿管线 → 提示用户恢复
  → 用户确认 → 更新 owner → 定位第一个 in_progress 的 node → 恢复执行
```

手动恢复入口：`opc_pipeline_recover(pipeline_id)`，无需等 SessionStart 自动扫描。

state.json 格式见 [06 管线状态](06-state.md)。

## 5. 多 Feature 并行

用户可能同时开发多个功能（如 "user-auth" 和 "subscription"）：

```
.opc/pipelines/
├── pipeline-20260530-001/           # user-auth 管线
└── pipeline-20260530-002/           # subscription 管线 (独立的阶段和节点)
```

- 每个任务有独立的管线状态
- `/opc-status` 展示所有活跃管线
- `/opc-nodes` 根据当前活跃管线的 knowledge_unit 上下文展示节点
- 切换上下文：`/opc-phase --pipeline <id>` 或自然语言 "切换到 subscription"
