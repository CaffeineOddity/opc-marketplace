# 04 — HTTP/SSE 部署指南

> 本章定义 OPC server 在 HTTP/SSE 模式下的部署配置、session 归属、
> heartbeat 探活、advisory lock、以及 orphan 恢复。**v1 仅官方支持 stdio 模式；
> HTTP/SSE 处于 experimental 状态。**

## 一、部署形态对比

| 维度 | stdio（v1 官方支持） | HTTP/SSE（experimental） |
|---|---|---|
| 通信方式 | 进程 stdin/stdout | HTTP + SSE 长连接 |
| Session 归属 | `process.ppid` → Claude Code PID | `Mcp-Session-Id` header + heartbeat |
| 探活 | `kill(pid, 0)` | heartbeat ledger + disconnect 事件 |
| 并发 | 单进程天然串行 | 多 client 共享 server，需 advisory lock |
| 孤儿恢复 | `kill(pid, 0)` ESRCH → 直接接管 | heartbeat timeout + 显式 recover |
| 适用场景 | 单机开发 | 远程 server、容器部署、CI 集成 |

## 二、配置

### 2.1 Server 端启动

```bash
# 启动 HTTP/SSE 模式
opc-server --transport http-sse --port 3100 --host 0.0.0.0

# 环境变量
OPC_TRANSPORT=http-sse
OPC_HTTP_PORT=3100
OPC_HTTP_HOST=0.0.0.0
```

### 2.2 Client 端配置（`.mcp.json`）

```json
{
  "mcpServers": {
    "opc-state-server": {
      "type": "sse",
      "url": "http://<host>:3100/sse",
      "headers": {
        "Mcp-Session-Id": "<generated-session-id>"
      }
    }
  }
}
```

### 2.3 Mcp-Session-Id 生成

Client 端首次连接时生成一个稳定的 session ID：

```bash
# 推荐：uuidgen 或同等唯一 ID
export OPC_MCP_SESSION_ID="sess-$(uuidgen | cut -c1-8)-$(date +%s)"
```

此 ID 在同 session 的所有请求中保持不变，server 用它关联会话状态。

## 三、Session 归属与探活

### 3.1 归属信息

```json
{
  "owner": {
    "mcp_session_id": "sess-abc12345-1717840000",
    "client_host": "192.168.1.100",
    "client_pid": 12345,
    "connected_at": "2026-06-11T10:00:00Z",
    "last_heartbeat": "2026-06-11T10:05:00Z",
    "status": "active"
  }
}
```

### 3.2 Heartbeat 机制

```
opc-state-server HTTP/SSE 模式:
    ① 每次收到该 Mcp-Session-Id 的任意工具调用 → 刷新 owner.last_heartbeat
    ② 后台 reaper 每 30s 扫描:
         last_heartbeat 距今 > HEARTBEAT_TIMEOUT (默认 120s)
         且 status != active
         → 标记 orphan_candidate
    ③ 监听 MCP 协议级 disconnect 事件:
         断开 → owner.status = "disconnected"
         标记 disconnected_at
         等待 DISCONNECT_GRACE (默认 10s)
         若 grace 内重连 → status 恢复 active
         若 grace 超时 → 标记 stale
```

### 3.3 参数配置

```json
// .opc/config.json
{
  "http_sse": {
    "heartbeat_timeout_sec": 120,
    "reaper_interval_sec": 30,
    "disconnect_grace_sec": 10
  }
}
```

| 参数 | 默认值 | 环境变量 |
|---|---|---|
| `heartbeat_timeout_sec` | 120 | `OPC_HEARTBEAT_TIMEOUT_SEC` |
| `reaper_interval_sec` | 30 | `OPC_REAPER_INTERVAL_SEC` |
| `disconnect_grace_sec` | 10 | `OPC_DISCONNECT_GRACE_SEC` |

## 四、Orphan 恢复

### 4.1 检测

```
opc_flow_query()
    │
    ├── 扫描所有 session 的 owner.status
    ├── status=disconnected + last_heartbeat 过期 → orphan_candidate
    └── 返回 _warnings 中的 orphan 列表
```

### 4.2 恢复流程

```
opc_flow_lifecycle({action:"recover", orphan_session_id, transport_proof})

HTTP/SSE 模式下的校验:
    ① 调用方携带的 Mcp-Session-Id ≠ orphan 的 mcp_session_id
       (防止同 session 自我接管)
    ② orphan 的 last_heartbeat 距今 > HEARTBEAT_TIMEOUT
    ③ owner 字段整体替换为新 client 的归属信息
    ④ session_id 保持原值（不生成新 session）
```

### 4.3 安全约束

- 不允许同 Mcp-Session-Id 自我接管（防止网络分区下的脑裂）
- 必须超过 HEARTBEAT_TIMEOUT 才能恢复（防止误杀暂时卡顿的 client）
- 恢复操作记录到 audit log

## 五、Advisory Lock（并发写保护）

### 5.1 问题

stdio 模式下一个 claude = 一个 server 实例，天然串行。
HTTP/SSE 模式下多个 client 共享一个 server，必须显式加锁。

### 5.2 锁策略

```
所有写类工具入口:
    ① 取 session 级 advisory lock (基于 session_id)
    ② 持锁期间执行 → 写文件 → 释放锁
    ③ 同 session 并发写串行执行
    ④ 不同 session 的写并行执行

corrections/knowledge 全局写（如 L3 promote）:
    额外取 project 级 advisory lock
    跨 session 串行
```

### 5.3 实现

使用 `proper-lockfile` 基于文件锁：

```
session 锁: .opc/sessions/<session_id>/.lock
project 锁: .opc/.global-lock
```

锁超时 = 30s。超时后自动释放并记录 `lock_timeout` 到 audit log。

## 六、Session 清理

### 6.1 正常结束

Client 显式断开 SSE 连接 → server 收到 disconnect 事件 →
owner.status = disconnected → 等待 DISCONNECT_GRACE →
标记可清理。

### 6.2 异常结束

Client 崩溃（无 disconnect 事件）→ heartbeat 超时 →
reaper 标记 orphan_candidate → `opc_flow_query` 提示 →
用户决定 recover 或 abandon。

### 6.3 清理策略

```
abandoned session:
    ① flow-state.json 快照归档到 .opc/logs/archived-sessions/
    ② 从活跃 session 列表移除
    ③ .opc/logs/reflection/ 下的 artifact 保留 7 天
    ④ .opc/memory/corrections/ 不受影响（项目级持久化）
```

## 七、v1 限制

| 限制 | 说明 |
|---|---|
| 不支持多租户 | 一个 server 实例服务一个项目目录 |
| 不支持跨主机 session 迁移 | `flow-state.json` 文件锁依赖本地文件系统 |
| 不支持分布式锁 | advisory lock 基于本地文件，不跨主机 |
| 不支持 TLS | v1 不内置 TLS，需 reverse proxy |
| PoC 验证状态 | V6（Mcp-Session-Id 稳定性 + disconnect 事件）已通过，但端到端 HTTP/SSE 未完整测试 |

## 八、相关文档

- [00 Host 契约总览](./00_overview.md) — C2/C6 完整定义
- [05 Installed-Kits 注册表](./05_installed-kits-registry.md) — `.opc/installed-kits.json` 在 HTTP/SSE 下的行为
- [02-subagent-fallback-plans](./02_subagent-fallback-plans.md) — HTTP/SSE 模式下 sub-agent 的差异
- [poc/opc-host-contract-v6/RESULTS.md](../../../poc/opc-host-contract-v6/RESULTS.md) — V6 PoC 验证结果
