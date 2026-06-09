# 06 Host 契约（Claude Code MCP Host 行为约束）

> 本章定义 OPC 对 **Claude Code（MCP Host）** 的所有运行时假设。任何依赖 Host 私有实现的设计点都收敛到这里，由本章作为单一真相源，其他章节通过指针引用。
>
> **核心立场**：OPC 三个 MCP server 是纯 TS 确定性逻辑，对 Host 的依赖必须**显式列出 + 可验证 + 有降级**，不能埋在散落的设计文档里。

---

## 一、需求

### 1.1 为什么需要这一章

| 历史问题 | 后果 |
|---|---|
| `session_id` 的来源散落在 `01-intent-analysis/01_hook-architecture.md` 的三段式（env / PPID / default），未说明每段在什么 Host 行为下成立 | 实施时无法判断该走哪段 |
| `Task` 工具 spawn 的 sub-agent 是否继承 MCP 连接、是否能 enforce `allowed_tools`，整个反思架构都建在这个假设上但从未明确 | 反思 sub-agent 的权限白名单（`02-server-design/00_overview.md 五`）可能根本无法落地 |
| `UserPromptSubmit` hook 注入"先调 opc_flow_query" vs Claude 默认行为的优先级 | 用户问"你好"也要绕一圈 query，性价比可疑 |
| `opc_node_start.dispatch_instruction` 把 `dispatch_context` 传给 sub-agent 的机制，Host 端是 Task 工具 prompt 拼接还是别的 | sub-agent 调 `opc_knowledge_write` 时能否带上正确的 metadata，决定了产物可追溯性 |

### 1.2 本章覆盖的 5 个契约点

| # | 契约点 | 决议 |
|---|---|---|
| C1 | session_id 来源 | pid 派生：`session_id = "sess-" + <claude_code_pid> + "-" + <unix_ts>` |
| C2 | MCP server 拿到 Claude Code pid 的方式 | stdio 模式用 `process.ppid`；HTTP/SSE 模式由 Claude 在首次 `opc_flow_query` 时传 `claude_pid` 参数 |
| C3 | sub-agent 与 MCP server 的连接继承 | 假设 Task spawn 的 sub-agent **继承** 父 conversation 的所有 MCP 连接；如不继承则降级到主进程逐工具代理 |
| C4 | `allowed_tools` 白名单的 enforce 责任 | 由 Host 在 Task spawn 时强制；OPC server 不做二次校验（信任 Host），但工具内部仍按角色拒绝越权写（双保险） |
| C5 | Hook 注入与 Claude 默认行为的冲突解决 | UserPromptSubmit 只对**非 `/` 前缀**消息生效；提供 `OPC_HOOK_INTENSITY=quiet\|loud` 让用户调档 |

### 1.3 非目标

- **不**包含 Claude Code 内部实现细节（这是 Host 的事）
- **不**保证跨主机/分布式恢复（OPC 假设单机单用户）
- **不**支持多个 Claude Code 实例同时写同一项目目录（owner.pid 探活只解决"前一个进程死了"，不解决"两个进程都活着"）

---

## 二、方案

### 2.1 C1：session_id 派生规则

```
session_id 格式: "sess-" + <claude_code_pid> + "-" + <started_at_unix_ts>
例: sess-12345-1717840000

文件布局:
  .opc/sessions/sess-12345-1717840000/
    flow-state.json
      owner.pid          = 12345
      owner.started_at   = "2026-06-08T10:00:00Z"
```

**性质**：
| 字段 | 取值 | 不变量 |
|---|---|---|
| `<claude_code_pid>` | Claude Code 进程 pid | 进程存活期内不变 |
| `<started_at_unix_ts>` | session 首次创建时间（秒级 unix ts） | 永久不变 |
| `session_id` | 上述拼接 | 同一 Claude Code 实例同一项目目录下唯一；崩溃重启后的新 session_id 不同 |

**为什么带 ts**：单纯用 pid 不够——同一台机器上 pid 会被复用，旧 session 残留时新 Claude Code 实例可能撞 pid，加 ts 后撞车概率近 0。

### 2.2 C1 配套：恢复时如何处理 orphan session

```
opc_flow_query() 内部:
  ① 计算 current_session_id = derive(process.ppid 或入参 claude_pid, now)
  ② 扫 .opc/sessions/sess-*/flow-state.json
  ③ 对每个 status=in_progress 的 session:
     ├── owner.pid == current_pid → 视为当前 session（活跃 case）
     ├── kill(owner.pid, 0) 成功（进程存活）→ 跳过（另一活跃 Claude Code 实例）
     └── kill(owner.pid, 0) 失败（进程已死）→ 标记 orphan，列入 suggested_actions
  ④ 当前进程若无活跃 session → 启动时按 current_session_id 新建目录

opc_flow_recover(orphan_session_id) 内部:
  ① 校验 orphan_session_id 对应目录 owner.pid 已死
  ② 把该目录的 flow-state.json.owner 改成 current_session_id 的 owner
  ③ session_id 字段保持原值（便于历史追溯），仅 owner 更新
  ④ 返回 resume_step + resume_pointer
```

**关键点**：恢复 = **接管原目录的 owner**，不改 `session_id`。历史 `reflection_log` / `user_interventions` 在原目录里完整保留，便于 distiller 提炼。

### 2.3 C2：MCP server 拿到 Claude Code pid

| 模式 | 取 pid 方式 | fallback |
|---|---|---|
| **stdio**（默认） | `process.ppid` —— MCP server 是 Claude Code 通过 stdio 启动的子进程，父进程就是 Claude Code | 无需 fallback |
| **HTTP / SSE**（远程/容器） | Claude 在首次调 `opc_flow_query()` 时显式传入 `{claude_pid: number, claude_started_at: number}` 参数 | 若未传 → server 用自身 `process.pid + uptime` 派生临时 id 并 warning |

**实现要点**：
- stdio 模式下 `opc_flow_query()` **不接受** `claude_pid` 入参（防止 Claude 误传），server 一律用 `process.ppid`
- 模式判断由 server 启动时的 `MCP_TRANSPORT` 环境变量决定（`stdio` / `http` / `sse`）
- Host contract 文档（本章）建议 marketplace 默认只支持 stdio；HTTP/SSE 作为高级用户配置

### 2.4 C3：sub-agent 的 MCP 连接继承

**假设**（待 Claude Code 团队官方确认）：

> Claude Code 的 `Task` 工具 spawn 的 sub-agent **完全继承父 conversation 的 MCP server 连接**，包括所有已注册的工具（按 `subagent_type` 在 kit 的 `agents/*.md` 中声明的 `allowed_tools` 过滤）。

**基于该假设的设计**：
- task sub-agent（如 `backend-engineer`）能直接调 `opc_knowledge_get_batch` / `opc_knowledge_write`
- reflection sub-agent（如 `critic`）能直接调 `opc_corrections_query` / `opc_knowledge_get`（只读子集）

**若假设不成立的降级方案**（fallback plan，写到工程实现里）：
1. **代理模式**：主进程 Claude 在 sub-agent 完成前持有所有 MCP 调用。sub-agent 通过 Task 工具的"中间响应通道"（output streaming）发出 RPC 请求，主进程代为执行 MCP 调用并回灌结果。
2. **延迟写入模式**：sub-agent 把所有写请求积累成 `evidence.deferred_writes[]`，主进程在 `opc_node_complete` 时统一回放。

**验证手段**：在 PoC 阶段写一个 minimal kit，task agent 调 `opc_knowledge_write`，看是否成功。失败则启动降级方案。

### 2.5 C4：allowed_tools enforce 责任分配

```
                ┌─ Host 强制（最先生效）
allowed_tools ──┤
                └─ OPC server 工具内部按角色拒绝（双保险）
```

**Host 端**（Claude Code 的 Task 工具）：
- 按 `subagent_type` 在 kit `agents/<role>.md` 中的 `allowed_tools` 字段过滤
- sub-agent 调被禁工具时，Host 直接拒绝

**OPC server 端**（双保险）：
- `opc_knowledge_write` 检查调用方 `dispatch_context.role`，若是 `critic`/`debater`/`tot-explorer` 之一直接 reject
- 这层是为了"用户错配了 allowed_tools / Host 漏 enforce"时的兜底
- 实现细节：`dispatch_context` 由 OPC server 在 `opc_node_start` / `opc_reflect_critique` 时写入 `.opc/sessions/<id>/active-dispatches.json`，sub-agent 调写工具时 server 反查

**约束**（写进 kit 规范）：
- 每个 kit 的 `agents/*.md` 必须显式声明 `allowed_tools`（不允许"全开"）
- reflection sub-agent 角色（`critic` / `debater` / `tot-explorer` / `meta-synthesizer`）一律不能出现在 `allowed_tools` 中包含写类工具

### 2.6 C5：Hook 注入策略

| 配置 | 行为 |
|---|---|
| `OPC_HOOK_INTENSITY=loud`（默认） | 每条非 `/` 前缀消息都注入"先调 opc_flow_query" |
| `OPC_HOOK_INTENSITY=quiet` | 仅在以下情况注入：① 检测到关键词（task/实现/修复/重构/...）；② 当前已有 active 流程 |
| `OPC_HOOK_INTENSITY=off` | 完全不注入，Claude 自行决定（适合熟练用户） |

**`/` 前缀豁免**：用户输入以 `/` 开头视为 slash 命令（如 `/opc-status`），hook 跳过注入。

**实现位置**：`platform/opc-orchestrator/bin/opc-hook.sh`（详见 `02-opc-state-server/01-intent-analysis/01_hook-architecture.md 高级形态`）。

---

## 三、验证清单（PoC 阶段必跑）

实施 OPC 前，先用 minimal spike 验证 5 项：

| # | 验证项 | 验证方式 | 失败处理 |
|---|---|---|---|
| V1 | `process.ppid` 在 stdio MCP server 中等于 Claude Code pid | spike 启动时 print ppid，比对 Host 显示的 pid | 失败 → 强制走 HTTP/SSE 模式 + 显式传 `claude_pid` |
| V2 | Task spawn 的 sub-agent 能调父 conversation 注册的 MCP 工具 | spike 内 task agent 调 `opc_knowledge_write` 看是否成功 | 失败 → 启用代理模式或延迟写入模式 |
| V3 | Task `allowed_tools` 白名单被 Host 强制 | spike 让 critic 调 `opc_knowledge_write`，预期被拒 | 失败 → 完全依赖 OPC server 双保险层 |
| V4 | UserPromptSubmit hook 与 system prompt 优先级 | spike 让 hook 注入与 system 冲突的指令，看 Claude 服从哪个 | 失败 → 调整 hook 文本措辞或改用 SessionStart |
| V5 | hook 注入文本是否进入 user message history（影响 token） | 检查 long context 后历史里 hook 文本是否累积 | 累积 → 改用 SessionStart 一次注入约束 + UserPromptSubmit 只做关键词触发 |

每项验证结果记到 `doc/feature/06-host-contract/01_validation-log.md`（PoC 完成后补）。

---

## 四、与其他章节的接缝

| 章节 | 旧表述 | 本章对齐方式 |
|---|---|---|
| `01-overview/03_architecture.md` | 假设 Claude 按 flow_next 推进 | 本章 C4/C5 给出 Host 行为约束的硬约定 |
| `02-opc-state-server/01-intent-analysis/01_hook-architecture.md 1.3 session_id 来源` | env / PPID / default 三段式 | **替换**为本章 C1/C2 的 pid 派生方案；该节后续仅引用本章 |
| `02-opc-state-server/04-node/07_tools.md opc_node_start dispatch_instruction` | 假设 sub-agent 能调 knowledge 工具 | 由本章 C3 假设 + 降级方案兜底 |
| `05-opc-reflection-server/02-server-design/00_overview.md 五 Sub-Agent 权限白名单` | 假设 `allowed_tools` 被 enforce | 由本章 C4 拆分到 Host + OPC 双保险 |
| `02-opc-state-server/01-intent-analysis/01_hook-architecture.md 高级形态` | hook 脚本示例 | 本章 C5 补 `OPC_HOOK_INTENSITY` 配置项规范 |

---

## 五、对外引用规则

其他章节凡涉及 Host 行为假设，**禁止直接描述细节**，必须以指针形式引用本章：

```markdown
# ❌ 反例（不要再写）
session_id 解析顺序：
  1. 环境变量 CLAUDE_SESSION_ID
  2. 否则用进程 PPID
  3. 都不可用 → 写入 .opc/sessions/default/

# ✅ 正例
session_id 由 Claude Code pid + 启动 ts 派生，详见
[06-host-contract/00_overview.md 2.1 C1](../06-host-contract/00_overview.md#21-c1session_id-派生规则)。
```

---

## 六、子文档导航（占位）

| 子文档 | 内容 |
|---|---|
| 01_validation-log.md | PoC 阶段 V1–V5 验证结果记录 |
| 02_subagent-fallback-plans.md | C3 降级方案（代理模式 / 延迟写入）的详细工程规范 |
| 03_kit-agent-conventions.md | 每个 kit 的 `agents/*.md` 必须声明的字段规范（含 `allowed_tools` 强制）|

---

## 七、核心设计原则

- **显式 > 隐式**：所有 Host 假设集中到本章，散落即违规
- **可验证**：5 项验证清单是 PoC 准入门槛
- **有降级**：每个假设必须有 fallback plan
- **单机单用户**：不追求分布式恢复，复杂度收益不匹配
- **双保险**：Host enforce + OPC server 内部校验，任一失效不至于全垮

---

## 八、相关文档

- [01-overview/00_index.md](../01-overview/00_index.md) — 全局架构（已更新指向本章）
- [02-opc-state-server/01-intent-analysis/01_hook-architecture.md](../02-opc-state-server/01-intent-analysis/01_hook-architecture.md) — Hook 实现细节
- [05-opc-reflection-server/02-server-design/00_overview.md](../05-opc-reflection-server/02-server-design/00_overview.md) — sub-agent 权限白名单
- [07-tool-consolidation/00_overview.md](../07-tool-consolidation/00_overview.md) — 工具裁剪规范（解决工具数过多）
