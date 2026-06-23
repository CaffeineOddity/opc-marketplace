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
| **A1**：HTTP/SSE 模式下 `owner.pid` + `kill(pid,0)` 探活失效（pid 在另一台机器上） | 远程部署 / 容器部署的 session 归属与孤儿恢复整体不工作；marketplace 无法官方支持非 stdio 部署 |
| **A2**：V4/V5 未验前 `OPC_HOOK_INTENSITY=loud` 作为默认值不安全（hook 优先级与 token 累积风险都未知） | 短对话被强制走 flow_query，长 session token 可能被悄悄吃掉 |
| **A3**：distiller sub-agent 的提示词模板尚未落地 | L1 → L2 教训沉淀整条链路是空壳，corrections store 永远为空 |
| **A4**：用户装完 kit 后未重启 session 时，链路深处才报 `Agent type not found`，定位成本高 | 安装失败误判 / 用户体验割裂 |

### 1.2 本章覆盖的 6 个契约点

| # | 契约点 | 决议 |
|---|---|---|
| C1 | session_id 来源 | pid 派生：`session_id = "sess-" + <claude_code_pid> + "-" + <unix_ts>` |
| C2 | MCP server 拿到 Claude Code pid 的方式 | stdio 模式用 `process.ppid`；HTTP/SSE 模式走 `Mcp-Session-Id` header + 显式 `claude_pid` 参数，**owner.pid 探活降级为 heartbeat 探活**（详见 2.8） |
| C3 | sub-agent 与 MCP server 的连接继承 | Task spawn 的 sub-agent **完全继承**父 conversation 的 MCP 连接，且命中**父进程的 server 实例**（同 session 内 sub-agent 共享同一 MCP server 进程）— ✅ **已验证**（2026-06-10 PoC，详见 [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md)） |
| C4 | `allowed_tools` 白名单的 enforce 责任 | Host 在 Task spawn 时**直接从工具列表裁剪**（未白名单工具对 sub-agent **不可见**，报错 `No such tool available`，非运行时拒绝）；OPC server 仍按角色做二次校验作为双保险 — ✅ **已验证**（同上，比预期更强） |
| C4-推论 | kit 加载边界 | `.claude/agents/*.md` 与 `.mcp.json` 仅在 Claude Code session **启动时**扫描，运行中安装/更新 kit 不会被发现 — ✅ **已验证** |
| C5 | Hook 注入与 Claude 默认行为的冲突解决 | UserPromptSubmit 只对**非 `/` 前缀**消息生效；提供 `OPC_HOOK_INTENSITY=quiet\|loud\|off` 三档；**v1 默认 quiet**（V4/V5 PoC 通过后再考虑提升） |
| C6 | HTTP/SSE 模式下的 session 归属与孤儿恢复 | `Mcp-Session-Id` header 作为主归属键 + heartbeat ledger 替代 `kill(pid, 0)` 探活；详见 2.8（A1）|

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

opc_flow_lifecycle({action:"recover"})(orphan_session_id) 内部:
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

**已验证契约**（2026-06-10 PoC V1，详见 [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md)）：

> stdio 模式下 MCP server 启动后 `process.ppid` 指向**直接 spawn 该 server 的 claude 进程**，且与该 server 一对一绑定（同生死）。`kill(pid, 0)` 探活语义正确：headless 父 claude 退出后探活立即 ESRCH。

**PoC 关键证据**：
- `report_pid` 工具返回 `server_pid=44010, server_ppid=43990`
- `ps` 链验证 ppid=43990 的 `comm=claude`
- headless session 结束 → `kill -0 43990` 立刻 ESRCH（owner.pid orphan 检测可用）
- 同一 host session 的两条 MCP server 进程 (43187/43617) 各自 ppid 指向不同的 claude 主进程，证实**每个 session 独占一个 server**

**重要 caveat（写入约束，避免实施时踩坑）**：
- `process.ppid` 是 **spawn 该 server 的 claude 进程**，**不是**用户终端里的顶层 claude
- 在 `claude -p` headless 或嵌套 launcher 场景下，ancestor chain 形如 `node → claude(headless) → zsh → claude(host)`，两个 claude pid 不同
- ✅ **正确做法**：owner.pid 用**直接 ppid**（与 server 共生死的那一层）。每个 session 自己派生自己的 session_id，互不交叉
- ❌ **错误做法**：不要 walk chain 去找"真正的顶层 claude"——那样反而会让两个并行 session 错误地共享 owner

**实现要点**：
- stdio 模式下 `opc_flow_query()` **不接受** `claude_pid` 入参（防止 Claude 误传），server 一律用 `process.ppid`
- 模式判断由 server 启动时的 `MCP_TRANSPORT` 环境变量决定（`stdio` / `http` / `sse`）
- Host contract 文档（本章）建议 marketplace 默认只支持 stdio；HTTP/SSE 作为高级用户配置

### 2.4 C3：sub-agent 的 MCP 连接继承

**已验证契约**（2026-06-10 PoC，详见 [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md)）：

> Claude Code 的 `Task` 工具 spawn 的 sub-agent **完全继承父 conversation 的 MCP server 连接**，包括所有已注册的工具（按 `subagent_type` 在 kit 的 `agents/*.md` 中声明的 `tools` 过滤）。
>
> 更强的结论：sub-agent 的 MCP 调用**命中父进程托管的同一个 server 实例**——同一 session 内所有 sub-agent 与主对话**共享**该实例（不是每个 sub-agent 重新 spawn 一个 MCP server 子进程）。这意味着 server 的内存态、文件句柄、文件锁等都是 session 单实例的。

**PoC 关键证据**：
- `poc-v2-writer` sub-agent 调 `mcp__poc-host-contract__poc_echo_write` 返回 `{file_path, server_pid: 43275}`，文件实际写到 `artifacts/proof-1781020775701-jp9l68.txt`
- `server_pid` 与父 `claude -p` 子进程关联，证明 MCP server 由父 session 进程托管

**基于该契约的设计**（不再是"假设"，是确定性依赖）：
- task sub-agent（如 `backend-engineer`）直接调 `opc_knowledge_read({mode:"batch"})` / `opc_knowledge_write`
- reflection sub-agent（如 `critic`）直接调 `opc_corrections({action:"query"})` / `opc_knowledge_read({mode:"single"})`（只读子集）
- 三个 OPC server 可以在内存里维护 per-session 状态（如反思 registry、knowledge index debounce 队列），不必担心 sub-agent 走另一个 server 进程读到陈旧值

**降级方案保留位置**：[02_subagent-fallback-plans.md](02_subagent-fallback-plans.md)（标记为"⚠️ 仅在未来 Claude Code 版本变更行为时启用"，不在 v1 实施）

### 2.5 C4：allowed_tools enforce 责任分配

**已验证契约**（同 C3 PoC）：

> Host（Claude Code 的 Task 工具）按 `subagent_type` 在 kit `agents/<role>.md` 中的 `tools` 字段**直接从工具列表裁剪**。未白名单的工具在 sub-agent 视角下**根本不可见**——sub-agent 尝试调用时报错 `Error: No such tool available: <tool_name>`，而**不是**"工具可见但被拒绝"。

**比预期更强的隔离**：
- "不可见" > "可见但被拒"。即便 critic sub-agent 被 prompt injection 引导去"探测"是否存在某个写工具，从工具列表里就拿不到这个名字
- 因此工具白名单 = **视野白名单**。OPC kit 不需要担心 critic 的 prompt 里偶然提到了某个写工具的名字会被滥用

**PoC 关键证据**：
- `poc-v3-reader.md` frontmatter 只白名单 `mcp__poc-host-contract__poc_echo_read`
- sub-agent 调 read 工具成功（`{echoed:"v3-probe-read", server_pid:43347}`）
- sub-agent 调 write 工具报 `Error: No such tool available: mcp__poc-host-contract__poc_echo_write`
- `artifacts/` 没有新增 v3-probe-write 文件 → 写入确实没发生

```
                ┌─ Host 强制裁剪（最先生效，sub-agent 看不到禁用工具）
allowed_tools ──┤
                └─ OPC server 工具内部按角色拒绝（双保险，防 kit 配错）
```

**OPC server 端双保险**（保留，作为 kit 配置失误的兜底）：
- `opc_knowledge_write` 检查调用方 `dispatch_context.role`，若是 `critic`/`debater`/`tot-explorer` 之一直接 reject
- 实现细节：`dispatch_context` 由 OPC server 在 `opc_node_start` / `opc_reflect_execute({method:"critique"})` 时写入 `.opc/sessions/<id>/active-dispatches.json`，sub-agent 调写工具时 server 反查

**Kit 规范约束**（写进 [03_kit-agent-conventions.md](03_kit-agent-conventions.md)）：
- 每个 kit 的 `agents/*.md` 必须显式声明 `tools`（不允许"全开"）
- reflection sub-agent 角色（`critic` / `debater` / `tot-explorer` / `meta-synthesizer`）一律**不能**在 `tools` 里出现任何写类工具（`opc_knowledge_write` / `opc_knowledge_admin({action:"delete"})` 等）
- 注：上面字段名按 Claude Code 当前规范是 `tools`（不是早期文档里的 `allowed_tools`），kit 模板要对齐

### 2.5.1 C4-推论：kit 加载边界（session 启动 = 唯一加载时机）

**已验证契约**（同 C3/C4 PoC，附带发现）：

> `.claude/agents/*.md` 与 `.mcp.json` 仅在 Claude Code session **启动时**被扫描和加载。session 运行中新增/修改 kit 文件**不会**被发现，新文件里声明的 agent / MCP server 在当前 session 内全部不可用。

**PoC 证据**：
- 在 session A 里写好 `poc-v2-writer.md` 与 `.mcp.json` 后，A 内直接 `Task subagent_type=poc-v2-writer` 报 `Agent type 'poc-v2-writer' not found`
- 起一个新的 `claude -p` 子进程（session B）后，B 能正常 spawn 该 agent 并调到 MCP 工具

**对 OPC kit-install UX 的硬要求**：
- kit 安装器（`opc-kit install <name>`）在写完文件后**必须**显式提示用户"请重启 Claude Code 以加载新 kit"
- 不能假装"装完即可用"——用户在当前 session 内会撞到 `Agent type not found`
- 同理，`opc-kit update` / `opc-kit remove` 也需要同样的重启提示

**对 OPC v1 实施的影响**：
- kit-install 工具不需要任何"热重载"机制（既不可能也不必要）
- distiller 提炼出的 corrections 写入到 `.opc/corrections/*.md`（不属于 `.claude/agents/`，是数据文件），仍可被运行中的 OPC reflection server 即时读到——这条路径不受 C4-推论影响
- 反过来，如果将来想做"动态 kit 切换"（如 A/B 测试不同的 phase 集合），不能走 `.claude/agents/` 路径，必须走 OPC server 内部的逻辑路由

**与 C1 session_id 的关系**：
- session 启动 → 新 session_id → 新一份加载快照
- 两个 session 之间的 kit 状态独立；不存在"两个 session 共享一份 agent 注册表"的概念

### 2.6 C5：Hook 注入策略

| 配置 | 行为 | v1 默认 |
|---|---|---|
| `OPC_HOOK_INTENSITY=loud` | 每条非 `/` 前缀消息都注入"先调 opc_flow_query" | ❌ **暂不默认**（待 V4/V5 PoC 通过） |
| `OPC_HOOK_INTENSITY=quiet` | 仅在以下情况注入：① 检测到关键词（task/实现/修复/重构/...）；② 当前已有 active 流程 | ✅ **v1 默认** |
| `OPC_HOOK_INTENSITY=off` | 完全不注入，Claude 自行决定（适合熟练用户） | — |

**为什么 v1 默认 quiet（A2 修订）**：
- V4（hook 与 system prompt 优先级冲突）与 V5（hook 文本是否累积进 user message history）尚未通过 PoC
- 在未验明前默认 `loud` 有两个风险：(a) 大量短对话被强制走 flow_query 一圈，性价比可疑；(b) 若 V5 失败（hook 文本累积），长 session 会无谓消耗 token
- 因此 v1 默认 `quiet`：只在关键词命中或已有活跃流程时注入。验完 V4/V5 后若结果良好，再考虑把默认改为 `loud`
- 用户可手动 `export OPC_HOOK_INTENSITY=loud` 提前体验

**`/` 前缀豁免**：用户输入以 `/` 开头视为 slash 命令（如 `/opc-status`），hook 跳过注入。

**quiet 模式关键词清单**（v1 初版，可在 `.opc/config.json` 覆盖）：
```
中文：任务 / 实现 / 修复 / 重构 / 加 / 改 / 新增 / 优化 / 设计 / 写 / 调试 / 上线
英文：implement / fix / refactor / add / update / build / debug / deploy / design / write
```

匹配规则：大小写不敏感 + 出现任一即触发 + active 流程时无视关键词强制注入。

**实现位置**：`src/plugins/opc/bin/opc-hook.sh`（详见 `02-opc-state-server/01-intent-analysis/01_hook-architecture.md 高级形态`）。

### 2.7-pre C6：HTTP/SSE 模式 session 归属与孤儿恢复（A1）

**问题陈述**：
- C1/C2 的 `owner.pid` + `kill(pid, 0)` 探活只在 stdio 模式成立——MCP server 是 claude 直接 spawn 的子进程，ppid 就是 claude
- HTTP/SSE 模式下：MCP server 通常是独立部署的 daemon（容器/远程主机），多个 claude client 通过 HTTP 连同一台 server。此时：
  - `process.ppid` 指向 init / systemd，**不是 claude**
  - `kill(pid, 0)` 探活的 pid 在另一台机器上，**根本拿不到**
  - 多个 claude 实例可能共用同一 MCP server，session 归属必须靠协议层标识

**决议**：HTTP/SSE 模式下 owner 模型整体替换，分两层：

#### 一·主归属键：`Mcp-Session-Id` header

| 字段 | 来源 | 性质 |
|---|---|---|
| `Mcp-Session-Id` | MCP HTTP transport 规范要求每个 client 在首次握手后保留 server 返回的 session id；后续每次请求附在 header 上 | 协议级、跨进程稳定 |
| `claude_pid` + `claude_started_at` | Claude 在首次 `opc_flow_query()` 时显式传入（与 C2 既有方案一致） | 进程级，仅用于本地 ops 调试 |

**派生规则**：
```
HTTP/SSE 模式:
  session_id = "sess-http-" + sha256(Mcp-Session-Id).slice(0, 12) + "-" + <unix_ts>

  flow-state.json.owner = {
    transport:     "http" | "sse",
    mcp_session_id: <Mcp-Session-Id 原值>,   // 主归属键
    claude_pid:     <如有>,                  // 仅作 ops 辅助，不参与探活
    claude_host:    <client IP 或 UA, 来自 X-Forwarded-For/User-Agent>,
    last_heartbeat: <unix_ts>                // 替代 kill(pid,0)
  }
```

#### 二·探活机制：heartbeat ledger 替代 `kill(pid, 0)`

```
opc-state-server 启动 HTTP/SSE 模式时:
  ① 监听 MCP 协议级断开事件（client disconnect / session close）
     断开 → 立即把 owner.status 置为 "disconnected"，记 disconnected_at
  ② 每次收到该 Mcp-Session-Id 的任意工具调用 → 刷新 owner.last_heartbeat
  ③ 后台 reaper 每 30s 扫一遍：
       last_heartbeat 距今 > HEARTBEAT_TIMEOUT（默认 120s）
       且 status != active
       → 标记 orphan_candidate
  ④ opc_flow_query() 返回 orphan_candidate 列表给 Claude 决策

opc_flow_lifecycle({action:"recover"})(orphan_session_id, transport_proof) 内部:
  HTTP/SSE 模式:
    ① 校验调用方携带的 Mcp-Session-Id ≠ orphan 的 mcp_session_id
       （防止同 session 自我接管）
    ② 校验 orphan 的 last_heartbeat 距今 > HEARTBEAT_TIMEOUT
    ③ owner 字段整体替换为新 client 的归属信息
    ④ session_id 字段保持原值
```

| 默认参数 | 值 | 可调位置 |
|---|---|---|
| `HEARTBEAT_TIMEOUT` | 120s | `.opc/config.json` 或 env `OPC_HEARTBEAT_TIMEOUT_SEC` |
| `REAPER_INTERVAL` | 30s | 同上 `OPC_REAPER_INTERVAL_SEC` |
| `DISCONNECT_GRACE` | 10s | 协议断开后等待重连的宽限期，避免网络抖动误判 |

#### 三·并发隔离：HTTP/SSE 模式下的写锁

stdio 模式假设"一个 claude = 一个 server 实例"天然串行；HTTP/SSE 模式下**多 client 共享一个 server**，必须显式加锁：

```
所有写类工具（opc_*_complete / opc_node_finish / opc_knowledge_write / ...）入口:
  ① 取 session 级 advisory lock（基于 session_id）
  ② 持锁内执行 → 写文件 → 释放锁
  ③ 同 session 的并发写串行；不同 session 的写并行

corrections / knowledge 全局写（如 L3 promote）:
  额外取 project 级 advisory lock，跨 session 串行
```

**实现细节**：用 `proper-lockfile` 包基于文件锁实现；锁文件放 `.opc/sessions/<id>/.lock` 与 `.opc/.global-lock`。

#### 四·v1 默认部署策略

| 部署形态 | 推荐 transport | 理由 |
|---|---|---|
| 单机 + 单 Claude Code | stdio | 最简单，C1/C2 完整覆盖 |
| 单机 + 多个 Claude Code 同项目 | stdio + 项目级 advisory lock | 串行化即可，复杂度低 |
| 远程 server / 容器内 server | **HTTP，默认不开**——OPC marketplace v1 不官方支持；需要的用户自配并接受 C6 全部约束 | HTTP 模式 PoC 待补 V6（见验证清单） |
| SaaS 多租户 | 当前 **不支持**——OPC 不解决多租户隔离 | 设计目标外 |

**对外文档措辞**：marketplace README 在"安装"章节明确写"v1 仅官方支持 stdio 模式；HTTP/SSE 处于 experimental 状态，关键契约 V6 未验证完成前不建议生产使用"。

### 2.7 C4-推论的工程化：kit-install UX 约定

源自 C4-推论"`.claude/agents/*.md` 与 `.mcp.json` 仅在 session 启动时加载"。本节把它落成对 OPC 实施层的硬约定。

#### 2.7.1 安装器输出契约

`opc-kit install <kit-name>` / `opc-kit update <kit-name>` / `opc-kit remove <kit-name>` 三个命令在文件操作完成后**必须**输出以下结构化提示：

```
✓ Kit installed: <kit-name>
  Wrote .claude/agents/*.md  (N files)
  Wrote .mcp.json  (added server: <server-name>)

⚠️  Restart required
   Claude Code only loads .claude/agents/ and .mcp.json at session start.
   To use this kit, please:
     1. Exit the current `claude` session (Ctrl+D or /exit)
     2. Run `claude` again in this directory
   The new agents and MCP server will be available in the new session.
```

不能省略 `⚠️ Restart required` 段——这是 UX 契约，省略会导致用户在当前 session 内撞到 `Agent type not found` 报错并误判"安装失败"。

#### 2.7.2 数据型 vs 注册型变更的区分

| 变更类型 | 文件位置 | 是否需要重启 |
|---|---|---|
| **注册型** | `.claude/agents/*.md`, `.mcp.json` | ✅ 需要 |
| **数据型** | `.opc/corrections/*.md`, `.opc/knowledge/**/*.md`, `.opc/sessions/<id>/**`, kit 内的 `phases/**/*.md` | ❌ 不需要（运行中即时读到） |

**含义**：
- distiller 把反思精华写入 `.opc/corrections/` —— 不需要重启，下一次 `opc_corrections({action:"query"})` 就能读到（C3 已验证：sub-agent 与主进程共享 server，server 重读文件即可）
- 用户手动改一个 phase 的 node body（如调整 `tdd-implementation.md` 文字）—— 不需要重启，下一次 `opc_node_start` 重新读文件
- 用户新装一个 kit 引入新 agent 类型（如 `backend-engineer-v2`）—— **需要**重启
- 用户新装的 kit 携带自己的 MCP server（如 `opc-distiller-server`）—— **需要**重启

#### 2.7.3 不需要的工程复杂度

明确**不实现**的几样东西，避免方案膨胀：
- ❌ "热重载"机制（Claude Code 不支持，也不应该让 OPC 去 mock）
- ❌ "sidecar 注册中心"（同上）
- ❌ "kit 动态 A/B 测试"（如必要，应走 OPC server 内部的逻辑路由，不动 `.claude/agents/`）

#### 2.7.4 与 corrections 路径的关系

C4-推论的边界很重要：
- corrections 是 OPC server **运行时读的数据文件**，不是 Host 加载的注册表，所以 distiller 把内容写进去就立刻生效——这是 OPC v1 的可行性前提
- 如果未来 corrections 演变成"动态 sub-agent 模板"（即每条 correction 想生成一个新的 `.claude/agents/<role>.md`），那条路会撞 C4-推论而必须重启。届时设计要回头来这里加一节"动态 agent 生成的处理方案"。当前 v1 不走这条路

#### 2.7.5 server 端 "kit 未加载" 主动检测（A4）

**问题**：用户装完 kit 但忘了重启，下一次进入 task 链路时 Claude 调 `Task subagent_type=backend-engineer` 会拿到 Host 返回的 `Agent type 'backend-engineer' not found`——这条报错对普通用户不友好，且发生在链路深处，定位成本高。

**决议**：opc-state-server 在 `opc_flow_query()` / `opc_pipeline_create()` 两个关键入口主动做"已装 kit 与运行时可见性"的对账，提前给出可读提示。

```
opc_flow_query() 增量逻辑（kit 健康检查）:
  ① 读 .opc/installed-kits.json（opc-kit install 时维护的清单）
       结构: { kits: [{ name, version, agents: [...], mcp_servers: [...], installed_at }] }
  ② 对每个已装 kit:
       检查 .claude/agents/<agent>.md 在磁盘存在 ✓
       检查 .mcp.json 包含 mcp_servers 中的每一项 ✓
  ③ 计算 "应可见 vs 实际可见":
       由于 server 自身无法直接探测 Claude 当前 session 加载状态,
       使用启发式: 比较 .claude/agents/ mtime 与当前 session 启动时间
       - mtime > session_started_at → 该 kit 文件在 session 启动后才落盘,几乎肯定未加载
  ④ 若检测到不一致:
       返回 _warnings: [{
         level: "warning",
         code: "KIT_PROBABLY_NOT_LOADED",
         kit: "<kit-name>",
         affected_agents: [...],
         affected_mcp_servers: [...],
         remediation: "Exit current `claude` session and re-run `claude` in this directory.",
         installed_at: "...",
         session_started_at: "..."
       }]
  ⑤ 同时写入 suggested_actions[]:
       { action: "restart_session", reason: "kit_not_loaded", details: {...} }

opc_pipeline_create() 增量逻辑:
  ① 解析 pipeline plan 中所有 phase/node 引用的 subagent_type
  ② 与 .opc/installed-kits.json 中声明的 agents 取交集
  ③ 若有 subagent_type ∈ 已装 kit 但 kit 加载时间晚于 session 启动时间:
       reject pipeline 创建,返回:
       { code: "KIT_NOT_LOADED_PRE_FLIGHT",
         message: "Required agents are installed but not yet loaded by Claude Code.",
         required_agents: [...],
         remediation: "<同上>" }
       注: 此 reject 早于 Claude 真的去 Task spawn,避免半路崩
```

**session_started_at 取值**：
- stdio 模式：`process.ppid` 进程的 `start_time`（通过 `ps -o lstart -p <ppid>` 或 `/proc/<ppid>/stat`）
- HTTP/SSE 模式：第一次见到 `Mcp-Session-Id` 的时间（由 server 自己记录）

**`.opc/installed-kits.json` 维护责任**：
- `opc-kit install <name>` 写入或更新一条 entry，含 `installed_at: <现在>` 和该 kit 提供的 agents/mcp_servers 清单
- `opc-kit remove <name>` 删除对应 entry
- `opc-kit update <name>` 更新 `installed_at`
- 失败回滚（写文件成功但 entry 写失败）时，自动清理已写入的 `.claude/agents/*.md`，保持原子性

**与 2.7.1 安装器输出契约的配合**：
- 安装器输出"Restart required"提示（用户视角）
- server 端 KIT_PROBABLY_NOT_LOADED 警告（Claude / 链路视角）
- 两者覆盖不同失败模式：用户没看安装器输出 / 用户重启了但项目目录里又装了新 kit

**降级与边界**：
- 检测是启发式（基于 mtime vs session_started_at），不可能 100% 准确
- 若 false positive（kit 确实加载了但 mtime 比较失败）：警告级别，不阻塞 `opc_flow_query`；只在 `opc_pipeline_create` 时变 reject——而后者一旦真去 Task spawn 就会立刻拿到 "Agent type not found"，所以 false positive 的代价就是用户手动按提示重启一次
- 若 false negative（kit 没加载但检测放行）：链路继续走到 Task spawn 时拿到原始报错——退化到原状态，没变差

---

## 三、验证清单

实施 OPC 前的 Host 行为验证。**V1 / V2 / V3 / V6 / V7 已通过 PoC 验证**（截至 2026-06-10）；V4 / V5 待操作员按 spike runbook 执行。详见 [01_validation-log.md](./01_validation-log.md)。

| # | 验证项 | 状态 | 验证方式 / 结果 |
|---|---|---|---|
| V1 | `process.ppid` 在 stdio MCP server 中等于 spawn 该 server 的 Claude Code 进程，且 `kill(pid, 0)` 探活语义正确 | ✅ **PASS** | 2026-06-10 PoC：`report_pid` 工具返 `server_ppid=43990`，`ps` 验证 ppid 是 `claude` 进程；headless 退出后 `kill -0 43990` 立刻 ESRCH。**caveat**：ppid 指向 spawn 该 server 的 claude，不是顶层 host claude（嵌套场景下两者不同）。详见 [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md) |
| V2 | Task spawn 的 sub-agent 能调父 conversation 注册的 MCP 工具 | ✅ **PASS** | 2026-06-10 PoC：`poc-v2-writer` sub-agent 调 `mcp__poc-host-contract__poc_echo_write` 成功写出 `artifacts/proof-1781020775701-jp9l68.txt`，`server_pid=43275` 与父进程关联。详见 [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md) |
| V3 | Task `tools` 白名单被 Host 强制 | ✅ **PASS（更强）** | 2026-06-10 PoC：`poc-v3-reader` 调未白名单的写工具直接报 `Error: No such tool available`——未白名单工具**不可见**，比"运行时拒绝"更彻底。详见 [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md) |
| V4 | UserPromptSubmit hook 与 system prompt 优先级 | ⏳ **待 PoC（阻塞 `loud` 默认）** | spike harness 已就绪（[poc/opc-host-contract-v4-v5/](../../../poc/opc-host-contract-v4-v5/)），需操作员按 runbook 执行 ~20min。**未通过前 `OPC_HOOK_INTENSITY` 默认 `quiet`**（A2）。失败 → 调整 hook 文本措辞或改用 SessionStart |
| V5 | hook 注入文本是否进入 user message history（影响 token） | ⏳ **待 PoC（阻塞 `loud` 默认）** | spike harness 已就绪（同 V4），需操作员按 runbook 执行。**未通过前 `OPC_HOOK_INTENSITY` 默认 `quiet`**（A2）。累积 → 改用 SessionStart 一次注入约束 + UserPromptSubmit 只做关键词触发 |
| V6 | HTTP/SSE 模式下 `Mcp-Session-Id` 跨请求稳定 + 协议级 disconnect 事件可监听 | ✅ **PASS** | 2026-06-10 PoC：close latency 41ms（240× 宽于 10s `DISCONNECT_GRACE`），同 client 多请求 sid 一致，client.terminateSession() → server 收到 `session_closed` 事件，reaper 正确仅标记 stale-inactive owner。详见 [poc/opc-host-contract-v6/RESULTS.md](../../../poc/opc-host-contract-v6/RESULTS.md) |
| V7 | `.opc/installed-kits.json` 中 mtime 与 session_started_at 的对账启发式准确度 | ✅ **PASS** | 2026-06-10 PoC：4102 次试验，TN FP 率 1.84%（< 5% 阈值），TP FN = 0。±2s 时钟偏移下推荐 `grace_ms=5000`（M18 落地参数）。详见 [poc/opc-host-contract-v7/RESULTS.md](../../../poc/opc-host-contract-v7/RESULTS.md) |

V1/V2/V3 完整复现指令与原始返回见 [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md)。V6 / V7 结果见 [poc/opc-host-contract-v6/RESULTS.md](../../../poc/opc-host-contract-v6/RESULTS.md) / [poc/opc-host-contract-v7/RESULTS.md](../../../poc/opc-host-contract-v7/RESULTS.md)。V4 / V5 spike runbook 见 [poc/opc-host-contract-v4-v5/runbook/protocol.md](../../../poc/opc-host-contract-v4-v5/runbook/protocol.md)。聚合索引见 [01_validation-log.md](./01_validation-log.md)。

---

## 四、与其他章节的接缝

| 章节 | 旧表述 | 本章对齐方式 |
|---|---|---|
| `01-overview/03_architecture.md` | 假设 Claude 按 flow_next 推进 | 本章 C4/C5 给出 Host 行为约束的硬约定 |
| `02-opc-state-server/01-intent-analysis/01_hook-architecture.md 1.3 session_id 来源` | env / PPID / default 三段式 | **替换**为本章 C1/C2 的 pid 派生方案；该节后续仅引用本章 |
| `02-opc-state-server/04-node/07_tools.md opc_node_start dispatch_instruction` | 假设 sub-agent 能调 knowledge 工具 | 由本章 C3 **已验证契约**保证（不再需要降级方案兜底，降级方案降级为"未来变更时启用"备份） |
| `05-opc-reflection-server/02-server-design/00_overview.md 五 Sub-Agent 权限白名单` | 假设 `allowed_tools` 被 enforce | 由本章 C4 **已验证契约**保证（强度比"拒绝"更高：未白名单工具不可见）；OPC server 双保险仍保留，作 kit 配置失误兜底 |
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

## 六、子文档导航

| 子文档 | 状态 | 内容 |
|---|---|---|
| 01_validation-log.md | ✅ 已落地（2026-06-10） | V1–V7 PoC 验证结果聚合索引（V1/V2/V3/V6/V7 已 PASS，V4/V5 待操作员运行 spike runbook）|
| 02_subagent-fallback-plans.md | ✅ | C3 降级方案（代理模式 / 延迟写入）的详细工程规范 |
| 03_kit-agent-conventions.md | ✅ | 每个 kit 的 `agents/*.md` 必须声明的字段规范（含 `tools` 强制）|
| 04_http-sse-deployment.md | ✅ | HTTP/SSE 模式部署指南：Mcp-Session-Id 配置、heartbeat 参数、advisory lock 实施 |
| 05_installed-kits-registry.md | ✅ | `.opc/installed-kits.json` schema + 维护责任 + 对账启发式调参 |

---

## 七、核心设计原则

- **显式 > 隐式**：所有 Host 假设集中到本章，散落即违规
- **可验证**：7 项验证清单是 PoC 准入门槛
- **有降级**：每个假设必须有 fallback plan
- **单机单用户**：不追求分布式恢复，复杂度收益不匹配
- **双保险**：Host enforce + OPC server 内部校验，任一失效不至于全垮

---

## 八、相关文档

- [01-overview/00_index.md](../01-overview/00_index.md) — 全局架构（已更新指向本章）
- [02-opc-state-server/01-intent-analysis/01_hook-architecture.md](../02-opc-state-server/01-intent-analysis/01_hook-architecture.md) — Hook 实现细节
- [05-opc-reflection-server/02-server-design/00_overview.md](../05-opc-reflection-server/02-server-design/00_overview.md) — sub-agent 权限白名单
- [07-tool-consolidation/00_overview.md](../07-tool-consolidation/00_overview.md) — 工具裁剪规范（解决工具数过多）
