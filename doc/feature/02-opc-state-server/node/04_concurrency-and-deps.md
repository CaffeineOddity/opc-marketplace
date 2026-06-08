# 04 并发执行与依赖解析

node-resolver 在 `opc_phase_confirm` 时执行依赖解析 + 并发组分配 + 文件域冲突检测。

---

## 一、文件域隔离

跨 node 的并行由 resolver 的 Group 机制控制。并行执行时检查两层冲突：

1. **artifacts 冲突**：`output.artifacts` 路径重叠 → 降级串行
2. **knowledge 冲突**：`output.knowledge` 路径重叠 → 降级串行

```
Group 1: [backend-endpoint → src/api/], [frontend-component → src/components/]
         文件域无重叠，knowledge 无重叠 → 安全并行 ✓

Group 2: [tdd-implementation → src/, tests/], [backend-endpoint → src/api/]
         文件域重叠 src/ → 降级为串行

Group 3: [api-design → knowledge: user-auth/session/api],
         [database-schema → knowledge: user-auth/session/api]
         knowledge 路径重叠 → 降级为串行
```

冲突检测基于路径前缀匹配（不区分大小写）：`src/` 与 `src/api/` 视为重叠。

---

## 二、依赖解析

node-resolver 输入选中节点列表，通过匹配 output → input 自动推导依赖：

```
输入: [api-design, tdd-implementation, security-review]

output → input 匹配:
  api-design.output:           [user-auth/login/api, user-auth/session/api]
  tdd-implementation.input:    [user-auth/login/api, user-auth/session/api] → 依赖 api-design
  security-review.input:       [] → 无依赖

拓扑排序:
  Group 1: [api-design]
  Group 2: [tdd-implementation]
  Group 3: [security-review]  ← 可与 Group 2 并行（无共同依赖）
```

---

## 三、blocked_by 双写

Claude 在 `opc_phase_confirm` 时可传 `blocked_by`，但 node-resolver 会再校验一次：

- 用户传的 `blocked_by` 与 input/output 推导一致 → 接受
- 不一致 → 以推导为准 + 写 warning
- 用户漏传 → 自动补全

---

## 相关文档

- [02_field-spec.md](02_field-spec.md) — `input` / `output` 字段定义
- [../phase/05_phase-confirm-execute.md](../phase/05_phase-confirm-execute.md) — `opc_phase_confirm` 触发解析
- [08_internal-engines.md](08_internal-engines.md) — node-resolver 内部实现
