# Hook 与混合架构

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 一、触发机制

opc 插件**不**在 `plugin.json` 里声明 hook——hook 是 `/opc init` 按项目装进 `<project>/.claude/settings.json` 的（指向 `<project>/.opc/bin/opc-hook.sh` 本地副本），所以只在显式 opt-in 过的项目里触发，从不在全局生效。hook 的唯一职责是把每一条非 slash 消息引导进 `opc_flow_query`；**在已 init 的项目里它对消息内容不做关键词/语义过滤**——意图分流的判断全部由 `opc_flow_query` 返回的 `suggested_actions` + Claude 完成，所有事实查询由 `opc_flow_query` 完成（含 pid 存活校验）。

`plugin.json` 只声明 MCP servers（state / knowledge / reflection）：

```json
// src/plugins/opc/.claude-plugin/plugin.json
{
  "name": "opc",
  "mcpServers": {
    "opc-state-server":     { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/opc-state-server/dist/server.js"] },
    "opc-knowledge-server": { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/opc-knowledge-server/dist/mcp-server.js"] },
    "opc-reflection-server":{ "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/opc-reflection-server/dist/mcp-server.js"] }
  }
}
```

hook 注册（由 `/opc init` 写入 `<project>/.claude/settings.json`）：

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.opc/bin/opc-hook.sh" }]
    }]
  }
}
```

### 1.1 设计原则

- **Hook 引导化**：在已 init 项目里对每条非 slash 消息无条件注入一行引导，不读文件、不拼快照、不做意图判断
- **事实查询统一入口**：`opc_flow_query` 是流程状态的唯一事实源，返回快照 + methodology + suggested_actions
- **决策权归 Claude**：query 提供候选清单，最终走哪条路由由 LLM 判断
- **工具内部强制校验**：`opc_flow_lifecycle({action:"start"})` / `opc_flow_*` 都内置 pid + status 校验，即使 Claude 误判也能被工具拒绝
- **owner.pid 是真实状态判据**：与 `pipeline-plan.json` 的 owner 字段对齐，支持跨 session 孤儿检测

### 1.2 Session 启动

无需独立的 SessionStart hook。当用户首次发消息时，UserPromptSubmit hook 触发 `opc_flow_query`，query 会同时扫描 `.opc/pipelines/*/pipeline-plan.json` 找孤儿管线一并返回。

### 1.3 session_id 来源

`opc_flow_query` 与所有 flow 工具读写 `.opc/sessions/<session_id>/flow-state.json`。session_id 由 **Claude Code pid + 启动时间戳** 派生：

```
session_id = "sess-" + <claude_code_pid> + "-" + <started_at_unix_ts>
例: sess-12345-1717840000
```

**pid 取得方式**（stdio MCP 模式）：MCP server 启动时取 `process.ppid` 即等于 Claude Code 进程 pid（server 是 Host 通过 stdio 启动的子进程）。

**为什么带 ts**：pid 会被系统复用，单纯 pid 在旧 session 残留时可能撞车；附加 unix ts 后撞车概率近 0。

**owner.pid 探活**：跨 session 恢复时（旧 Claude Code 崩溃 / 关 terminal 重开）用 `kill(owner.pid, 0)` 探活，dead → 列入 orphan 建议 `opc_flow_lifecycle({action:"recover"})`；alive 但非当前 pid → 另一活跃实例，跳过。详见 [06-host-contract/00_overview.md 2.1–2.3](../../06-host-contract/00_overview.md#21-c1session_id-派生规则)。

> **HTTP/SSE 模式 fallback**：MCP server 不在 Claude Code 的进程子树中时 `process.ppid` 失效，由 Claude 在首次调 `opc_flow_query()` 时显式传 `{claude_pid, claude_started_at}` 参数。详见 [06-host-contract/00_overview.md 2.3 C2](../../06-host-contract/00_overview.md#23-c2mcp-server-拿到-claude-code-pid)。

---

## 二、混合架构：MCP 流程状态机 + 文档方法论

### 2.1 双层职责

| 层 | 角色 | 内容 |
|----|------|------|
| **MCP 流程状态机** (opc-state-server) | 流程路由：告诉 Claude **当前做什么、下一步调什么工具** | 确定性 TS 代码，无 LLM |
| **Pipeline 文档** (`prompts/*.md`) | 方法论参考：解释**为什么这么分、阈值/维度/权重** | Markdown，AI 可解释性 |

Claude 在每一步：
- **必读**：MCP 工具返回里的 `step_instruction`（几十字，告诉做什么）+ `schema`（输出格式）
- **选读**：返回里的 `methodology.docs` + `methodology.ref` 指向的文档章节（复杂边界场景时查阅完整方法论）

### 2.2 工具返回值统一格式

```typescript
type FlowResponse = {
  step: string;                      // 当前所处步骤标识
  step_instruction: string;          // 一句话告诉 Claude 这一步做什么
  methodology?: {                    // 方法论参考（按需读取）
    docs: string[];                  //   文档路径
    ref: string;                     //   章节定位
    summary: string;                 //   一行摘要，足以应付简单场景
  };
  schema?: JSONSchema;               // Claude 输出的产出格式
  prerequisites?: Array<{            // 调 next 之前必须先调的工具
    tool: string;
    args?: object;
    why?: string;
  }>;
  next?: {                           // 下一步该调的工具
    tool: string;
    args?: object;                   //   预填参数
    when?: string;                   //   触发条件
  };
  done?: boolean;                    // 流程结束（chat / question 走这条）
  action?: string;                   // 终端动作（如 "respond_normally"）
  flow_state_path: string;           // 当前流程状态文件路径（可观测性）
};
```

### 2.3 文档归属

```
src/mcp/opc-state-server/
├── src/
│   └── server.ts / flow-server.ts / phase-server.ts / node-server.ts ...
├── prompts/                        ← 方法论文档（MCP 在返回里引用路径，Claude 按需 Read）
│   ├── 01_intent-analysis-overview.md   无流程时的意图判断
│   ├── 06_in-flow-decision.md           有活跃流程时的延续/纠正/补充判断
│   ├── 02_task-analysis.md
│   ├── 03_task-decomposition.md
│   ├── 04_brief-generation.md
│   ├── 05_phase-execution.md
│   ├── 07_recovery.md                   孤儿流程恢复策略
│   ├── 10_state-machine.md              每个 F 工具的 expected_steps 路由表
│   ├── 09_reflection-task-analysis.md
│   └── 08_reflection-node-selection.md
├── phases/                         ← 9 阶段定义（首次启动 bootstrap 进 .opc/phases/）
├── scenarios/                      ← 场景配方
└── src/                            ← 流程状态机实现（扁平结构）
    ├── flow-server.ts              ←   flow 工具 + .opc/sessions/<id>/flow-state.json + pid 校验
    ├── pipeline-server.ts          ←   pipeline_create / status / lifecycle
    ├── phase-server.ts             ←   phase_start / confirm / complete
    ├── node-server.ts              ←   node_start / finish + 节点选择
    └── owner-manager / orphan-scanner / kit-health ...
```

```
src/plugins/opc/                    ← 插件
├── .claude-plugin/plugin.json     ←   仅 MCP servers 声明（hook 不在此注册）
├── bin/opc-hook.sh                ←   hook 脚本源；/opc init 复制到 <project>/.opc/bin/ 本地副本
└── scenarios/                     ←   场景配方（add-feature.md / fix-bug.md / ...）
```

---

## hook 脚本行为

hook 脚本（`bin/opc-hook.sh`）是 `/opc init` 复制到 `<project>/.opc/bin/` 的本地副本，`settings.json` 通过 `${CLAUDE_PROJECT_DIR}/.opc/bin/opc-hook.sh` 指向它。它在已 init 项目里对每条非 slash 消息**无条件注入**引导提示，决策树如下：

```
1. OPC_HOOK_INTENSITY=off          → 静默（用户可整体关掉）
2. 消息以 / 开头（slash 命令）       → 静默（避免干扰 /opc-status 等）
3. OPC_HOOK_INTENSITY=loud         → 注入
4. 项目存在 .opc/.project-init 标记  → 注入（已 opt-in，无条件进 opc_flow_query）
5. 否则（未 init 项目，仅旧式 quiet 回退）：
     · 消息命中触发关键词（实现/修复/重构/...） → 注入
     · .opc/sessions/ 下有 in_progress 流程      → 注入
     · 都不满足                                   → 静默
```

**第 4 步是已 init 项目的实际路径**——命中它即注入，跳过第 5 步的关键词扫描。第 5 步的关键词/活跃流程检查是给「装了 hook 副本但尚未 `/opc init`、或想保留轻量触发」场景的回退通道，对正常 init 项目不生效。

```bash
# src/plugins/opc/bin/opc-hook.sh （节选）
readonly INTENSITY="${OPC_HOOK_INTENSITY:-quiet}"

# off → 静默；slash 前缀 → 静默（所有强度都适用）
[ "$INTENSITY" = off ] && silent
case "$MSG" in /*) silent ;; esac

# loud → 无条件注入
[ "$INTENSITY" = loud ] && emit

# 已 /opc init 的项目：对每条非 slash 消息无条件引导进 opc_flow_query
[ -f "${PROJECT_DIR}/.opc/.project-init" ] && emit

# 未 init 回退：关键词 OR 活跃流程
printf '%s' "$scan_buf" | grep -iqE "$combined" && emit
grep -lE '"status"[[:space:]]*:[[:space:]]*"in_progress"' \
     "${sessions_dir}"/*/flow-state.json 2>/dev/null | grep -q . && emit
silent
```

设计原则：**hook 永远不做意图判断**——已 init 项目连关键词过滤都不做，只做工程过滤（slash 前缀、`off` 开关、超长消息截断）。意图分流的判断全部由 `opc_flow_query` 返回的 `suggested_actions` + Claude 完成。
