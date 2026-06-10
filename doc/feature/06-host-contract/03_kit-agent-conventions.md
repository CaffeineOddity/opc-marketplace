# 03 — Kit-Agent 文件约定

> 本章定义每个 kit 的 `agents/*.md` 文件必须遵循的 frontmatter 字段、
> `tools` 白名单强制规则、命名约定、以及目录结构规范。
> 所有 OPC kit（official + community）必须遵守本章约定。

## 一、文件命名约定

### 1.1 文件名 = agent name

```
agents/
  dev/
    backend-architect.md     → name: backend-architect
    frontend-developer.md    → name: frontend-developer
  qa/
    code-reviewer.md          → name: code-reviewer
```

**规则**：`name` frontmatter 字段必须等于文件名（不含 `.md` 扩展名）。
不一致会导致 `opc-kit list` 报告警告。

### 1.2 目录组织

```
<kit-root>/
  agents/
    product/       # 产品类 agent
    design/        # 设计类 agent
    dev/           # 开发类 agent
    infra/         # 基础设施类 agent
    qa/            # 质量保障类 agent
    reflection/    # 反思类 agent（只读）
```

分类不是强制的，但推荐。`opc-kit list` 按目录分组展示。

### 1.3 禁止的命名

- 禁止空格、特殊字符（遵循 Claude Code agent 命名规范）
- 禁止与 Claude Code 内置 agent 重名
- 禁止以 `opc-` 或 `claude-` 开头（保留前缀）

## 二、Frontmatter 必填字段

### 2.1 完整字段列表

```yaml
---
name: backend-architect           # 必填，= 文件名
description: <一句话描述>          # 必填，≤ 150 字符
model: sonnet | opus | haiku     # 必填
tools:                            # 必填，至少 1 个工具
  - Read
  - ...
---

# <标题>

<Markdown body — agent 的 system prompt>
```

### 2.2 字段约束

| 字段 | 约束 | 示例 |
|---|---|---|
| `name` | 必填，= 文件名（不含 `.md`） | `backend-architect` |
| `description` | 必填，≤ 150 字符，中文或英文 | `后端架构师 — 服务边界、领域建模、架构演进` |
| `model` | 必填，枚举值 | `sonnet` / `opus` / `haiku` |
| `tools` | 必填，YAML 数组，至少 1 个工具 | `[Read, Write, Edit, Bash]` |

### 2.3 可选字段

| 字段 | 说明 | 默认值 |
|---|---|---|
| `mode` | 权限模式 | `default` |
| `isolation` | 隔离模式 | 无（不隔离） |

## 三、Tools 白名单强制规则

### 3.1 分层约束

| Agent 类别 | 可用的 OPC 工具 | 禁用的 OPC 工具 |
|---|---|---|
| **Task agent**（product/design/dev/infra/qa） | `opc_knowledge_open`, `opc_knowledge_read`, `opc_knowledge_write`, `opc_corrections` | 无（所有 OPC 工具可用） |
| **Reflection agent**（reflection 目录） | `opc_knowledge_open`, `opc_knowledge_read`, `opc_corrections` | `opc_knowledge_write`（写被 OPC server 二次拒绝） |
| **Distiller agent** | `opc_knowledge_open`, `opc_knowledge_read`, `opc_corrections` | `opc_knowledge_write`（仅 corrections 写入权限） |

### 3.2 Reflection Agent 的最小 tools 清单

```
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

不包含任何写工具（`Write` / `Edit` / `Bash` / `opc_knowledge_write`）。
此清单由 C4 PoC 验证（Host 在工具列表层面裁剪，未白名单工具不可见），
OPC server 端同时按 `dispatch_context.role` 做二次拒绝。

### 3.3 Task Agent 的最小 tools 清单

```
tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
  - WebFetch
  - WebSearch
  - opc_knowledge_open
  - opc_knowledge_read
  - opc_knowledge_write
  - opc_corrections
```

Task agent 需要写权限来修改代码和写入 knowledge。

### 3.4 工具名规范

OPC 工具使用合并后的名称（见 [07-tool-consolidation](../../feature/07-tool-consolidation/00_overview.md)）：

| 用途 | 工具名 |
|---|---|
| 初始化 knowledge | `opc_knowledge_open` |
| 读取 knowledge | `opc_knowledge_read` |
| 写入 knowledge | `opc_knowledge_write` |
| 管理 knowledge | `opc_knowledge_admin` |
| 查询/记录纠正 | `opc_corrections` |

禁止使用旧的拆分工具名（如 `opc_knowledge_list`、`opc_corrections_query`）。

### 3.5 工具声明校验

`opc-kit validate` 命令检查：

```
对每个 agent.md:
    ① name == 文件名 ✓
    ② description 非空且 ≤ 150 字符 ✓
    ③ model 在允许值列表中 ✓
    ④ tools 至少含 1 个工具 ✓
    ⑤ 若 agent 在 reflection/ 目录 → tools 不含 Write/Edit/Bash/opc_knowledge_write ✓
    ⑥ 若 agent 在 dev/ 目录 → tools 含 opc_knowledge_write ✓
```

## 四、Body 内容约定

### 4.1 结构

```markdown
# <agent 名称>

<一句话角色说明>

## 主要场景
<该 agent 最常被调用的场景列表>

## 可用工具
<简要说明每个工具的用途，帮助 agent 选择正确的工具>

## 约束
<该 agent 的行为约束：不可做什么、输出格式等>
```

### 4.2 长度

Body 建议 ≤ 500 行。过于冗长的 system prompt 会与 `enhanced_prompt` 中的
corrections 片段和 reflection 指令争抢 context window。

### 4.3 语言

Body 语言与 agent 的主要使用者一致。面向中文用户的 kit 用中文，
面向国际用户的 kit 用英文。

## 五、Agent 角色的工具边界（OPC 视角）

以下边界由 OPC server 在运行时 enforce，与 `tools` whitelist 形成双保险：

| 调用方 | 可读 corrections | 可写 corrections | 可读 knowledge | 可写 knowledge |
|---|---|---|---|---|
| Host（Claude 主进程） | ✅ | ✅ | ✅ | ✅ |
| Task sub-agent (dev/design/qa) | ✅ | ✅ | ✅ | ✅ |
| Reflection sub-agent (critic/debater/ToT) | ✅ | ❌ | ✅ | ❌ |
| Distiller sub-agent | ✅ | ✅ (仅 corrections) | ✅ | ❌ |

**第三条线**：即使 kit 配错让某个 reflection agent 的 `tools` 误开了写工具，
OPC server 内部仍按上表的 `dispatch_context.role` 拒绝写入。

## 六、校验与 CI 集成

### 6.1 本地校验

```
opc-kit validate <kit-path>
```

返回：

```
✓ 27 agents validated
  6 categories: product(3), design(4), dev(6), infra(3), qa(5), reflection(6)
  0 errors, 0 warnings
```

### 6.2 CI 校验

kit PR 合并前自动运行 `opc-kit validate`。校验失败阻止合并。

校验项：
- 所有 agent.md 的 frontmatter 字段完整
- reflection agent 不含写工具
- name 与文件名一致
- description 非空且不超长
- model 值为合法枚举

## 七、相关文档

- [00 Host 契约总览](./00_overview.md) — C4 `tools` enforce 的验证结果
- [02 Sub-Agent 降级方案](./02_subagent-fallback-plans.md) — C3/C4 失效时的预案
- [04 HTTP/SSE 部署](./04_http-sse-deployment.md) — 不同部署形态下的 agent 配置
- [07-tool-consolidation](../../feature/07-tool-consolidation/00_overview.md) — 工具名合并规范
