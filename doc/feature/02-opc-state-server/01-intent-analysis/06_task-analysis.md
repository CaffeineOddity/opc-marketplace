# 任务分析

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 六、任务分析（方法论：prompts/task-analysis.md）

仅 intent = task 时触发。opc_intent_complete 返回的 step_instruction 提示先调 `opc_knowledge_list`，然后按方法论执行 7 步分析，最后调 `opc_task_analysis_complete` 提交结果。

### 6.1 触发流程

```
opc_intent_complete({intent: "task", intent_evidence: {...}})
  ↓
返回:
{
  step: "task_analysis",
  step_instruction: "先调 opc_knowledge_list() 获取已有 unit，然后按方法论做 7 步分析，并收集 task_analysis_evidence。",
  methodology: {
    docs: ["prompts/task-analysis.md"],
    ref: "6.2 分析步骤①-⑦ + 05-opc-reflection-server 二 task_analysis_evidence schema",
    summary: "提炼描述→打标签→判复杂度→推荐阶段→提取知识→匹配 scenario→知识操作计划"
  },
  prerequisites: [
    {tool: "opc_knowledge_list", why: "获取已有 unit 上下文"}
  ],
  schema: { description, tags, complexity, suggested_phases, phase_selection_rationale,
            knowledge_unit, scenario, knowledge_plan, task_analysis_evidence },
  next: {tool: "opc_task_analysis_complete"}
}
```

> 本步骤走 reflection-server **P2 反思位点**，提交 `task_analysis_evidence`（schema 包含 `requirements[]` / `dependencies[]` / `risks[]` / `knowledge_plan` / `phase_selection_rationale` 等，详见 [05-opc-reflection-server/02-server-design/00_overview.md 二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)）。路由由 V1-V5 验证器 + meta-validator 输出，primary 方法 = M3 CoVe，secondary = M2 Reflexion，详见 [05-opc-reflection-server/01-method-theory/00_overview.md 五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

### 6.2 分析步骤（Claude 按方法论执行）

**① 提炼描述** — 将用户原始输入提炼为一句精确的任务描述。补全隐含信息，去掉无关修饰。

**② 打标签** — 从以下标签池中选择 2-4 个：

| 类别 | 可用标签 |
|------|---------|
| 技术栈 | backend, frontend, fullstack, mobile, desktop, infra |
| 领域 | auth, database, api, ui, payment, storage, security, messaging |
| 操作 | add-feature, fix-bug, refactor, optimize, migrate, configure |

**③ 判复杂度** — 两问法：

```
需要设计规划吗？
  → 不需要 → low
  → 需要 → 能一轮解决且不复杂吗？
    → 能 → medium
    → 不能 → high
```

| 复杂度 | 判定标准 | 典型场景 |
|--------|---------|---------|
| **low** | 不需要规划，简单修改即可完成 | 修样式、改文案、加日志、调配置 |
| **medium** | 需要规划，但一轮即可完成 | 新增功能、接入第三方服务 |
| **high** | 需要规划，且需多轮推进或复杂度高 | 重构核心模块、迁移数据库、改 API 协议 |

**④ 推荐阶段** — 根据任务性质选择必经阶段，输出 `suggested_phases`（最终落到 [`state.json` → `phase_plan.selected`](../02-pipeline/04_state-json.md#六phase_plan-校验规则deterministic)）。注意：

- 必须是 `phases/` 目录里实际存在的 phase id 子集（state-server 会按 `available` 做存在性校验）；
- 顺序必须满足各 phase.md 的 `order.prev/next` 偏序（不能 `06-testing` 排在 `04-implement-design` 前面）；
- 同时输出 `phase_selection_rationale`（一句话说明为什么是这几个、为什么跳过别的），供后续反思 evidence 与 replan 复用。

| 任务性质 | 推荐阶段 |
|---------|---------|
| 新功能 / Bug修复 / 重构 | 04-implement-design → 05-implement → 06-testing |
| 安全审计 | 06-testing（仅安全扫描节点） |
| 新项目 | 00-ideation → 03-design → 04-implement-design → 05-implement → 06-testing |

**⑤ 提取知识点** — 从任务描述中识别领域概念，输出为 unit 名称：

```
"实现用户认证系统"                           → ["user-auth"]
"实现支付和订阅功能"                         → ["payment", "subscription"]
"修复角色权限检查"                           → ["authorization"]
```

**⑥ 匹配 Scenario** — Claude 扫描 `scenarios/` 目录，选择最匹配的 1-2 个：

`add-feature` / `fix-bug` / `redesign-product` / `performance-optimize` / `security-audit` / `launch-product` / `incident-response`

**⑦ 生成知识操作计划** — 逐条知识路径标注操作类型（read / update / create）和当前状态。

### 6.3 complexity 分叉

| 维度 | low | medium | high |
|------|-----|--------|------|
| 执行路径 | 快速通道：opc_task_analysis_complete 路由 `action: quick_dispatch`，无管线/无 phases/无 state | 完整管线 | 完整管线 |
| 反思预算 | — | rounds-guard 中等（默认 2-3 轮） | rounds-guard 宽松（默认 3-5 轮） |
| 阶段推进 | — | auto_advance 严格判定（含 V1-V5 通过条件） | 每阶段需用户确认 |
| brief | 不生成 | 标准版 | 详细版 |
| 节点选择 | — | 标准 tag+语义筛选 | 不可跳过匹配节点 |
| 知识读取 | Agent 自行决定 | 按 node input 加载 | 额外展开 _refs 关联 unit |
| 知识写入 | 通常不写 | 正常写入 | 更严格审查 |

### 6.4 Evidence 收集与反思

任务分析完成后，Claude 收集 `task_analysis_evidence` 并随 `opc_task_analysis_complete` 提交给 reflection-server P2 验证。complexity 判断正确性尤其关键——它决定了后续管线的执行路径、反思预算和推进策略；P2 evidence 必须包含支撑 complexity 判定的具体信号（如 risks[] / dependencies[]），由 V1-V5 + meta-validator 检查。

> Evidence schema 完整字段、V1-V5 验证规则、primary/secondary 方法选择见 [05-opc-reflection-server/02-server-design/00_overview.md 二/三](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema) + [01-method-theory/00_overview.md 五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

`task_analysis_evidence` 关键字段：

| 字段 | 说明 |
|------|------|
| `requirements[]` | 提炼出的需求条目，每条引用用户原始消息片段 |
| `dependencies[]` | 任务涉及的模块/服务/外部依赖 |
| `risks[]` | 识别的风险点（含 complexity 升级触发条件） |
| `knowledge_plan` | 知识操作计划（与 analysis_result.knowledge_plan 一致） |
| `phase_selection_rationale` | 阶段选择理由，对应 [phase_plan.selection_rationale](../02-pipeline/04_state-json.md#六phase_plan-校验规则deterministic) |
| `complexity_signals` | 支撑 complexity 判定的具体信号（两问法答案 + 加权依据） |

**路由（由 opc_task_analysis_complete 按 V1-V5 + meta-validator 结果分流，详见 [03_flow-tools-step-routing.md opc_task_analysis_complete](03_flow-tools-step-routing.md#opc_task_analysis_complete)）：**

| validator 结果 | 行为 |
|----------------|------|
| V1-V5 全部 pass + 无严重 objection | 跳过反思，按 complexity + modify_unit_count 进入分支 2 |
| V1-V5 pass + 中等 objection | 同上，但 step_instruction 附 reasoning_trace 提示用户简短确认 |
| V1-V5 fail 或 严重 objection | 进入 P2 反思（primary=M3 CoVe，secondary=M2 Reflexion），受 rounds-guard 约束；rounds 耗尽 → ask_user |

**与节点选择反思的对比：**

| | 任务分析反思 (P2) | 节点选择反思 (P5) |
|---|---|---|
| 触发位点 | opc_task_analysis_complete → opc_flow_reflect | opc_phase_start 之后、opc_phase_confirm 之前 |
| 持久化位置 | flow-state.json.reflection_log | state.json.phases[].reflection_log |
| primary 方法 | M3 CoVe | M4 Critique |
| secondary 方法 | M2 Reflexion | M5 Debate（≥ medium 启用） |
| 调整方式 | 修正分析结论（如升级 complexity） | `opc_phase_adjust` 增删节点 |

**自省报告格式（提交给 opc_task_analysis_complete，evidence_artifact 由 reflection-server 单独存储；analysis_evidence_ref 写入 flow-state.accumulated）：**

```json
{
  "description": "实现用户认证系统（邮箱注册登录 + 会话管理）",
  "tags": ["backend", "auth", "database"],
  "complexity": "medium",
  "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
  "phase_selection_rationale": "add-feature 场景 + medium 复杂度：跳过 00/01/03（已有产品形态、无需重新构思与设计），从实现设计起步至测试收尾",
  "knowledge_unit": ["user-auth"],
  "scenario": "add-feature",
  "knowledge_plan": [
    {"path": "user-auth/login", "operation": "create"},
    {"path": "user-auth/session", "operation": "create"}
  ],
  "task_analysis_evidence": {
    "requirements": [
      {"text": "邮箱注册登录", "source_quote": "实现用户认证系统"},
      {"text": "会话管理", "source_quote": "实现用户认证系统"}
    ],
    "dependencies": ["database", "email-service"],
    "risks": [
      {"text": "若需 SSO 集成则需升级 high", "trigger": "user_mentions=oauth|sso"}
    ],
    "complexity_signals": {
      "needs_design": true,
      "one_round_solvable": true,
      "verdict": "medium"
    },
    "phase_selection_rationale": "add-feature 场景 + medium 复杂度：跳过 00/01/03，从实现设计起步至测试收尾"
  }
}
```

**自动推进时（V1-V5 pass + 无严重 objection）Claude 主动告知用户：**

> "任务分析完成（P2 evidence 通过 V1-V5）：
>  描述：实现用户认证系统（邮箱注册登录 + 会话管理）
>  复杂度：medium | 阶段：04→05→06 | 知识点：user-auth | 场景：add-feature
>  如需修正，回复'重新分析'或直接修改某项。"

**用户纠错指令：**

| 指令 | 效果 |
|------|------|
| "复杂度应该是 high" | Claude 调 `opc_flow_revise(field: "complexity", value: "high")`（会清除 phase_selection_rationale + analysis_evidence_ref，回到 task_analysis 重做） |
| "加上 03-design 阶段" | 同上，field: suggested_phases |
| "重新分析" / "重新评估" | Claude 调 `opc_flow_restart(from_step: "task_analysis")` |
| "就这样" / "继续" | Claude 推进到下一步（调用 opc_task_analysis_complete 返回中的 next.tool） |

---

