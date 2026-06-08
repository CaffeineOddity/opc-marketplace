# 03 Scenario 场景配方

Scenario 是按业务场景预定义的推荐节点组合，用于在节点选择时给候选节点加权（+0.3）。也可作为快速启动模板。

---

## 一、可用 Scenarios

```
platform/opc-orchestrator/scenarios/
├── build-saas.md, build-mobile-app.md
├── add-feature.md, fix-bug.md
├── security-audit.md, redesign-product.md
├── performance-optimize.md, launch-product.md
└── incident-response.md
```

---

## 二、Scenario 示例

```markdown
# Scenario: add-feature

## 推荐
- 04-implement-design: api-design, database-schema, scaffold
- 05-implement: tdd-implementation
- 06-testing: integration-test (+ security-scan 如涉及安全)

## 常见变化
- 只需后端 → 跳过前端节点
- 涉及认证 → 增加 auth-integration
- 新项目 → 增加 scaffold
```

---

## 三、用法

Scenario 也可作为快速启动模板：用户直接声明 "用 add-feature 模板"，跳过信号匹配，直接使用推荐节点。

在 `opc_phase_start` 返回中通过 `scenario` 字段透传给 Claude，由 Claude 在匹配排序时给推荐节点 +0.3 权重加成（详见 [02_node-selection.md §二](02_node-selection.md#二claude-的匹配排序)）。

---

## 相关文档

- [02_node-selection.md](02_node-selection.md) — Scenario 加权机制
- [../intent-analysis/06_task-analysis.md](../intent-analysis/06_task-analysis.md) — task-analysis 推断 scenario_hints
