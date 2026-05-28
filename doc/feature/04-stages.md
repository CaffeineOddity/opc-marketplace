# 阶段（Stage）

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

每个阶段目录包含 5 个文件：

---

## stage.md

阶段元信息。定义阶段的目标、角色和约束条件。

```markdown
---
stage: 04-implementation
name: 实现
description: 编码实现，TDD 驱动，逐节点交付

roles:
  required: [backend-engineer, frontend-engineer]
  optional: [architect, security-engineer]

order:
  prev: 03-design
  next: 05-testing

constraints:
  max_parallel_nodes: 3
  require_user_approval: true
---

## 目标
将设计阶段的产出转化为可运行的代码。

## 职责
- 按节点逐项实现功能
- 每个节点遵循 TDD 流程
- 通过 exit-gates 后进入测试阶段
```

---

## entry-gates.md

进入阶段的前置条件。每个 gate 包含求值逻辑，gate-evaluator 逐条检查。

```markdown
---
stage: 04-implementation
mode: all                  # all: 全部通过 / any: 任一通过
---

## spec-exists
- type: artifact
  path: opc-deliverables/02-planning/spec.md
  rule: file_exists

## architecture-reviewed
- type: artifact
  path: opc-deliverables/02-planning/architecture.md
  rule: file_exists

## design-approved
- type: knowledge
  category: planning
  doc: architecture
  rule: status_is_final

## project-scaffolded
- type: filesystem
  paths: [src/, tests/, package.json]
  rule: all_exist
```

Gate 类型：

| type | rule | 说明 |
|------|------|------|
| `artifact` | `file_exists` | 文件存在 |
| `artifact` | `file_not_empty` | 文件存在且非空 |
| `knowledge` | `status_is_final` | 知识条目状态为 final |
| `knowledge` | `status_is_draft_or_final` | 知识条目存在（不限状态） |
| `filesystem` | `all_exist` | 指定路径全部存在 |
| `filesystem` | `any_exist` | 指定路径至少一个存在 |
| `custom` | _(表达式)_ | 自定义求值逻辑 |

---

## exit-gates.md

退出阶段的条件。与 entry-gates 结构相同，语义不同——未通过则阶段不可退出。

```markdown
---
stage: 04-implementation
mode: all
---

## tests-passing
- type: command
  run: "npm test -- --ci"
  rule: exit_code_is(0)

## coverage-80pct
- type: command
  run: "npm test -- --coverage --coverageThreshold='{\"global\":{\"lines\":80}}'"
  rule: exit_code_is(0)

## verification-complete
- type: hook
  name: verification-gate
  rule: hook_passed

## all-artifacts-committed
- type: vcs
  paths: [src/, tests/]
  rule: no_uncommitted_changes
```

Gate 类型（exit 额外支持）：

| type | rule | 说明 |
|------|------|------|
| `command` | `exit_code_is(0)` | 执行命令，检查退出码 |
| `command` | `stdout_contains(<pattern>)` | 执行命令，检查输出 |
| `hook` | `hook_passed` | 对应 hook 全部通过 |
| `vcs` | `no_uncommitted_changes` | 指定路径无未提交变更 |

---

## nodes.md

该阶段关联的节点来源和选择规则。capability-discovery hook 在 SessionStart 时扫描所有 kit 的 node 文件，按 `stage` 字段归类，自动填充节点来源列表。nodes.md 只需定义选择策略。

```markdown
---
stage: 04-implementation
selection:
  require_user_approval: true
  max_selected: 5
  min_selected: 1
---

## 选择规则

### 1. tag 交集过滤
任务 tags 与每个节点 tags 求交集。交集为 0 的节点默认排除（除非标记 `always_show: true`）。

### 2. 语义匹配排序
剩余节点按 match_description 与任务描述的相似度降序排列。

### 3. Scenario 加权
命中 scenario 推荐的节点获得 +0.3 权重加成。

## 节点来源（由 capability-discovery 自动生成）

<!-- BEGIN_NODES -->
<!-- END_NODES -->
```

`<!-- BEGIN_NODES -->` 到 `<!-- END_NODES -->` 之间由 capability-discovery hook 自动注入扫描结果，列出所有 `stage: 04-implementation` 的节点。

---

## deliverables.md

阶段完成后必须产出的交付物清单。node-exit 时逐项检查。

```markdown
---
stage: 04-implementation
strict: true               # true: 全部必须 / false: 按 node 动态决定
---

## 代码
- [ ] src/ 目录有新增或修改
- [ ] tests/ 目录有对应测试

## 知识产出
- [ ] opc-knowledge/{feature}/implementation/tech.md (status: draft)

## 约束
- [ ] 无 TODO/FIXME 残留
- [ ] CI 通过

## 交付物
- [ ] 功能可运行的入口点或集成测试
```
