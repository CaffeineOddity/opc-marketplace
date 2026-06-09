# PoC Results — V1 + V2 + V3 Host Contract

**Date:** 2026-06-10
**Status:** ✅ **三条全通过。** V2/V3 用 headless `claude -p` 跑，V1 在 server 加一个 `report_pid` introspection 工具后用同样手段验证。

---

## 结论一览

| 假设 | 结果 | 关键证据 |
|---|---|---|
| **V1** — stdio 模式下 MCP server `process.ppid` 指向 spawn 它的 Claude Code 进程，可作为 `session_id` 派生与 owner.pid 心跳的锚 | ✅ PASS | `report_pid` 在 headless `claude -p` 内返回 `server_pid=44010, server_ppid=43990`，`ps` 链显示 ppid=43990 的 `comm=claude`；headless session 结束后 `kill -0 43990` 立刻 ESRCH，host session 的另一 server (ppid=43162) `kill -0` 仍 alive |
| **V2** — Task 子代理继承父进程的 MCP server 连接 | ✅ PASS | `poc-v2-writer` 调用 `mcp__poc-host-contract__poc_echo_write` 成功，磁盘上产出 `proof-1781020775701-jp9l68.txt`，`server_pid=43275`（父进程托管的 MCP server） |
| **V3** — agent frontmatter `tools:` 白名单被 Host 强制执行 | ✅ PASS（且**比预期更强**） | `poc-v3-reader` 调写工具时报错：**`Error: No such tool available: mcp__poc-host-contract__poc_echo_write`**。未白名单的工具**根本不可见**，不是运行时拒绝。`artifacts/` 没有新文件 |

---

## 同时被验证的附带契约

| 编号 | 描述 | 证据 |
|---|---|---|
| **C1-confirmed** | 每个 Claude Code session **独占一个** MCP server 子进程（stdio one-shot spawn） | host session 看到两条独立的 `node ./poc/...server/index.mjs` 进程（pid 43187/43617），各自 ppid 指向不同的 `claude` 主进程；headless `claude -p` 又起了一个 pid 44010；server 与 session 严格 1:1 |
| **C2-confirmed** | `session_id = "sess-" + ppid + "-" + ts` 派生 + owner.pid 心跳 + `kill(pid, 0)` 探活 可工作 | `report_pid` 拿到 `ppid=43990` → `ps` 验证它就是 `claude` 进程；headless 退出后 `kill -0 43990` 立即返回 ESRCH，与 owner.pid orphan 检测语义吻合 |
| **C2-caveat** | `process.ppid` 是 **spawn 该 server 的 claude 进程**，而不是顶层用户终端的 claude；在 `claude -p` headless 或嵌套 launcher 场景下两者不同 | headless 探针的 ancestor chain：`node(44010) → claude(43990) → zsh(43982) → claude(98334, 顶层 host)`。结论：owner.pid 必须用 **直接 ppid**（与 server 共生死的那一层），不要去 walk chain 找"真正的"顶层 claude |
| **C4-confirmed** | `.claude/agents/*.md` 与 `.mcp.json` **在 session 启动时加载**，不热重载 | 本 session（早于这两个文件写入时启动）`Task subagent_type=poc-v2-writer` 报 `Agent type not found`；新起 `claude -p` 子进程能正常 spawn |
| **C3-confirmed** | sub-agent 调用 MCP 工具时，确实命中**父进程**的 MCP server 实例（不是 spawn 一个新的） | V2 探针返回的 `server_pid=43275` 与 V3 探针返回的 `server_pid=43347` 都和各自父 `claude -p` 进程关联，说明每个 session 启动时 spawn 一个 server 实例，session 内所有 sub-agent 共享 |
| **V3-stronger** | 未白名单工具是**不可见**（Host 在工具列表层面就裁剪掉了），而不是「可见但被拒」 | 错误文本 `No such tool available` 而非 `Permission denied`。说明 critic sub-agent 即便被 prompt injection 也无法"探听"到禁用工具的存在 |

---

## 复现指令（任何人重跑）

```bash
cd /Users/zhuangchubin/learn/opc-marketplace

# V1 探针（须在 .mcp.json 已注册 + server 含 report_pid 的 session 中跑）
ps -axo pid,ppid,comm | grep -E '(claude|opc-poc)' | grep -v grep    # before
claude -p --permission-mode bypassPermissions --output-format json \
  "请调用 mcp__poc-host-contract__report_pid（无参数），把返回的完整 JSON 原文贴回来。"
ps -axo pid,ppid,comm | grep -E '(claude|opc-poc)' | grep -v grep    # after — headless 的 claude/node 应已不在
kill -0 <报告里的 server_ppid> 2>&1     # 应报 "no such process"

# V2 探针
claude -p --permission-mode bypassPermissions --output-format json \
  "请用 Task 工具 spawn subagent_type='poc-v2-writer'，让它调用 \
   mcp__poc-host-contract__poc_echo_write，参数 text='v2-probe-from-cli'。\
   把 sub-agent 返回的完整结果原文贴回来。"

# V3 探针
claude -p --permission-mode bypassPermissions --output-format json \
  "请用 Task 工具 spawn subagent_type='poc-v3-reader'，让它先调用 \
   mcp__poc-host-contract__poc_echo_read（参数 text='v3-probe-read'），\
   然后尝试调用 mcp__poc-host-contract__poc_echo_write（参数 text='v3-probe-write-should-fail'）。\
   把 sub-agent 两次调用的完整原文结果都贴回来。"

# 检验
ls poc/opc-host-contract-v2-v3/artifacts/
# 期望：1 个 V2 产出的 proof-*.txt + 若干 V1 产出的 pidreport-*.json，没有 v3-probe-write 相关文件
```

---

## 原始 sub-agent 返回

### V1

```
{"server_pid":44010,"server_ppid":43990,"argv":["/opt/homebrew/Cellar/node@20/20.19.2/bin/node","/Users/zhuangchubin/learn/opc-marketplace/poc/opc-host-contract-v2-v3/server/index.mjs"],"ancestor_chain":[{"pid":44010,"ppid":43990,"comm":"node"},{"pid":43990,"ppid":43982,"comm":"claude"},{"pid":43982,"ppid":98334,"comm":"/bin/zsh"},{"pid":98334,"ppid":35444,"comm":"claude"},{"pid":35444,"ppid":35422,"comm":"-zsh"},{"pid":35422,"ppid":35360,"comm":"login"},{"pid":35360,"ppid":1,"comm":"/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal"}],"captured_at":"2026-06-09T16:23:18.317Z"}
```

外部 kill 验证：

```
$ kill -0 43990         # headless session ended
kill: kill 43990 failed: no such process     ← ✅ owner.pid 探活语义正确

$ kill -0 43162         # 当前 host session 的 claude
                         ← 静默成功 = alive
```

### V2

```
{"file_path":"/Users/zhuangchubin/learn/opc-marketplace/poc/opc-host-contract-v2-v3/artifacts/proof-1781020775701-jp9l68.txt","server_pid":43275}
```

### V3

```
=== STEP 1 (READ) RESULT ===
{"echoed":"v3-probe-read","server_pid":43347}

=== STEP 2 (WRITE ATTEMPT) RESULT ===
Error: No such tool available: mcp__poc-host-contract__poc_echo_write
```

---

## 对 OPC 设计的影响

| 设计假设 | 状态 | 行动 |
|---|---|---|
| `session_id = "sess-" + <ppid> + "-" + <unix_ts>` 派生 | ✅ V1 通过 | 文档可以从"待验证"升级为"硬保证（stdio 模式）"。**caveat**：ppid 是 spawn 该 server 的 claude，不是顶层用户 claude — 在 `claude -p` 嵌套场景里两者不同 |
| `flow-state.owner.pid` 用 `kill(pid, 0)` 做 orphan 检测 | ✅ V1 副产物通过 | 实测 headless 退出后 ppid 立即 ESRCH，符合预期 |
| HTTP/SSE 远程 MCP server 模式下 owner.pid 派生失效 | ⚠️ 仍未覆盖 | 在 `06-host-contract.md` 注明：远程 MCP 必须改用 `host_handshake_token`（Claude 首次 query 显式注入会话标识），不能依赖 `process.ppid` |
| 反思 server 通过 Host 的 Task 工具 spawn critic sub-agent | ✅ V2 维持不变 | 无需改 |
| critic sub-agent 在 `.claude/agents/<critic>.md` 里声明 `tools:` 限制其能调的 MCP 工具集 | ✅ V3 维持不变（且更强） | 文档可以从"建议"升级为"硬保证"措辞 |
| node-level 工具如 `opc_knowledge_write` 在不需要的 agent 里**省略**就能阻止误用 | ✅ V3 维持不变 | 无需改 |
| kit 安装后新 agent / 新 MCP server 立刻可用 | ❌ **需要重启 session** | 需在 `06-host-contract.md` 或 kit-install UX 文档补充"装完 kit 必须重启 `claude`"提示 |

---

## 后续要在设计文档加的一句话

> **C4 推论（session 启动 = 加载边界）**：`.claude/agents/*.md` 与 `.mcp.json` 仅在 Claude Code session 启动时扫描，运行中安装/更新 kit 不会被发现。OPC kit 安装器在写完文件后应提示用户 `请重启 claude 以加载新 kit`。

---

## 清理（可选，保留即作为审计快照）

```bash
rm .mcp.json
rm .claude/agents/poc-v2-writer.md .claude/agents/poc-v3-reader.md
rm -rf poc/opc-host-contract-v2-v3/artifacts \
       poc/opc-host-contract-v2-v3/server/node_modules
```

保留 `server/index.mjs` / `server/package.json` / `README.md` / 本文件作为审计快照。
