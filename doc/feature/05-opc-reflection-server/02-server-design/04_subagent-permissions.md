# 04 — Sub-Agent 权限白名单

> 本章定义每个 reflection sub-agent 的 `tools` 白名单、禁止的操作、
> 双保险机制（Host enforce + OPC server 二次拒绝）、反例与违规处理。

## 一、权限模型

### 1.1 三层防御

```
┌─────────────────────────────────────────┐
│ Layer 1: Host (Claude Code)             │
│ Task spawn 时从工具列表裁剪              │
│ 未白名单工具 → "No such tool available"  │
│ ✅ V3/V4 PoC 已验证                      │
├─────────────────────────────────────────┤
│ Layer 2: OPC Server (role check)        │
│ 按 dispatch_context.role 拒绝写入        │
│ 即使 Layer 1 被绕过也能拦截              │
├─────────────────────────────────────────┤
│ Layer 3: Kit Validation (opc-kit validate)│
│ 安装时校验 agent.md 的 tools 字段        │
│ reflection agent 含写工具 → 安装失败     │
└─────────────────────────────────────────┘
```

### 1.2 核心原则

**所有 reflection sub-agent 只读、禁写**。
唯一例外：distiller 可写 corrections（`opc_corrections({action:"record"})`），
但仍禁写 knowledge。

## 二、Sub-Agent 类型与权限

### 2.1 Critic（M4 Critique）

```yaml
name: critic
description: 独立质疑 sub-agent，审查输出并列出 objection
tools:
  - Read          # 读取项目文件
  - Grep          # 搜索代码
  - Glob          # 查找文件
  - WebFetch      # 查阅文档
  - WebSearch     # 搜索信息
  - opc_knowledge_open     # 初始化 knowledge 读取
  - opc_knowledge_read     # 读取 knowledge（single/batch/list/search）
  - opc_corrections        # 查询纠正库（query only, server 端禁止 write）
```

**禁止**：`Write`, `Edit`, `Bash`, `opc_knowledge_write`, `opc_knowledge_admin`（delete）

**Server 端角色**：`reflection_sub_agent`

### 2.2 Debater（M5 Debate）

```yaml
name: debater
description: 多立场辩论 sub-agent，持正方/反方/第三方立场
tools:
  - Read
  - Grep
  - Glob
  - WebFetch
  - WebSearch
  - opc_knowledge_open
  - opc_knowledge_read
  - opc_corrections
```

与 critic 完全相同的工具集。debate 可能需要查更多 knowledge 来支撑论点。

### 2.3 CoVe Verifier（M3 CoVe）

```yaml
name: cove-verifier
description: Chain-of-Verification sub-agent，拆断言逐条验证
tools:
  - Read
  - Grep
  - Glob
  - WebFetch
  - WebSearch
  - opc_knowledge_open
  - opc_knowledge_read
  - opc_corrections
```

与 critic 相同。CoVe 的验证问题可能需要查 knowledge 和代码。

### 2.4 ToT Explorer（M6 ToT）

```yaml
name: tot-explorer
description: Tree-of-Thoughts 搜索 sub-agent，生成候选方案并评估剪枝
tools:
  - Read
  - Grep
  - Glob
  - WebFetch
  - WebSearch
  - opc_knowledge_open
  - opc_knowledge_read
  - opc_corrections
```

与 critic 相同。ToT 搜索方案时需要读 knowledge 了解项目上下文。

### 2.5 Distiller（pipeline 结束归档）

```yaml
name: distiller
description: L1→L2 提炼 sub-agent，读取用户介入记录并写纠正条目
tools:
  - Read
  - Grep
  - Glob
  - opc_knowledge_open
  - opc_knowledge_read
  - opc_corrections    # 含 query + record（写 corrections，不写 knowledge）
```

**Server 端角色**：`distiller_sub_agent`

**额外权限**：`opc_corrections({action:"record"})` — 写 corrections（不写 knowledge）

**禁止**：`Write`, `Edit`, `Bash`, `WebFetch`, `WebSearch`, `opc_knowledge_write`

### 2.6 Meta-Reflection Synthesizer

```yaml
name: meta-synthesizer
description: Pipeline 级 meta-reflection，汇总方法表现并建议优化
tools:
  - Read
  - opc_knowledge_read
  - opc_corrections       # query only
  - opc_reflect_admin     # query_stats only (R/O, server 端控制)
```

**Server 端角色**：`meta_synthesizer`

**禁止**：所有写工具，`Bash`, `WebFetch`, `WebSearch`

## 三、工具边界矩阵

| 工具 | Critic | Debater | CoVe | ToT | Distiller | Meta-Synth |
|---|---|---|---|---|---|---|
| `Read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Grep` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `Glob` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `WebFetch` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `WebSearch` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `opc_knowledge_open` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `opc_knowledge_read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `opc_knowledge_write` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `opc_knowledge_admin` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `opc_corrections(query)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `opc_corrections(record)` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `opc_reflect_admin(query_stats)` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## 四、Server 端 Role Check

### 4.1 角色枚举

```typescript
type SubAgentRole =
  | 'reflection_sub_agent'   // critic, debater, cove-verifier, tot-explorer
  | 'distiller_sub_agent'    // distiller
  | 'meta_synthesizer'       // meta-reflection synthesizer
```

### 4.2 拒绝逻辑

```typescript
// 所有写类 OPC 工具入口
function checkWritePermission(tool: string, role: SubAgentRole): void {
  if (role === 'reflection_sub_agent') {
    if (WRITE_TOOLS.includes(tool)) {
      throw new Error(`reflection agents are read-only; ${tool} rejected`)
    }
  }
  if (role === 'distiller_sub_agent') {
    if (tool === 'opc_knowledge_write' || tool === 'opc_knowledge_admin') {
      throw new Error(`distiller cannot write knowledge; ${tool} rejected`)
    }
  }
  if (role === 'meta_synthesizer') {
    if (WRITE_TOOLS.includes(tool)) {
      throw new Error(`meta-synthesizer is read-only; ${tool} rejected`)
    }
  }
}
```

### 4.3 Dispatch Context 传递

task agent 在 `opc_node_start` 时获得 `dispatch_context`，其中包含 `role`：

```json
{
  "dispatch_context": {
    "role": "reflection_sub_agent",
    "pipeline_id": "pl-xxx",
    "step": "P5",
    "method": "M4-critique"
  }
}
```

此 context 在 sub-agent 调 OPC 工具时由 server 校验。
host agent 和 task agent 的 role 为 `null`（不受限制）。

## 五、反例与违规处理

### 5.1 常见反例

| 反例 | 为什么错 | 正确做法 |
|---|---|---|
| critic 的 tools 含 `Write` | 反思 agent 可能误改代码 | 移除 `Write`，critic 只需 Read + Grep |
| debater 的 tools 含 `Bash` | 辩论 agent 可能执行任意命令 | 移除 `Bash`，debate 不涉及执行 |
| distiller 的 tools 含 `opc_knowledge_write` | distiller 只写 corrections 不写 knowledge | 移除 knowledge write，只保留 corrections |
| meta-synthesizer 含 `WebFetch` | meta-reflection 不需要查外部文档 | 移除网络工具 |

### 5.2 Kit 校验拦截

`opc-kit validate` 检查每个 agent.md 的 tools：

```
对 reflection/ 目录下的 agent:
    检查 tools 不含: Write, Edit, Bash, opc_knowledge_write, opc_knowledge_admin
    → 含任一 → 报错，阻止安装
```

### 5.3 运行时违规

若 Layer 1 和 Layer 3 都被绕过（kit 配错 + Host 未 enforce），
Layer 2（OPC server role check）在运行时拒绝写入并记录 audit log：

```json
{
  "ts": "2026-06-11T10:00:00Z",
  "event": "write_rejected_by_role",
  "tool": "opc_knowledge_write",
  "role": "reflection_sub_agent",
  "sub_agent_id": "critic-01HXY8",
  "session_id": "sess-abc"
}
```

连续 3 次同 session 违规 → `_warnings` 中增加 `INTEGRITY_WARNING`。

## 六、与 Task Agent 的权限对比

| 维度 | Task Agent (dev/design/qa) | Reflection Agent |
|---|---|---|
| 目录 | `agents/dev/`, `agents/design/`, `agents/qa/` | `agents/reflection/` |
| 写权限 | ✅ Write, Edit, Bash, opc_knowledge_write | ❌ 全部禁止 |
| corrections 写 | ✅ opc_corrections({action:"record"}) | ❌ (distiller 除外) |
| 网络 | ✅ WebFetch, WebSearch | ✅ (distiller 除外) |
| 派发方式 | `opc_node_start` → Task spawn | `opc_reflect_execute` → Task spawn |
| dispatch_context.role | `null` (不受限) | `reflection_sub_agent` 等（受限） |

## 七、相关文档

- [00 Server 设计总览](./00_overview.md) — Sub-Agent 权限白名单总述 + PoC 验证
- [01 工具规范](./01_tool-specs.md) — 各工具的参数定义
- [06-host-contract/00_overview.md](../../06-host-contract/00_overview.md) — C4 `tools` enforce 的 Host 行为验证
- [06-host-contract/03_kit-agent-conventions.md](../../06-host-contract/03_kit-agent-conventions.md) — agent.md 的 tools 字段规范
- [父文档](../00_index.md) — reflection-server 总索引
