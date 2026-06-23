# 01 节点类型与定义

节点（node）是阶段执行的最小单元。每个节点一个 markdown 文件，frontmatter 描述能力，body 描述执行指令。

---

## 一、节点类型

| 类型 | 标识 | 驱动对象 | 执行者 |
|------|------|---------|--------|
| 管线控制节点 | `used_by: [orchestrator, ...]` | 意图识别、任务分析、阶段执行 | engine |
| 任务执行节点 | `phase: 05-implement` | 编码、测试、设计 | Agent |

两类格式完全相同。

- **控制节点**：`src/mcp/opc-state-server/prompts/`，不可项目覆盖，由 flow tools 在工具返回里引用
- **任务节点**：`.opc/phases/<phase>/nodes/`（首次启动从内置 `phases/` bootstrap），可项目编辑

---

## 二、节点定义示例

```markdown
---
name: tdd-implementation
phase: 05-implement
description: TDD 驱动的后端功能实现，RED → GREEN → REFACTOR
tags: [backend, database]
agents:
  primary: [backend-engineer]
  optional: [database-engineer]
skills: [test-driven-development]
mode: parallel

input:
  - knowledge: user-auth/login/spec
  - knowledge: user-auth/login/architecture
  - knowledge: user-auth/session/api

output:
  - artifacts: [tests/, src/]
  - knowledge: user-auth/session/api

quality_gates:
  - test_pass
  - lint_pass
---

## TDD 功能实现

### RED —— 先写失败测试
1. 根据 spec.md 中的验收标准，编写测试用例
2. 运行测试，确认测试失败

### GREEN —— 最小实现
1. 编写刚好能让测试通过的代码
2. 不要过度设计

### REFACTOR —— 重构
1. 消除重复代码，改善命名和结构
2. 运行测试，确认仍然全部通过
```

---

## 相关文档

- [02_field-spec.md](02_field-spec.md) — 全部 frontmatter 字段规范
- [06_source-and-override.md](06_source-and-override.md) — 节点项目覆盖机制
