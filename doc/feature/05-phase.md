# 阶段

每个阶段目录自包含：phase.md + nodes.md + nodes/ + templates/。阶段根据任务信号自主选择节点，node-resolver 自动解析依赖并生成执行计划。

---

## 一、9 阶段

```
phases/
├── 00-ideation/            # 构思 —— 想法验证、可行性分析
│   ├── phase.md, nodes.md, nodes/, templates/
├── 01-validation/          # 验证 —— 市场验证、用户调研
│   ├── phase.md, nodes.md, nodes/, templates/
├── 03-design/              # 设计 —— UI/UX、品牌设计
│   ├── phase.md, nodes.md, nodes/, templates/
├── 04-implement-design/    # 实现设计 —— API 设计、数据库 schema、脚手架
│   ├── phase.md, nodes.md, nodes/, templates/
├── 05-implement/           # 编码实现 —— 编码、TDD
│   ├── phase.md, nodes.md, nodes/, templates/
├── 06-testing/             # 测试 —— QA、安全审计
│   ├── phase.md, nodes.md, nodes/, templates/
├── 07-release/             # 发布 —— 部署、CI/CD
│   ├── phase.md, nodes.md, nodes/, templates/
├── 08-growth/              # 增长 —— 营销、SEO
│   ├── phase.md, nodes.md, nodes/, templates/
└── 09-scale/               # 规模化 —— 性能优化、架构演进
    ├── phase.md, nodes.md, nodes/, templates/
```

---

## 二、phase.md

阶段元信息。以 04-implement-design 为例：

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

---

## 三、nodes.md — 选择策略

`opc_phase_start` 扫描 `phases/<phase>/nodes/` 和项目 `opc-nodes/`，自动填充节点列表。nodes.md 定义选择策略。

### 3.1 两层匹配

**tag 交集过滤**：任务 tags 与节点 tags 求交集，交集为 0 的排除（`always_show: true` 除外）。

**语义匹配排序**：任务 description 与节点 description 语义相似度降序排列。

**Scenario 加权**：命中 scenario 推荐的节点 +0.3 权重加成。

```
节点匹配得分 = 语义相似度 × 0.7 + scenario 加权 × 0.3

例: add-feature 推荐的节点:
  - api-design:        +0.3 weight
  - database-schema:   +0.3 weight
  - tdd-implementation: +0.3 weight
```

### 3.2 反思轮次

每个 phase 独立配置 `max_reflection_rounds`：

| Phase | 节点数 | medium | high | 理由 |
|-------|--------|--------|------|------|
| 00-ideation | 3 | 4 | 6 | 方向性探索，需多轮试错 |
| 01-validation | 2 | 2 | 4 | PRD/画像，少量关键决策 |
| 03-design | 7 | 3 | 5 | UI/UX 视觉决策需迭代 |
| 04-implement-design | 3 | 2 | 4 | API/DB 设计决策关键 |
| 05-implement | 7 | 3 | 5 | 节点最多，依赖链长 |
| 06-testing | 1 | 1 | 2 | 验证性为主 |
| 07-release | 2 | 1 | 2 | 操作性强 |
| 08-growth | 1 | 2 | 3 | 营销/SEO 策略需权衡 |
| 09-scale | 1 | 2 | 4 | 架构演进影响面大 |

low 复杂度不走管线。

nodes.md 声明示例：

```markdown
---
phase: 04-implement-design
phase_review:
  min_confidence_for_auto: 0.85
  max_reflection_rounds:
    medium: 2
    high: 4
---
```

### 3.3 置信度阈值

| Phase | `min_confidence_for_auto` | 理由 |
|-------|--------------------------|------|
| 00-ideation | 0.75 | 探索性强，允许 AI 自主尝试 |
| 01-validation | 0.80 | PRD 影响后续全链路 |
| 03-design | 0.80 | UI/UX 主观性强 |
| 04-implement-design | 0.85 | API/DB 设计决策关键 |
| 05-implement | 0.80 | 节点多但操作性为主 |
| 06-testing | 0.70 | 验证性为主，低风险 |
| 07-release | 0.85 | 部署涉及生产环境 |
| 08-growth | 0.75 | 营销策略可逆 |
| 09-scale | 0.90 | 架构演进影响面大 |

| 置信度 vs 阈值 | 节点选择 | 阶段推进 |
|--------------|---------|---------|
| ≥ `min_confidence_for_auto` | AI 自行确定节点列表 | `auto_advance: true`，直接推进 |
| < `min_confidence_for_auto` | 展示候选列表，请求确认 | `auto_advance: false`，提示确认 |

---

## 四、Scenario（场景配方）

### 4.1 可用 Scenarios

```
platform/opc-orchestrator/scenarios/
├── build-saas.md, build-mobile-app.md
├── add-feature.md, fix-bug.md
├── security-audit.md, redesign-product.md
├── performance-optimize.md, launch-product.md
└── incident-response.md
```

### 4.2 Scenario 示例

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

Scenario 也可作为快速启动模板：用户直接声明 "用 add-feature 模板"，跳过信号匹配，直接使用推荐节点。

---

## 五、阶段生命周期

```
opc_phase_start → 扫描节点 → 匹配排序 → 反思调整 → opc_phase_confirm
    → 逐 node 执行 → opc_phase_complete → 推进/确认
```

### 5.1 opc_phase_start — 扫描与匹配

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 扫描 phases/<phase>/nodes/ + opc-nodes/
  → tag 交集过滤 → 语义匹配排序 → scenario 加权
  → 返回候选节点列表

返回:
{
  phase: "04-implement-design",
  candidates: [
    {name: "api-design", score: 0.92, tags: ["api", "design"], recommended: true},
    {name: "database-schema", score: 0.78, tags: ["database"], recommended: true},
    {name: "scaffold", score: 0.65, tags: ["scaffold"], recommended: false}
  ],
  max_reflection_rounds: 2
}
```

### 5.2 反思调整

轮次由 `max_reflection_rounds` 控制：

- **缺漏**：是否有该做但未选中的节点？
- **多余**：是否有不必要或重复的节点？
- **合并/拆分**：相似节点合并？过大节点拆分？
- 达到上限后强制确认

```
初始方案 → 预览执行计划 → 反思调整 → 重新预览 → ... → 确认
```

调整通过 `opc_phase_adjust(pipeline_id, sub_id, phase, nodes: [...])` 重新生成预览。

### 5.3 opc_phase_confirm — 锁定执行计划

```
参数: pipeline_id, sub_pipeline_id, phase, nodes: [{name, blocked_by?}]

行为:
  → node-resolver 解析依赖（即使用户传了 blocked_by 也校验 + 修正）
  → 文件域冲突检查（artifacts + knowledge 路径重叠 → 降级串行）
  → 写入 state.json phases[].nodes[] + blocked_by
  → 快照当前 phase 节点的 output.knowledge 路径 → .opc/snapshots/
  → 锁定后不可再 opc_phase_adjust

返回: 执行分组 [{group: 1, nodes: [...], parallel: true}, ...]
```

### 5.4 执行节点

逐组执行，每个 node 走完整流程（详见 [06 节点](06-node.md)）：

```
opc_node_start → Agent 加载知识 → 执行 → opc_node_complete / opc_node_fail
```

### 5.5 opc_phase_complete — 阶段完成

```
参数: pipeline_id, sub_pipeline_id, phase

返回:
{
  phase: "04-implement-design",
  status: "completed",
  next_phase: "05-implement",
  auto_advance: true,
  next_phase_message: "进入 05-implement 编码阶段"
}
```

调用方根据 `auto_advance` 决定：true → 直接 `opc_phase_start`；false → 提示用户确认。

### 5.6 opc_phase_reset — 阶段重置

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 检查 .opc/snapshots/ 有无快照
    ├── 有 → 复制快照回 opc-knowledge/ 对应路径
    └── 无 → 报错
  → 该 phase → pending（node 全部重置）
  → 下游 phase → pending

限制:
  - 仅恢复 opc-knowledge/ 下的 .md 文件，不碰 src/
  - 管线 aborted 后不可 reset（快照已清理）
```

### 5.7 分层回退策略

| 层 | 场景 | 工具 |
|----|------|------|
| L0 | 调整节点选择 | `opc_phase_adjust` |
| L1 | 重做单个产出 | `opc_node_retry`（级联重置下游） |
| L2 | 废弃整个 phase 知识 | `opc_phase_reset`（快照恢复） |
| L3 | 全量回退（知识+代码） | git checkout/revert（OPC 不封装） |

---

## 六、节点来源

`opc_phase_start` 扫描两个来源，同名节点项目覆盖内置：

| 来源 | 位置 | 说明 |
|------|------|------|
| 内置节点 | `phases/<phase>/nodes/` | 随 marketplace 分发 |
| 项目节点 | `opc-nodes/` | 同目录结构，同名覆盖 |

---

## 七、/comma 命令：阶段独立运行与测试

`/comma` 命令允许在不启动完整管线的情况下，单独运行和测试任意阶段。

### 命令格式

```
/comma <phase-id> [选项]
```

| 选项 | 说明 |
|------|------|
| `--pipeline <id>` | 在已有管线上下文中运行 |
| `--dry-run` | 测试模式：执行但不持久化 |
| `--mock-inputs` | 自动生成 mock 知识数据，满足 node 的 input.knowledge 要求 |
| `--nodes <list>` | 指定运行的节点子集 |
| `--report <path>` | 执行报告输出路径 |

### 运行模式

**独立模式**（无 `--pipeline`）：创建临时管线上下文，执行完毕后自动清理（dry-run）或保留产物。

**附加模式**（有 `--pipeline`）：在已有管线上下文中运行，复用 brief + state。

### 输入处理

```
① opc_knowledge_get 检查 opc-knowledge/ 中是否已有知识
  → 有 → 直接使用
  → 无 → 进入 ②

② 检查 --mock-inputs
  → 是 → 生成 mock 数据（_mock: true, version: 0）
  → 否 → 打印缺失清单，提示用户
```

### dry-run vs 正常执行

| 行为 | 正常执行 | dry-run |
|------|---------|---------|
| knowledge 写入 | 正常写入 | 跳过 |
| L1 校验 | 执行 | 跳过 |
| L2 校验 | 执行 | 执行 |
| state.json | 正常更新 | 临时，结束后删除 |

### MCP 工具

对应 `opc_phase_run`，详见 [08 MCP 服务](08-mcp.md)。

---

## 八、相关文档

- [02 意图识别与任务分析](02-intent-analysis.md) — 任务复杂度决定反思轮次和推进策略
- [04 管线](04-pipeline.md) — 管线状态管理
- [06 节点](06-node.md) — 节点定义与执行
- [08 MCP 服务](08-mcp.md) — MCP 工具完整 API
