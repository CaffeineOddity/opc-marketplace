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

## 三、节点选择策略（Claude 负责匹配排序）

`opc_phase_start` 扫描 `phases/<phase>/nodes/` 和项目 `opc-nodes/`，返回**原始候选列表**（不做语义匹配）。Claude 拿到列表后自行完成匹配排序。

### 3.1 opc_phase_start 返回

```
state-server 职责（纯确定性）:
  ① 扫描 phases/<phase>/nodes/*.md + opc-nodes/<phase>/nodes/*.md
  ② 解析每个节点的 frontmatter（name, tags, description, agents, input, output, quality_gates）
  ③ tag 交集过滤 → 排除与任务 tags 无交集的节点（always_show: true 除外）
  ④ 标记 scenario 推荐的节点
  ⑤ 返回原始列表（无 LLM 排序）
```

### 3.2 Claude 的匹配排序

Claude 拿到 `available_nodes` 后执行：

**① 语义匹配** — 任务 description 与每个节点 description 的语义相似度。Claude 本身是 LLM，无需额外引擎。

**② Scenario 加权** — 命中 scenario 推荐的节点 +0.3 权重加成。

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
opc_phase_start → 扫描节点 → 匹配排序 → 自省评估 → opc_phase_confirm
    → 逐 node 执行 → opc_phase_complete → 推进/确认

自省评估分叉:
  高置信度 → 自动确认（跳过用户）
  中置信度 → 快速确认（一键通过）
  低置信度 → 反思循环（Claude 调 opc_flow_reflect 持久化 + max_reflection_rounds 兜底）

每个阶段层工具返回里附带 flow_next 字段，告诉 Claude 下一步该调什么工具。
反思循环统一走 opc_flow_reflect，与任务分析反思共享日志格式（flow-state.json）。
```

### 5.1 opc_phase_start — 扫描与返回

```
参数: pipeline_id, sub_pipeline_id, phase

行为（纯确定性，零 LLM）:
  → 校验: pipeline 存在、sub 存在、prev phase completed
  → 扫描 phases/<phase>/nodes/*.md + opc-nodes/<phase>/nodes/*.md
  → 解析每个 node 的 frontmatter
  → tag 交集过滤（纯规则）
  → 标记 recommend 节点（来自 scenario）
  → 标记 phase: in_progress
  → 更新 flow-state.json:
      · current_step = "phase_execution"
      · current_pipeline_pointer = { sub_pipeline_id, phase, node: null }
      · last_heartbeat_at 刷新

返回:
{
  phase: "04-implement-design",
  task_tags: ["backend", "auth", "database"],
  scenario: "add-feature",
  available_nodes: [
    {
      name: "api-design",
      tags: ["api", "backend"],
      description: "设计 API 端点、请求/响应格式、错误码",
      agents: { primary: ["backend-engineer"] },
      input: [...],
      output: [...],
      quality_gates: null,
      recommended: true
    },
    // ... 全部符合条件的节点
  ],
  max_reflection_rounds: 2,
  min_confidence_for_auto: 0.85,
  methodology: {
    docs: ["prompts/phase-execution.md", "prompts/reflection-node-selection.md"],
    ref: "§5.2 自省评估 4 维度 + §5.2 三种推进路径",
    summary: "语义匹配×0.30 + Scenario对齐×0.25 + 覆盖完整×0.30 + 冗余×0.15"
  },
  flow_next: {
    suggestion: "自行排序 + 自省打分；高置信度直接 opc_phase_confirm；低置信度先调 opc_flow_reflect"
  }
}
```

Claude 拿到后自行语义匹配排序 + 展示给用户，不依赖 state-server 的 LLM。反思循环走 opc_flow_reflect，与任务分析反思共用日志格式。

### 5.2 自省评估与推进

节点排序完成后，Claude **自省评估**选择质量，给出置信度分数。高置信度直接确认锁定，低置信度进入反思循环或询问用户。

**评估维度（Claude 自省打分）：**

| 维度 | 权重 | 0-0.4 (低) | 0.5-0.7 (中) | 0.8-1.0 (高) |
|------|------|-----------|-------------|------------|
| 语义匹配强度 | 0.30 | 多数节点语义相似度 < 0.6 | 多数节点在 0.6-0.8 | 多数节点 > 0.8，高度匹配 |
| Scenario 对齐度 | 0.25 | 选中节点与 scenario 推荐偏差大 | 覆盖大部分推荐，少量偏离 | 完全对齐 scenario 推荐 |
| 覆盖完整性 | 0.30 | 明显遗漏关键关注面 | 覆盖主要关注面，个别可补充 | 全部关注面有对应节点 |
| 节点冗余度 | 0.15 | 多个节点职责重叠严重 | 少量重叠但可接受 | 无冗余，职责分明 |

```
选择置信度 = 语义匹配强度×0.30 + Scenario对齐度×0.25
            + 覆盖完整性×0.30 + 节点冗余度×0.15
```

**推进决策（结合 phase 的 min_confidence_for_auto，反思通过 opc_flow_reflect 持久化）：**

```
if 选择置信度 ≥ min_confidence_for_auto:
    → 自动确认锁定（auto_confirm），通知用户节点方案，不等确认
    → 直接调 opc_phase_confirm

elif 选择置信度 ≥ min_confidence_for_auto × 0.75:
    → 快速确认：展示方案 + 置信度分数 + 简要理由，用户可一键确认
    → 调 opc_phase_confirm

else:
    → 进入反思循环：调 opc_flow_reflect(step_id: "node_selection", round: 1, ...)
      opc_flow_reflect 持久化到 state.json.phases[].reflection_log + flow-state.json 留指针，返回下一轮反思指令
      Claude 逐项自查（缺漏/多余/合并拆分），每轮重新打分 + opc_flow_reflect 上报
      opc_brief_complete 判定:
        new_confidence ≥ threshold → 跳出，调 opc_phase_confirm
        round 达 max_reflection_rounds → 强制确认（ask_user）
```

**三种推进路径：**

```
路径 A — 自动确认（置信度 ≥ threshold）:
  初始方案 → Claude 自省打分 → ≥ 0.85 → 直接 opc_phase_confirm
  例: add-feature + 语义相似度 > 0.9 → "已自动确认 4 个节点（置信度 0.91）"

路径 B — 快速确认（threshold × 0.75 ≤ 置信度 < threshold）:
  初始方案 → Claude 自省打分 → 0.65-0.84 → 展示方案 + 分数 → 用户一键确认/调整

路径 C — 反思循环（置信度 < threshold × 0.75）:
  初始方案 → Claude 自省打分 → < 0.65 → 进入反思循环
  反思内容:
    - 缺漏：是否有该做但未选中的节点？
    - 多余：是否有不必要或重复的节点？
    - 合并/拆分：相似节点合并？过大节点拆分？
  每轮反思后重新自省打分
  达到 max_reflection_rounds 后强制确认
```

**自省报告格式（Claude 在 opc_phase_confirm 前内部生成）：**

```json
{
  "selected_nodes": ["api-design", "database-schema", "tdd-implementation"],
  "selection_confidence": 0.88,
  "auto_confirm": true,
  "confidence_detail": {
    "semantic_match_strength": 0.85,
    "scenario_alignment": 0.95,
    "coverage_completeness": 0.80,
    "redundancy": 0.95
  },
  "self_check_summary": "add-feature 场景完美命中，API+DB+实现三个关注面完整覆盖，无冗余节点",
  "warnings": ["未选中 security-review（置信度 0.68 低于阈值），如需安全审查请手动添加"]
}
```

**反思循环中的自省迭代：**

```
第 1 轮: 初始方案 → 置信度 0.58 → 缺 database-schema（覆盖完整性低）
          → 补选 database-schema → 置信度 0.72 → 仍低于 0.85

第 2 轮: 方案调整 → 置信度 0.72 → 检查是否有多余节点
          → 无冗余 → 置信度 0.78（scenario 对齐度提升）→ 仍低于 0.85

第 3 轮: 方案确认 → 置信度 0.82 → 接近但未达阈值
          → max_reflection_rounds=4 → 继续

第 4 轮: 最终检查 → 置信度 0.82 → 达到上限
          → 强制确认："以下方案经 4 轮优化，置信度 0.82，请确认"
```

调整仍通过 `opc_phase_adjust(pipeline_id, sub_id, phase, nodes: [...])` 重新生成预览。与旧设计不同的是，**大部分常规任务的调整由 Claude 在自省循环中自行完成**，用户只在低置信度或达到上限时介入。

### 5.3 opc_phase_confirm — 锁定执行计划

```
参数: pipeline_id, sub_pipeline_id, phase, nodes: [{name, blocked_by?}]

行为:
  → node-resolver 解析依赖（即使用户传了 blocked_by 也校验 + 修正）
  → 文件域冲突检查（artifacts + knowledge 路径重叠 → 降级串行）
  → 写入 state.json phases[].nodes[] + blocked_by
  → 快照当前 phase 节点的 output.knowledge 路径 → .opc/snapshots/
  → 锁定后不可再 opc_phase_adjust
  → 更新 flow-state.json:
      · current_step = "phase_confirmed"
      · current_pipeline_pointer = { sub_pipeline_id, phase, node: null }
      · last_heartbeat_at 刷新

返回: {
  groups: [{group: 1, nodes: [...], parallel: true}, ...],
  flow_next: {
    tool: "opc_node_start",
    args: {pipeline_id, sub_pipeline_id, node_name: <第一组首个节点>},
    why: "按 group 顺序依次启动 node；同组 parallel:true 的节点可并行 opc_node_start"
  }
}
```

### 5.4 执行节点

逐组执行，每个 node 走完整流程（详见 [02-4 节点](02-4_node.md)）：

```
opc_node_start → Agent 加载知识 → 执行 → opc_node_complete / opc_node_fail
```

### 5.5 opc_phase_complete — 阶段完成

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 校验该 phase 全部 node completed
  → 写入 state.json phases[].status = completed
  → 计算下一 phase + 是否 auto_advance
  → 计算 pipeline_progress（含 ready_sub_pipelines、failed downstream 等）
  → 更新 flow-state.json:
      · 若 next_phase 存在 + auto_advance → current_pipeline_pointer = { sub_pipeline_id, phase: next_phase, node: null }
      · 若 next_phase 为 null + ready_sub_pipelines 非空 → current_pipeline_pointer = { sub_pipeline_id: ready_sub_pipelines[0], phase: null, node: null }
      · 若全部完成 → current_pipeline_pointer 保留为最后位置，等待 opc_pipeline_complete
      · last_heartbeat_at 刷新

返回:
{
  phase: "04-implement-design",
  status: "completed",
  next_phase: "05-implement",
  auto_advance: true,
  next_phase_message: "进入 05-implement 编码阶段",
  pipeline_progress: {
    current_sub: "sub-1",
    current_sub_status: "in_progress",
    ready_sub_pipelines: [],          ← blocked_by 全满足且非 failed downstream 的子管线
    pending_sub_pipelines: ["sub-3"]
  },
  flow_next: {
    tool: "opc_phase_start",
    args: {pipeline_id, sub_pipeline_id, phase: "05-implement"},
    why: "auto_advance=true → 直接进入下一 phase"
  }
}
```

调用方根据 `auto_advance` + `pipeline_progress` 决定下一步：
- `next_phase != null` 且 `auto_advance: true` → 直接调 `opc_phase_start` 推进当前子管线
- `next_phase != null` 且 `auto_advance: false` → 提示用户确认后推进
- `next_phase == null` 且 `ready_sub_pipelines` 非空 → 启动下一条子管线
- `next_phase == null` 且 `ready_sub_pipelines` 为空 + 全部 sub completed → 调 `opc_pipeline_complete`

**auto_advance 计算规则：**

```
auto_advance = (
    task.complexity != "high"
    AND 当前 phase 所有 node 100% completed（无 retry 兜底完成）
    AND 当前 phase 的 selection_confidence ≥ min_confidence_for_auto × 0.9
    AND 下一 phase 在 suggested_phases 中
)
```

### 5.6 opc_phase_reset — 阶段重置

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 检查 .opc/snapshots/ 有无快照
    ├── 有 → 复制快照回 opc-knowledge/ 对应路径
    └── 无 → 报错
  → 该 phase → pending（node 全部重置）
  → 下游 phase → pending
  → reset 完成后立即对当前 phase 重新生成快照（覆盖旧快照），保证幂等可重复 reset

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

**阶段自动推进** — `opc_phase_complete` 后按 auto_advance 计算规则决定推进策略：

```
auto_advance = (
    task.complexity != "high"
    AND 当前 phase 所有 node 100% completed（无 retry 兜底完成）
    AND 当前 phase 的 selection_confidence ≥ min_confidence_for_auto × 0.9
    AND 下一 phase 在 suggested_phases 中
)
```

- `auto_advance: true` → Claude 直接调 `opc_phase_start` 进入下一 phase
- `auto_advance: false` → 提示用户确认后推进
- `next_phase == null` + `ready_sub_pipelines` 非空 → Claude 启动下一条子管线
- `next_phase == null` + `ready_sub_pipelines` 为空 + 全部 sub completed → 调 `opc_pipeline_complete`

**节点选择反思持久化** — 每轮反思通过 `opc_flow_reflect`写入 `state.json.phases[].reflection_log`，同时在 `flow-state.json` 留指针，crash 后 `opc_flow_recover` 可续传从指定 round 继续。

**跨子管线 ready 检测** — `opc_phase_complete` 返回 `pipeline_progress.ready_sub_pipelines`，state-manager 聚合规则：blocked_by 全部 completed 且 upstream 无 failed 才纳入。

---

## 十一、相关文档

- [02-1 意图分析](02-1_intent-analysis.md) — 任务复杂度决定反思轮次和推进策略
- [02-2 管线](02-2_pipeline.md) — 管线状态管理
- [02-4 节点](02-4_node.md) — 节点定义与执行
