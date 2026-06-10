# 02 — Sub-Agent 降级方案

> 本章定义 C3（sub-agent MCP 连接继承）和 C4（`tools` 白名单 enforce）
> 的工程降级方案。**当前 C3/C4 已通过 PoC 验证（2026-06-10），
> 降级方案作为 Host 行为变更时的备用预案，v1 不激活。**

## 一、降级触发条件

| 契约点 | 正常行为（已验证） | 触发降级的条件 |
|---|---|---|
| C3 MCP 继承 | Task spawn 的 sub-agent 继承父 conversation 的全部 MCP 连接 | Claude Code 未来版本变更 Task 工具的 MCP 继承行为 |
| C4 白名单 | Host 在 Task spawn 时从工具列表裁剪，未白名单工具不可见 | Claude Code 未来版本弱化 `tools` 字段的 enforce 力度 |

两者均为"未来可能变"的防御性预案，非当前问题。

## 二、C3 降级：代理模式

### 2.1 问题

若 sub-agent 不再继承 MCP 连接，critic/debater/ToT explorer 无法调
`opc_knowledge_read` 和 `opc_corrections({action:"query"})` 验证 artifact。

### 2.2 代理模式方案

```
正常路径（C3 有效）:
    Host → Task(sub-agent) → sub-agent 调 opc_knowledge_read → 直接返回

代理路径（C3 失效）:
    Host → Task(sub-agent) → sub-agent 输出 knowledge_query 请求
    Host 读取 sub-agent 输出 → Host 调 opc_knowledge_read → 结果注入到 sub-agent 的下一轮 prompt
```

### 2.3 实现

Host 在派发 sub-agent 前注入一段代理指令：

```
注意：你无法直接调用 OPC MCP 工具。如需查询 knowledge 或 corrections，
请在输出中以以下格式提出请求：

---knowledge_query---
{
  "mode": "single" | "search",
  "query": "..."
}
---end---

Host 会在下一轮对话中将查询结果注入你的 prompt。
```

### 2.4 代价

- 交互轮次翻倍（sub-agent 每轮查询需 Host 往返一次）
- sub-agent 失去自主决定查询内容的灵活性（需预先声明需求）
- 对 debate sub-agent 尤其糟糕（多轮辩论 × 代理往返 = 延迟爆炸）

### 2.5 激活条件

`.opc/config.json` 中显式配置：

```json
{
  "host_contract": {
    "subagent_mode": "proxy"
  }
}
```

不配置时默认走直连模式（当前已验证的行为）。

## 三、C4 降级：延迟写入

### 3.1 问题

若 `tools` 白名单不再被 Host 强制 enforce，sub-agent 可能误调写工具
（如 `opc_knowledge_write`），污染 knowledge 库。

### 3.2 OPC Server 端兜底（双保险）

OPC server 在 C4 已验证的基础上仍保留 server 端校验作为第二道防线。
每个工具调用时，server 检查 `dispatch_context.role`：

```
所有写类工具入口:
    if (dispatch_context.role === "reflection_sub_agent") {
        return reject("reflection agents are read-only")
    }
```

此校验不依赖 Host 行为，只要 server 端逻辑正确就有效。

### 3.3 若 Server 端兜底也失效

极端场景（OPC server bug / 配置错误导致角色校验被绕过）：

1. 所有 sub-agent 的写操作记录到 audit log
2. `opc_reflect_admin({action:"query_stats"})` 暴露异常的写入比例
3. 用户可通过 `opc_corrections({action:"unlearn"})` 回滚污染条目
4. knowledge 写入污染可通过 `opc_knowledge_admin({action:"delete"})` + 重写修复

### 3.4 检测

`opc_flow_query()` 在每次调用时检查 sub-agent 写入的 artifact 异常：

- 若 `reflection_log` 中某 sub-agent 产出了非预期的写操作 → 标记 `integrity_warning`
- 若同一 session 内出现 3 次 `integrity_warning` → 建议用户检查 kit 配置

## 四、两者同时失效

若 C3 + C4 同时失效（sub-agent 既无 MCP 连接，又能调写工具），
退化为"人工审查"模式：

```
反思流程退化:
    1. opc_reflect_plan 仍正常返回 method + enhanced_prompt
    2. opc_reflect_execute 返回 agent_spec（但不 spawn sub-agent）
    3. Host 自行评估 artifact（不派 sub-agent）
    4. opc_reflect_complete 仍跑 meta-validator（纯 TS，不依赖 sub-agent）
    5. 最终降级到 validator-only + ask_user
```

此时反思质量等价于 intensity=off（仅 validator），但不会卡住 pipeline。

## 五、降级检测与告警

### 5.1 自动检测

`opc_flow_query()` 在 session 启动时执行一次快速检测：

```
probe_C3:
    ① spawn 一个极轻 probe sub-agent（tools: [opc_knowledge_read({mode:"list"})]）
    ② probe sub-agent 尝试调 opc_knowledge_read({mode:"list", path:"/"})
    ③ 若返回文件列表 → C3 正常
    ④ 若 sub-agent 报 "No such tool" → C3 可能失效（但需排除 probe agent 自身配置问题）

probe_C4:
    ① spawn 一个 probe sub-agent（tools: []，不声明任何工具）
    ② probe sub-agent 尝试调 opc_knowledge_read({mode:"list", path:"/"})
    ③ 若返回 "No such tool available" → C4 正常（未白名单工具不可见）
    ④ 若调用成功 → C4 失效（严重：白名单被绕过）
```

### 5.2 告警输出

检测结果写入 `_warnings`：

```json
{
  "_warnings": [{
    "level": "warning",
    "code": "C3_DEGRADED",
    "message": "Sub-agent MCP inheritance may not be working. Reflection sub-agents will use proxy mode.",
    "detected_by": "probe_C3",
    "recommendation": "Check Claude Code version changelog for Task tool behavior changes."
  }]
}
```

## 六、降级状态的持久化

检测结果写入 session 的 `flow-state.json`：

```json
{
  "host_contract_status": {
    "C3_mcp_inheritance": "active",
    "C4_tools_enforcement": "active",
    "detected_at": "2026-06-11T00:00:00Z",
    "probe_session_id": "sess-xxx"
  }
}
```

后续 `opc_reflect_plan` 根据此状态自动切换路径（直连 vs 代理）。

## 七、相关文档

- [00 Host 契约总览](./00_overview.md) — C3/C4 的完整定义与验证结果
- [03 Kit-Agent 约定](./03_kit-agent-conventions.md) — `tools` 字段强制规范
- [05-opc-reflection-server/02-server-design](../05-opc-reflection-server/02-server-design/00_overview.md) — sub-agent 权限白名单
- [01 Validation Log](./01_validation-log.md) — V1-V7 PoC 验证结果
