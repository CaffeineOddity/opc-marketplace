# 01 9 阶段总览与 phase.md

阶段是管线执行的最小语义单元。整个项目周期由 9 个标准阶段组成；每个阶段目录自包含：`phase.md` + `nodes/` + `templates/`。

---

## 一、9 阶段

```
phases/
├── 00-ideation/            # 构思 —— 想法验证、可行性分析
├── 01-validation/          # 验证 —— 市场验证、用户调研
├── 03-design/              # 设计 —— UI/UX、品牌设计
├── 04-implement-design/    # 实现设计 —— API 设计、数据库 schema、脚手架
├── 05-implement/           # 编码实现 —— 编码、TDD
├── 06-testing/             # 测试 —— QA、安全审计
├── 07-release/             # 发布 —— 部署、CI/CD
├── 08-growth/              # 增长 —— 营销、SEO
└── 09-scale/               # 规模化 —— 性能优化、架构演进
```

阶段编号代表推荐顺序，但 task-analysis 可根据任务复杂度只挑选其中几个。`02-` 编号已废弃保留位以容纳未来扩展。

> 子集的声明、校验与持久化位置：[`state.json` → `phase_plan`](../02-pipeline/04_state-json.md#六phase_plan-校验规则deterministic)（含 `available` / `selected` / `selected_by` / `selection_rationale` + 偏序校验）。

---

## 二、phase.md — 阶段元信息

```markdown
---
phase: 04-implement-design
name: 实现设计
description: API 设计、数据库 schema、脚手架搭建
order:
  prev: 03-design
  next: 05-implement
---

## 目标
基于任务简报（brief.md）完成 API 设计、数据库建模和项目脚手架。

## 职责
- 读取 brief 理解任务目标、约束和已有知识状态
- 设计 API 端点、数据库 schema
- 搭建项目脚手架，为编码阶段做准备
- 所有选中节点执行完毕后进入下一阶段
```

`phase.md` 不参与节点选择，只是给 Agent / 用户提供阶段语义说明。`order.prev` / `order.next` 由 `opc_phase_complete` 用于自动推进。

---

## 相关文档

- [02_node-selection.md](02_node-selection.md) — 节点选择策略
- [03_scenarios.md](03_scenarios.md) — Scenario 场景配方
- [04_phase-start.md](04_phase-start.md) — `opc_phase_start` 工具细节
