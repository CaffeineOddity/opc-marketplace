# 05 — Installed-Kits 注册表

> 本章定义 `.opc/installed-kits.json` 的 schema、维护责任、
> 与 session 启动时间的对账启发式、以及 kit 健康检查的完整逻辑。
> 对应 A4（kit 未加载检测）的工程落地。

## 一、Schema

### 1.1 文件位置

```
<workspace>/.opc/installed-kits.json
```

### 1.2 结构

```json
{
  "kits": [
    {
      "name": "opc-official-kits",
      "version": "0.1.0",
      "source": "marketplace",
      "agents": [
        "backend-architect",
        "frontend-developer",
        "code-reviewer",
        "critic",
        "debater"
      ],
      "mcp_servers": [
        "opc-state-server",
        "opc-reflection-server"
      ],
      "installed_at": "2026-06-11T10:00:00Z",
      "updated_at": "2026-06-11T10:00:00Z",
      "install_method": "opc-kit",
      "checksum": "sha256:abc123..."
    }
  ],
  "last_validated_at": "2026-06-11T10:05:00Z",
  "schema_version": 1
}
```

### 1.3 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | kit 全名（如 `opc-official-kits`） |
| `version` | string | 是 | 安装时的版本号 |
| `source` | string | 是 | `marketplace` / `local` / `url` |
| `agents` | string[] | 是 | 该 kit 提供的 agent name 列表 |
| `mcp_servers` | string[] | 否 | 该 kit 提供的 MCP server 名称列表 |
| `installed_at` | ISO8601 | 是 | 首次安装时间 |
| `updated_at` | ISO8601 | 是 | 最后更新时间（首次安装 = installed_at） |
| `install_method` | string | 是 | `opc-kit` / `manual` |
| `checksum` | string | 否 | kit 内容的完整性校验值 |

### 1.4 Schema 演化

`schema_version` 用于向前兼容。新增字段必须是 optional。

## 二、维护责任

### 2.1 写入方

`opc-kit` CLI 是唯一写入方（用户不应手动编辑此文件）：

| 命令 | 操作 |
|---|---|
| `opc-kit install <name>` | 写入新 entry 或覆盖同 name 的旧 entry（含 `installed_at: now`） |
| `opc-kit remove <name>` | 删除对应 entry |
| `opc-kit update <name>` | 更新 `version` + `updated_at` + `agents` + `mcp_servers` |

### 2.2 原子性保证

```
opc-kit install <name>:
    ① 写入 .claude/agents/*.md（N 个文件）
    ② 写入/更新 .mcp.json（追加 mcpServers entry）
    ③ 写入 .opc/installed-kits.json（追加 kit entry）
    
    若 ① 或 ② 成功但 ③ 失败：
        → 回滚 ① 和 ②（删除已写入的 agents/*.md 和 mcpServers entry）
        → 保证原子性：要么全部生效，要么全部回滚
    
    若 ① 成功但 ② 失败：
        → 回滚 ①（删除已写入的 agents/*.md）
        → 报错退出
```

### 2.3 读取方

- `opc-kit list`：列出已装 kit（读此文件）
- `opc-flow_query()`：kit 健康检查（读此文件 + 对账）
- `opc_pipeline_create()`：pre-flight 检查（读此文件 + 对账）

## 三、Kit 健康检查（A4 落地）

### 3.1 检测时机

```
opc_flow_query() 被调用时:
    → 执行 kit 健康检查
    → 检测"已装但可能未加载"的 kit

opc_pipeline_create() 被调用时:
    → 执行 pre-flight 检查
    → 检测 pipeline plan 引用的 agent 是否来自"已装但未加载"的 kit
```

### 3.2 session_started_at 取值

| 模式 | 取值方式 |
|---|---|
| stdio | `process.ppid` 进程的 start time（`ps -o lstart -p <ppid>`） |
| HTTP/SSE | server 第一次收到该 `Mcp-Session-Id` 的时间 |

### 3.3 对账逻辑

```
opc_flow_query() 内 kit 健康检查:
    ① 读 .opc/installed-kits.json → kits[]
    ② 对每个 kit:
        检查 .claude/agents/<agent>.md 在磁盘存在
        检查 .mcp.json 包含 mcp_servers 中的每项
    ③ 计算"应可见 vs 实际可见":
        比较 .claude/agents/ 的 mtime 与 session_started_at
        mtime > session_started_at → kit 文件在 session 启动后才落盘
        → kit 几乎肯定未被当前 Claude Code session 加载
    ④ 若检测到不一致:
        返回 _warnings: [{
          level: "warning",
          code: "KIT_PROBABLY_NOT_LOADED",
          kit: "<kit-name>",
          affected_agents: [...],
          remediation: "Exit and restart claude session"
        }]
```

### 3.4 Pre-Flight 检查

```
opc_pipeline_create() 内 pre-flight:
    ① 解析 pipeline plan 中所有 phase/node 引用的 subagent_type
    ② 与 .opc/installed-kits.json 中声明的 agents 取交集
    ③ 若有 subagent_type ∈ 已装 kit 但 kit 加载时间晚于 session 启动时间:
        → reject pipeline 创建
        → 返回 {
            code: "KIT_NOT_LOADED_PRE_FLIGHT",
            message: "Required agents installed but not loaded",
            required_agents: [...],
            remediation: "Restart claude session"
          }
```

此 reject 发生在 pipeline 创建阶段（早于实际 Task spawn），避免半路崩溃。

### 3.5 启发式精度

V7 PoC（2026-06-10）验证：4102 次试验，TN FP 率 1.84%（< 5% 阈值），TP FN = 0。
推荐 `grace_ms=5000`（±5s 时钟偏移容差）。

## 四、Kit 可见性生命周期

```
opc-kit install
    │
    ├── 文件落盘: .claude/agents/*.md + .mcp.json
    ├── 注册表写入: .opc/installed-kits.json
    │
    ├── [当前 session] → 不可见（C4-推论：session 启动时已扫描完毕）
    │       opc_flow_query() → KIT_PROBABLY_NOT_LOADED 警告
    │
    └── [重启 session 后] → 可见
            opc_flow_query() → 无警告
            opc_pipeline_create() → pre-flight 通过
```

## 五、降级与边界

| 场景 | 处理 |
|---|---|
| False positive（kit 确实加载了但 mtime 比较失败） | `opc_flow_query` 仅警告，不阻塞；`opc_pipeline_create` 会 reject，但一旦去 Task spawn 就会立刻拿到真实报错 → false positive 代价 = 用户手动重启一次 |
| False negative（kit 没加载但检测放行） | 链路继续走到 Task spawn 拿到 `Agent type not found` → 退化到原状态，没变差 |
| 用户手动删了 `.claude/agents/` 但 registry 未更新 | `opc_flow_query` 检测到文件缺失 → 返回 `KIT_FILES_MISSING` 警告，建议 `opc-kit repair` |
| 用户手动改了 `.mcp.json` | 同 registry 对账不一致 → 返回 `MCP_CONFIG_MISMATCH` 警告 |

## 六、手动修复

```
# 检查所有已装 kit 的完整性
opc-kit doctor

# 输出示例：
✓ opc-official-kits (v0.1.0) — all 27 agents present, 2 MCP servers configured
⚠ opc/community-lint (v0.0.1) — 2 agents missing, run 'opc-kit repair opc/community-lint'

# 修复单个 kit（重新写入缺失文件）
opc-kit repair opc/community-lint
```

## 七、相关文档

- [00 Host 契约总览](./00_overview.md) — A4 问题定义与 C4-推论
- [04 HTTP/SSE 部署](./04_http-sse-deployment.md) — HTTP/SSE 模式下的注册表行为
- [03 Kit-Agent 约定](./03_kit-agent-conventions.md) — agent.md 规范
- [poc/opc-host-contract-v7/RESULTS.md](../../../poc/opc-host-contract-v7/RESULTS.md) — V7 PoC 验证结果
