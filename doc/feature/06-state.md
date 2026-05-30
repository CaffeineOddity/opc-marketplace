# 管线状态（State）

每个 task 对应一份 `state.json`，存储在 `.opc/state/pipelines/`。state-manager 引擎负责读写。

## 数据结构

```json
{
  "id": "pipeline-20260530-001",
  "task": {
    "description": "实现用户认证系统",
    "tags": ["backend", "auth", "database"],
    "complexity": "medium",
    "feature": "user-auth",
    "scenario_hints": ["add-feature"]
  },
  "status": "in_progress",
  "created_at": "2026-05-30T10:00:00Z",
  "updated_at": "2026-05-30T10:30:00Z",

  "phases": [
    {
      "phase": "02-planning",
      "status": "completed",
      "started_at": "2026-05-30T10:00:00Z",
      "completed_at": "2026-05-30T10:15:00Z",
      "nodes": [
        {
          "name": "api-design",
          "status": "completed",
          "agent": "backend-engineer",
          "input": [
            {"knowledge": "requirement/main"}
          ],
          "output": [
            {"artifact": "opc-deliverables/02-planning/api-design.md"},
            {"knowledge": "planning/api-design"}
          ],
          "started_at": "2026-05-30T10:01:00Z",
          "completed_at": "2026-05-30T10:10:00Z"
        },
        {
          "name": "database-schema",
          "status": "completed",
          "agent": "database-engineer",
          "input": [
            {"artifact": "opc-deliverables/02-planning/api-design.md"}
          ],
          "output": [
            {"artifact": "opc-deliverables/02-planning/database-schema.md"},
            {"knowledge": "planning/database-schema"}
          ],
          "started_at": "2026-05-30T10:01:00Z",
          "completed_at": "2026-05-30T10:12:00Z"
        }
      ]
    },
    {
      "phase": "04-implementation",
      "status": "in_progress",
      "started_at": "2026-05-30T10:20:00Z",
      "nodes": [
        {
          "name": "backend-endpoint",
          "status": "completed",
          "agent": "backend-engineer",
          "input": [
            {"artifact": "opc-deliverables/02-planning/api-design.md"},
            {"artifact": "opc-deliverables/02-planning/database-schema.md"}
          ],
          "output": [
            {"artifact": "src/api/auth.ts"},
            {"knowledge": "implementation/backend-api"}
          ],
          "started_at": "2026-05-30T10:21:00Z",
          "completed_at": "2026-05-30T10:35:00Z"
        },
        {
          "name": "tdd-implementation",
          "status": "in_progress",
          "agent": "backend-engineer",
          "input": [
            {"artifact": "opc-deliverables/02-planning/api-design.md"},
            {"knowledge": "planning/database-schema"}
          ],
          "started_at": "2026-05-30T10:21:00Z"
        },
        {
          "name": "auth-integration",
          "status": "pending",
          "agent": "backend-engineer",
          "blocked_by": ["backend-endpoint"]
        },
        {
          "name": "security-review",
          "status": "pending",
          "agent": "security-engineer",
          "blocked_by": ["tdd-implementation"]
        }
      ],
    },
    {
      "phase": "05-testing",
      "status": "pending",
      "nodes": []
    }
  ]
}
```

## 状态枚举

| 层级 | 可选值 |
|------|--------|
| pipeline | `pending` → `in_progress` → `completed` / `failed` / `aborted` |
| phase | `pending` → `in_progress` → `completed` / `blocked` |
| node | `pending` → `in_progress` → `completed` / `failed` / `skipped` |

## 生命周期

```
task-analyzer 完成
  → state-manager 创建 state.json（写入 task + phase 列表）
  → 每个 phase 启动，status → in_progress
  → node-resolver 解析依赖，写入 phase.nodes（pending 节点仅含 name/status/agent/blocked_by）
  → 每个 node 开始执行，写入 input（来自 node 定义），status → in_progress
  → node 完成，写入 output（实际产出），status → completed，state-manager 写入 updated_at
  → 全部 node completed → phase status → completed
  → 全部 phase completed → pipeline status → completed
```

## 管线恢复

```
SessionStart
  → state-manager 扫描 .opc/state/pipelines/*.json
  → 发现 status: in_progress 的管线
  → 提示用户: "检测到未完成的管线: user-auth (04-implementation)，继续?"
  → 用户确认 → 定位第一个 in_progress 的 node → 恢复执行
```

## node 状态变更触发

state-manager 在以下时机写入 state.json：

| 事件 | 操作 |
|------|------|
| 管线创建 | 写入 task 元信息 + phase 列表（全部 pending） |
| phase 开始 | 写入 `phase.status: in_progress` + `started_at` |
| node 开始 | 写入 `input`（来自 node 定义）+ `status: in_progress` + `agent` + `started_at` |
| node 完成 | 写入 `output`（实际产出）+ `status: completed` + `completed_at` |
| node 失败 | 写入 `status: failed` + `error`，pipeline 暂停 |
| phase 完成 | 写入 `phase.status: completed` + `completed_at` |
| pipeline 完成 | 写入 `pipeline.status: completed` |

### input/output 写入规则

- **pending**: 不写入 `input`/`output`。这些信息在 node 定义文件中，无需复制。
- **in_progress**: 写入 `input`，值必须与 node 定义一致。
- **completed**: 写入 `output`，记录实际产出路径，必须覆盖 node 定义中声明的所有 output 条目。
- **failed**: 保留 `input`（已写入），`output` 为空或部分写入，附加 `error` 说明失败原因。

### error 字段

node 失败时写入，包含错误信息：

```json
{
  "name": "tdd-implementation",
  "status": "failed",
  "agent": "backend-engineer",
  "input": [...],
  "error": {
    "message": "测试失败: 3/12 tests failing",
    "type": "agent_error",
    "retry": 1
  }
}
```

| error.type | 说明 |
|-----------|------|
| `agent_error` | Agent 执行异常，可自动重试 |
| `test_failure` | 测试未通过，需用户修复 |
| `dependency_failure` | 前置节点失败导致 |
| `user_abort` | 用户手动中断 |

## /opc-status 展示

读取 state.json，展示：

```
管线: user-auth (pipeline-20260530-001)
状态: in_progress

02-planning  ✓ (2/2 nodes)
  api-design         ✓  backend-engineer
  database-schema    ✓  database-engineer

04-implementation  ⟳ (1/4 nodes)
  backend-endpoint   ✓  backend-engineer
  tdd-implementation ⟳  backend-engineer     ← 当前
  auth-integration   ○  (等待 backend-endpoint)
  security-review    ○  (等待 tdd-implementation)

05-testing  ○
```
