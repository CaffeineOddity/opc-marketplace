# 03 — Deprecated Alias 规范

> 本章定义旧工具名的 alias 转发机制、deprecation warning 文案、
> tombstone 处理、M19 wire 层集成规范、以及多版本支持生命周期。
> 实现位于 `shared/tool-aliases/`（`@opc/tool-aliases` 包）。

## 一、核心机制

### 1.1 ALIAS_MAP

`shared/tool-aliases/src/index.ts` 中的 `ALIAS_MAP` 是唯一真相源：
54 个旧工具名 → 24 个新工具名 + discriminator 值的完整映射。

```typescript
// 示例：旧工具 opc_reflect_cove → 新工具 opc_reflect_execute({method:"cove"})
"opc_reflect_cove": {
  tool: "opc_reflect_execute",
  discriminator: { field: "method", value: "cove" },
}

// 示例：保留不变的工具
"opc_flow_query": {
  tool: "opc_flow_query",
  discriminator: null,
}
```

每个旧工具名是 key，value 包含：
- `tool`：新工具名
- `discriminator`：若旧工具被吸收到 facade，指定 discriminator 字段和值；否则 `null`
- `notes`：可选的人类可读说明

### 1.2 resolveAlias()

```typescript
function resolveAlias(toolName: string): MappingTarget | null
```

Wire 层（M19）在收到 MCP 工具调用时：

```
① resolveAlias(calledToolName)
    ├── 在 ALIAS_MAP 中找到 + 不是自身 → deprecated=true，转发到新 (tool, discriminator)
    ├── 在 ALIAS_MAP 中找到 + 是自身 → deprecated=false，正常执行
    ├── 在 TOMBSTONES 中 → throw Error（返回给调用方）
    ├── 在 NEW_TOOLS 中 → 正常执行（直接匹配新名）
    └── 都不在 → null，返回 "Unknown tool" 错误
```

## 二、Deprecation Warning 格式

### 2.1 Warning 文案

当调用方使用旧工具名时，server 返回 deprecation warning：

```json
{
  "_warning": {
    "code": "TOOL_DEPRECATED",
    "message": "opc_reflect_cove is deprecated. Use opc_reflect_execute({method:\"cove\"}) instead.",
    "deprecated_name": "opc_reflect_cove",
    "canonical_name": "opc_reflect_execute",
    "discriminator": { "field": "method", "value": "cove" },
    "removal_version": "v3.0.0",
    "migration_guide": "https://github.com/CaffeineOddity/opc-marketplace/blob/main/doc/feature/07-tool-consolidation/00_overview.md"
  }
}
```

### 2.2 一次性提示

每个 (session, deprecated_tool) 组合只警告一次。
首次调用发出 warning，后续同 session 内同旧名调用静默转发。

```typescript
// Session 级别去重
const warnedInSession = new Set<string>();

function maybeWarn(sessionId: string, toolName: string): boolean {
  const key = `${sessionId}:${toolName}`;
  if (warnedInSession.has(key)) return false;
  warnedInSession.add(key);
  return true;
}
```

### 2.3 Warning 不阻塞

Deprecation warning 是 advisory，不阻塞工具执行。
旧名调用的行为与新名调用完全一致（转发到同一实现）。

## 三、Tombstone 处理

### 3.1 TOMBSTONES 定义

```typescript
const TOMBSTONES = {
  "opc_phase_adjust": "deleted; replaced by reflection loop self-correction"
};
```

Tombstone 是**硬删除**的工具——不转发、不降级、直接拒绝。

### 3.2 拒绝响应

```
调用 opc_phase_adjust(...)
    ↓
resolveAlias("opc_phase_adjust")
    ↓
throw Error("tool opc_phase_adjust was removed: deleted; replaced by reflection loop self-correction")
    ↓
M19 wire 层捕获 → 返回 MCP error:
{
  "error": "tool_removed",
  "tool": "opc_phase_adjust",
  "reason": "deleted; replaced by reflection loop self-correction",
  "alternative": "Use opc_reflect_execute({method:\"critique\"}) for phase-level self-correction."
}
```

## 四、M19 Wire 层集成

### 4.1 工具注册

M19 向 MCP client 只注册 24 个新工具（`NEW_TOOLS` 列表）。
旧工具名不在注册列表中，但 wire 层仍能响应旧名调用（通过 alias 转发）。

### 4.2 调用处理流程

```
MCP client 调用 toolName
    │
    ├── ① resolveAlias(toolName)
    │       ├── 找到 + deprecated=true → ②
    │       ├── 找到 + deprecated=false → ③
    │       └── null → 返回 "Unknown tool"
    │
    ├── ② 发出 deprecation warning（去重）
    │       注入 discriminator 字段到 args
    │       toolName = canonicalToolName
    │       ↓
    ├── ③ 按 (canonicalToolName, discriminator) 路由到 handler
    └── ④ handler 执行 + 返回结果（含 _warning 如有）
```

### 4.3 Discriminator 注入

当旧工具映射到新工具 + discriminator 时，wire 层自动注入 discriminator：

```typescript
// 调用方传: { name: "opc_reflect_cove", args: { step: "P1", artifact: {...} } }
// wire 层转发: { name: "opc_reflect_execute", args: { method: "cove", step: "P1", artifact: {...} } }
```

注入的 discriminator 值不覆盖调用方显式传入的同名字段（调用方值优先）。

## 五、多版本支持生命周期

### 5.1 版本周期

```
v2.x (当前):
    ✅ 新工具名正常工作
    ✅ 旧工具名转发 + deprecation warning
    ✅ TOMBSTONES 硬拒绝

v3.0 (未来):
    ❌ 旧工具名从 ALIAS_MAP 中移除
    ✅ 旧工具名调用返回 "Unknown tool"
    ✅ TOMBSTONES 保留
```

### 5.2 移除策略

在 v2.x 的最后一个 minor 版本中（如 v2.9），开始打印升级提醒：

```json
{
  "_warning": {
    "code": "TOOL_DEPRECATED_FINAL",
    "message": "opc_reflect_cove will be removed in v3.0.0. Last chance to migrate.",
    "removal_version": "v3.0.0"
  }
}
```

### 5.3 过渡期保证

| 版本 | 旧名行为 | 新名行为 |
|---|---|---|
| v1.x | 旧名正常工作（无 deprecation） | N/A |
| v2.x | 旧名转发 + warning | 新名正常工作 |
| v3.x | 旧名 = Unknown tool | 新名正常工作 |

过渡期 = v2.x 整个生命周期（预计 2-3 个月）。

## 六、PROTECTED_ANCHORS 与 EXEMPT_ANCHORS

### 6.1 保护锚点

`shared/tool-aliases/src/index.ts` 中的 `PROTECTED_ANCHORS` 和 `EXEMPT_ANCHORS`
数组是 registry-guard 的判别数据源。已经从简单的"工具名列表"升级为
"(tool, discriminator?) 对"：

```typescript
// 旧：按工具名保护
if PROTECTED_TOOLS.includes(toolName) → guard

// 新：按 (工具名, discriminator值?) 保护
if isProtected(toolName, discriminatorValue) → guard
```

### 6.2 特殊规则

- `opc_flow_correct` 整个工具豁免（任意 discriminator 值），spec §4.4
- `opc_pipeline_lifecycle` 仅在 `action="complete"` 时受保护，`action="abort"|"replan"` 豁免
- `opc_node_finish` 所有 status 值豁免（sub-agent 回报通道）

## 七、测试要求

### 7.1 数据锁定测试

`shared/tool-aliases/src/index.test.ts` 必须包含：

```
① ALIAS_MAP 的 key 数 = 54（与 spec §1.1 一致）
② NEW_TOOLS 的长度 = 24（与 spec §2.2 一致）
③ 每个 PROTECTED_ANCHOR 对应的旧名在 ALIAS_MAP 中存在
④ 每个 EXEMPT_ANCHOR 对应的旧名在 ALIAS_MAP 中存在
⑤ resolveAlias(旧名) 返回正确的 (tool, discriminator)
⑥ resolveAlias(tombstone名) 抛出 Error
⑦ isProtected/isExempt 的 (tool, discriminator?) 判定逻辑
⑧ opc_flow_correct 任意 discriminator 豁免
```

### 7.2 回归测试

工具合并后，所有现有 476 个测试保持通过。
测试中使用的工具名已更新为新名（通过前序 batch 替换），此包是纯数据模块。

## 八、相关文档

- [00 工具合并总览](./00_overview.md) — 54→24 映射表
- [01 Discriminator Schema 示例](./01_discriminator-schema-examples.md) — 24 工具的完整 JSON Schema
- [02 迁移 Checklist](./02_migration-checklist.md) — 文档更新 checklist
- [shared/tool-aliases/src/index.ts](../../../shared/tool-aliases/src/index.ts) — 实现
- [shared/tool-aliases/src/index.test.ts](../../../shared/tool-aliases/src/index.test.ts) — 测试
