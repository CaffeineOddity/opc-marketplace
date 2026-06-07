# 02-3 阶段

阶段根据任务信号自主选择节点，node-resolver 自动解析依赖、拓扑排序、生成执行计划。每个阶段目录自包含：phase.md + nodes.md + nodes/ + templates/。

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

---

## 三、节点选择策略（nodes.md）

`opc_phase_start` 扫描 `phases/<phase>/nodes/` 和项目 `opc-nodes/`，自动填充节点列表。

### 3.1 两层匹配

**① tag 交集过滤** — 任务 tags 与节点 tags 求交集，交集为 0 的排除（`always_show: true` 除外）。

**② 语义匹配排序** — 任务 description 与节点 description 语义相似度降序排列。

**③ Scenario 加权** — 命中 scenario 推荐的节点 +0.3 权重加成。

```
节点匹配得分 = 语义相似度 × 0.7 + scenario 加权 × 0.3

例: add-feature 推荐的节点:
  - api-design:        +0.3 weight
  - database-schema:   +0.3 weight
  - tdd-implementation: +0.3 weight
```

### 3.2 反思轮次

每个 phase 独立配置 `max_reflection_rounds`：

| Phase | medium | high | 理由 |
|-------|--------|------|------|
| 00-ideation | 4 | 6 | 方向性探索，需多轮试错 |
| 01-validation | 2 | 4 | PRD/画像，少量关键决策 |
| 03-design | 3 | 5 | UI/UX 视觉决策需迭代 |
| 04-implement-design | 2 | 4 | API/DB 设计决策关键 |
| 05-implement | 3 | 5 | 节点最多，依赖链长 |
| 06-testing | 1 | 2 | 验证性为主 |
| 07-release | 1 | 2 | 操作性强 |
| 08-growth | 2 | 3 | 营销/SEO 策略需权衡 |
| 09-scale | 2 | 4 | 架构演进影响面大 |

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
| ≥ `min_confidence_for_auto` | AI 自行确定节点列表 | `auto_advance: true` |
| < `min_confidence_for_auto` | 展示候选列表，请求确认 | `auto_advance: false` |

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

逐组执行，每个 node 走完整流程（详见 [02-4 节点](02-4_node.md)）：

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

调用方根据 `auto_advance` 决定自动推进或提示确认。

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

---

## 六、分层回退策略

| 层 | 场景 | 工具 |
|----|------|------|
| L0 | 调整节点选择 | `opc_phase_adjust` |
| L1 | 重做单个产出 | `opc_node_retry`（级联重置下游） |
| L2 | 废弃整个 phase 知识 | `opc_phase_reset`（快照恢复） |
| L3 | 全量回退（知识+代码） | git checkout/revert（OPC 不封装） |

---

## 七、/comma 命令：阶段独立运行

`/comma` 命令允许在不启动完整管线的情况下，单独运行和测试任意阶段。

```
/comma <phase-id> [选项]
```

| 选项 | 说明 |
|------|------|
| `--pipeline <id>` | 在已有管线上下文中运行 |
| `--dry-run` | 测试模式：执行但不持久化 |
| `--mock-inputs` | 自动生成 mock 知识数据 |
| `--nodes <list>` | 指定运行的节点子集 |
| `--report <path>` | 执行报告输出路径 |

### 运行模式

**独立模式**（无 `--pipeline`）：创建临时管线上下文，执行完毕后自动清理（dry-run）或保留产物。

**附加模式**（有 `--pipeline`）：在已有管线上下文中运行，复用 brief + state。

### dry-run vs 正常执行

| 行为 | 正常执行 | dry-run |
|------|---------|---------|
| knowledge 写入 | 正常写入 | 跳过 |
| L1 校验 | 执行 | 跳过 |
| L2 校验 | 执行 | 执行 |
| state.json | 正常更新 | 临时，结束后删除 |

---

## 八、节点来源

`opc_phase_start` 扫描两个来源，同名节点项目覆盖内置：

| 来源 | 位置 | 说明 |
|------|------|------|
| 内置节点 | `phases/<phase>/nodes/` | 随 marketplace 分发 |
| 项目节点 | `opc-nodes/` | 同目录结构，同名覆盖 |

---

## 九、MCP 工具

### 阶段级工具（6 个）

| # | 工具 | 说明 |
|---|------|------|
| 10 | `opc_phase_start` | 扫描 node，返回候选列表 |
| 11 | `opc_phase_adjust` | 调整节点列表，重新生成预览 |
| 12 | `opc_phase_confirm` | 锁定节点计划，写入 state，创建快照 |
| 13 | `opc_phase_complete` | 标记完成，返回推进指令 |
| 14 | `opc_phase_reset` | 从快照恢复 knowledge，下游级联 pending |
| 15 | `opc_phase_run` | 独立运行阶段（/comma），支持 dry-run / mock-inputs |

### opc_phase_run（/comma）

```
参数: phase, pipeline_id?, dry_run?, mock_inputs?, nodes?, report_path?

行为:
  ① 校验 phase-id 存在
  ② standalone（创建临时管线）或 attached（复用已有）
  ③ 输入检查 + mock 补齐
  ④ phase_start → 确认 → 逐 node 执行 → phase_complete
  ⑤ 清理临时管线（dry-run）/ 保留产物

返回: 阶段执行报告（nodes, knowledge_produced, duration_ms, warnings）
```

---

## 十、自动机制

**阶段自动推进** — `opc_phase_complete` 后检查下一 phase 置信度：
- ≥ `min_confidence_for_auto` → 自动 `opc_phase_start` 进入下一 phase
- < `min_confidence_for_auto` → 提示用户确认后推进

---

## 十一、相关文档

- [02-1 意图分析](02-1_intent-analysis.md) — 任务复杂度决定反思轮次和推进策略
- [02-2 管线](02-2_pipeline.md) — 管线状态管理
- [02-4 节点](02-4_node.md) — 节点定义与执行
