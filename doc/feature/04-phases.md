# 阶段（Phase）

## 9 阶段

```
00-ideation       构思 —— 想法验证、可行性分析
01-validation     验证 —— 市场验证、用户调研
02-planning       规划 —— 技术选型、架构设计
03-design         设计 —— UI/UX、品牌设计
04-implementation 实现 —— 编码、TDD
05-testing        测试 —— QA、安全审计
06-release        发布 —— 部署、CI/CD
07-growth         增长 —— 营销、SEO
08-scale          规模化 —— 性能优化、架构演进
```

每个阶段目录包含 2 个文件。

---

## phase.md

阶段元信息。定义阶段的目标和前后关系。

```markdown
---
phase: 04-implementation
name: 实现
description: 编码实现，TDD 驱动，逐节点交付

order:
  prev: 03-design
  next: 05-testing
---

## 目标
将设计阶段的产出转化为可运行的代码。

## 职责
- 按节点逐项实现功能
- 每个节点遵循 TDD 流程
- 所有选中节点执行完毕后进入下一阶段
```

---

## nodes.md

该阶段关联的节点来源和选择规则。capability-discovery hook 在 SessionStart 时扫描所有 kit 的 node 文件，按 `phase` 字段归类，自动填充节点来源列表。nodes.md 只需定义选择策略。

```markdown
---
phase: 04-implementation
selection:
  require_user_approval: true
  max_selected: 5
  min_selected: 1
---

## 选择规则

### 1. tag 交集过滤
任务 tags 与每个节点 tags 求交集。交集为 0 的节点默认排除（除非标记 `always_show: true`）。

### 2. 语义匹配排序
剩余节点按 description 与任务描述的语义相似度降序排列。

### 3. Scenario 加权
命中 scenario 推荐的节点获得 +0.3 权重加成。

## 节点来源（由 capability-discovery 自动生成）

<!-- BEGIN_NODES -->
<!-- END_NODES -->
```

`<!-- BEGIN_NODES -->` 到 `<!-- END_NODES -->` 之间由 capability-discovery hook 自动注入扫描结果，列出所有 `phase: 04-implementation` 的节点。

