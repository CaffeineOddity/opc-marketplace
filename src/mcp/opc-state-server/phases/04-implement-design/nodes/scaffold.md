---
name: scaffold
tags: [fullstack, infra]
description: 项目脚手架搭建（目录、构建、Lint、基础依赖）
agents:
  primary: [fullstack-engineer]
  fallback: [backend-engineer, frontend-developer]
input: []
output:
  - path: scaffold/structure
    type: knowledge
  - path: scaffold/tooling
    type: knowledge
quality_gates:
  L1: [build, lint]
  L2: []
always_show: false
---

## 脚手架节点

为编码阶段（05-implement）准备最小可运行的项目骨架。仅在新项目或重大目录调整时启用；已有项目的 add-feature 场景通常跳过。

### 执行步骤

1. **确定栈选型**：基于 brief.md 与已有依赖选 framework / build tool / linter / test runner。
2. **建目录骨架**：源码目录、配置目录、测试目录、文档目录。
3. **基础配置**：
   - package.json / pyproject.toml / pom.xml（最小依赖集）
   - Lint + format（如 eslint+prettier / ruff / golangci-lint）
   - TypeScript / mypy 等类型工具（若适用）
   - 测试框架 + 一个 smoke test 验证骨架可跑
4. **build + lint 必须 PASS**（L1 quality gate）
5. **写知识**：
   - `scaffold/structure` — 目录树 + 每个目录的职责
   - `scaffold/tooling` — 工具链与配置选型理由

### 何时使用

- 新项目首次执行 04-implement-design 阶段
- 大规模目录重构（与现有 scaffold 不兼容时）

### 何时跳过

- 已有项目的 add-feature 任务（脚手架已存在）
- bug-fix 任务（不修改项目结构）
- refactor 任务（除非重构涉及目录调整）

> 注：本节点 `tags: [fullstack, infra]` 与典型 add-feature 任务的 tags `[backend, auth, database]` 无交集，所以 tag-filter 默认排除。仅当任务 tags 显式包含 `fullstack` / `infra` 时才会被选中。
