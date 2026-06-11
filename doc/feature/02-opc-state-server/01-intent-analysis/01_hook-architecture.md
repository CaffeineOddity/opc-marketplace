# Hook 与混合架构

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 一、触发机制

opc-orchestrator 插件通过 `UserPromptSubmit` hook 注入一行**事实查询**指令——hook 不做语义判断，只让 Claude 知道"先查流程状态再决策"。所有判断逻辑由 Claude 完成，所有事实查询由 `opc_flow_query` 工具完成（含 pid 存活校验）。

```json
// opc-orchestrator/.claude-plugin/plugin.json
{
  "name": "opc-orchestrator",
  "depends": ["mcp"],
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "echo 'OPC: 先调 mcp__opc-state__opc_flow_query() 了解当前流程状态，再按返回的 suggested_actions 决定下一步（启动/延续/纠正/补充/回退/放弃/暂停/无关）。'"
        }]
      }
    ]
  }
}
```

### 1.1 设计原则

- **Hook 极简化**：永远只输出一行提示，不读文件、不拼快照、不做判断
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
platform/mcp/opc-state-server/
├── server.ts
├── prompts/                        ← 方法论文档（MCP 在返回里引用路径，Claude 按需 Read）
│   ├── 01_intent-analysis-overview.md             无流程时的意图判断
│   ├── in-flow-decision.md            有活跃流程时的延续/纠正/补充判断
│   ├── task-analysis.md
│   ├── task-decomposition.md
│   ├── brief-generation.md
│   ├── phase-execution.md
│   ├── recovery.md                    孤儿流程恢复策略
│   ├── state-machine.md               每个 F 工具的 expected_steps 路由表
│   ├── reflection-task-analysis.md
│   └── reflection-node-selection.md
├── flow/                           ← 流程状态机
│   ├── flow-router.ts              ←   路由决策（按 evidence + V1-V5 + meta-validator + intent + current_step 分支）
│   ├── flow-state-store.ts         ←   .opc/sessions/<id>/flow-state.json 读写 + pid 校验
│   └── owner-manager.ts            ←   owner pid 接管 + 心跳 + 孤儿检测
└── tools/
    ├── flow.ts                     ← 7 个流程工具
    ├── pipeline.ts
    ├── phase.ts
    └── node.ts
```

```
platform/opc-orchestrator/         ← 极简插件
├── .claude-plugin/plugin.json     ←   仅 UserPromptSubmit hook 配置
├── bin/opc-hook.sh                ←   hook 脚本（可选，简单场景直接用内联 echo）
└── scenarios/                     ←   场景配方（add-feature.md / fix-bug.md / ...）
```

---

## 高级形态：Hook 脚本

简单场景直接用 `plugin.json` 里的内联 echo（见上文）。如需在大型仓库或多 session 环境给 Claude 更多上下文（如展示 quick-history 最近记录），可改用 `bin/opc-hook.sh`：

```bash
#!/bin/bash
# platform/opc-orchestrator/bin/opc-hook.sh
# 极简版：仅做 slash 命令过滤 + 输出标准提示

# 用户 message 以 / 开头视为 slash 命令，跳过注入（避免干扰 /opc-status 等）
if echo "${CLAUDE_USER_MESSAGE:-}" | head -c 1 | grep -q '^/'; then
  exit 0
fi

cat <<'EOF'
OPC: 先调 mcp__opc-state__opc_flow_query() 了解当前流程状态，再按返回的 suggested_actions 决定下一步（启动/延续/纠正/补充/回退/放弃/暂停/无关）。
EOF
```

设计原则：**hook 永远不做语义判断，最多做工程过滤**（如 slash 前缀、超长消息截断）。所有事实查询和状态判断都由 `opc_flow_query` 工具 + Claude 完成。
