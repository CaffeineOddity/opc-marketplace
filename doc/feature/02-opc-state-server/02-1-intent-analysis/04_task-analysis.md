# 任务分析

> 本文档是 [02-1 意图分析总览](../02-1_intent-analysis.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具](02_flow-tools.md) · [意图识别](03_intent-recognition.md) · [任务拆分](05_task-decomposition.md) · [工作单生成](06_brief-generation.md) · [管线创建与阶段执行](07_pipeline-creation.md) · [flow-state schema](08_flow-state-schema.md) · [完整流程示例](09_complete-example.md)

---

## 六、任务分析（方法论：prompts/task-analysis.md）

仅 intent = task 时触发。opc_intent_complete 返回的 step_instruction 提示先调 `opc_knowledge_list`，然后按方法论执行 7 步分析，最后调 `opc_task_analysis_complete` 提交结果。

### 6.1 触发流程

```
opc_intent_complete opc_intent_complete({intent: "task", confidence: 0.85})
  ↓
返回:
{
  step: "task_analysis",
  step_instruction: "先调 opc_knowledge_list() 获取已有 unit，然后按方法论做 7 步分析。",
  methodology: {
    docs: ["prompts/task-analysis.md"],
    ref: "§6.2 分析步骤①-⑦ + §6.3 自省评估 5 维度",
    summary: "提炼描述→打标签→判复杂度→推荐阶段→提取知识→匹配 scenario→知识操作计划"
  },
  prerequisites: [
    {tool: "opc_knowledge_list", why: "获取已有 unit 上下文"}
  ],
  schema: { description, tags, complexity, suggested_phases, knowledge_unit,
            scenario, knowledge_plan, analysis_confidence, confidence_detail },
  next: {tool: "opc_task_analysis_complete"}
}
```

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

**④ 推荐阶段** — 根据任务性质选择必经阶段：

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
| 执行路径 | 快速通道：opc_intent_complete 路由 `action: quick_dispatch`，无管线/无 phases/无 state | 完整管线 | 完整管线 |
| 反思轮次 | — | 2-3 | 3-5 |
| 阶段推进 | — | 高置信度自动 | 每阶段需确认 |
| brief | 不生成 | 标准版 | 详细版 |
| 节点选择 | — | 标准 tag+语义筛选 | 不可跳过匹配节点 |
| 知识读取 | Agent 自行决定 | 按 node input 加载 | 额外展开 _refs 关联 unit |
| 知识写入 | 通常不写 | 正常写入 | 更严格审查 |

### 6.4 自省评估

任务分析完成后，Claude **自省评估**分析质量，作为 `analysis_confidence` + `confidence_detail` 一并提交给 `opc_task_analysis_complete`。complexity 判断正确性尤其关键——它决定了后续管线的执行路径、反思轮次和推进策略。判错一级，整个流程行为全变。

**评估维度（Claude 自省打分）：**

| 维度 | 权重 | 0-0.4 (低) | 0.5-0.7 (中) | 0.8-1.0 (高) |
|------|------|-----------|-------------|------------|
| 描述精确度 | 0.25 | 描述与原始意图偏差大，遗漏关键信息 | 基本准确，个别隐含信息未补全 | 精确捕获用户意图，隐含信息已补全 |
| 复杂度确信度 | **0.30** | 两问法无清晰答案，边界模糊 | 倾向某个等级但存在摇摆 | 两问法答案明确，无争议 |
| 知识单元完整度 | 0.20 | 可能有遗漏或多余的 unit | 主要 unit 正确，个别存疑 | 全部 unit 准确，边界清晰 |
| 阶段推荐合理度 | 0.15 | 推荐阶段与任务性质不符 | 基本合理，个别阶段可增删 | 阶段选择完全匹配任务性质 |
| 场景匹配度 | 0.10 | scenario 与任务类型偏差大 | 匹配了近似 scenario | 最佳 scenario 命中 |

```
分析置信度 = 描述精确度×0.25 + 复杂度确信度×0.30
            + 知识单元完整度×0.20 + 阶段推荐合理度×0.15 + 场景匹配度×0.10
```

**复杂度确认为什么权重最高？** complexity 判错的影响：

```
用户说"重构 Session 模块，把 Cookie 改成 JWT"
  → 判为 medium → 标准管线，用户无感 → 阶段自动推进 → 做到一半发现影响面巨大
  → 判为 high   → 每阶段用户确认、更严格的知识读取、不可跳过节点
  → 判错一级 = 整条管线的反思深度和执行策略全错
```

**推进决策（由 opc_intent_complete + opc_brief_complete 协同执行）：**

```
Round 1: Claude 完成分析 → opc_task_analysis_complete(confidence)

if confidence ≥ 0.8:
    → opc_intent_complete 直接路由到 decomposition_or_brief（跳过反思）

elif confidence ≥ 0.5:
    → opc_intent_complete 返回反思指令（最多 2 轮，每轮换角度）
        Round 2: "反方视角" — 假设 complexity 判错一级会怎样？
        Round 3: "模式对照" — 与已知相似任务模式对比
      Claude 每轮调 opc_flow_reflect(round, new_confidence)
      opc_brief_complete 判定:
        new_confidence ≥ 0.8 → 路由到 decomposition_or_brief
        round 达上限 → 路由到 ask_user（快速确认）

else (confidence < 0.5):
    → opc_intent_complete 返回反思指令（最多 3 轮，深度审视）
        Round 2: "反方视角" — 逐项质疑 7 步分析每个结论
        Round 3: "缺口扫描" — 刻意寻找遗漏
        Round 4: 仍未改善则强制确认
      opc_brief_complete 判定同上，但低置信度走"详细确认"分支（ask_user 时附带逐维度低分原因）
```

| 初始置信度 | 反思轮次上限 | 反思后 ≥ 0.8 | 反思后 ≥ 0.5 | 反思后 < 0.5 |
|-----------|------------|-------------|-------------|-------------|
| ≥ 0.8 | 0 轮（跳过反思） | — | — | — |
| 0.5-0.8 | 最多 2 轮 | 自动推进 | 快速确认 | — |
| < 0.5 | 最多 3 轮 | 自动推进 | 快速确认 | 详细确认 |

**反思视角（每轮从不同角度审视，prompts/reflection-task-analysis.md 提供完整 prompt）：**

| 轮次 | 视角 | 核心问题 |
|------|------|---------|
| Round 1 | 常规分析 | 按 7 步标准流程分析 |
| Round 2 | 反方视角 | "如果我判错了会怎样？" — 假设 complexity 升/降一级、unit 多/少一个，结论是否仍然成立？ |
| Round 3 | 模式对照 | "这个任务像什么？" — 与 scenarios/ 中已知模式对比，与历史任务模式对比，验证一致性 |
| Round 4 | 最终裁决 | （仅初始 < 0.5 时触发）综合前三轮发现，给出最终判断并标注剩余不确定性 |

**反思收敛示例：**

```
任务: "优化数据库查询性能"
Round 1: complexity=medium, phases=[05,06], confidence=0.48
  → opc_task_analysis_complete(0.48) → opc_intent_complete 返回反思指令 round 1

Round 2 → 反方视角（Claude 收到 opc_intent_complete 的反思 prompt 后自行执行）:
  "假设 complexity 应该是 high，会怎样？"
  → 如果优化涉及索引重建 → 需要设计阶段(04) + 每阶段确认
  → 用户没说明范围，不能排除 high 的可能性
  → 复杂度确信度: 0.35 → 0.50（意识到不确定性后，更诚实的评分）
  → opc_flow_reflect(round=2, new_confidence=0.52)

Round 3 → 模式对照:
  → 阶段推荐: 缺 04 是风险点 → 0.45 → 0.55
  → opc_flow_reflect(round=3, new_confidence=0.55)
  → opc_brief_complete: round 达上限 → 路由到 ask_user（快速确认）

Claude 通知用户:
  "任务分析经 3 轮反思（置信度 0.48 → 0.55）:
   主要不确定点仍是复杂度——不确定是否涉及 schema 变更。
   当前按 medium 处理（05→06），如实际涉及 schema 变更请告知。"
```

**轮次上限配置：**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `max_analysis_reflection_rounds_normal` | 2 | 初始置信度 0.5-0.8 时的反思上限 |
| `max_analysis_reflection_rounds_low` | 3 | 初始置信度 < 0.5 时的反思上限 |
| 提前退出条件 | 置信度 ≥ 0.8 或 连续两轮无改善 | 避免无效循环，浪费 token |

**与节点选择反思的对比：**

| | 任务分析反思 | 节点选择反思 |
|---|---|---|
| 触发 | opc_task_analysis_complete 路由 → opc_flow_reflect 持久化 | opc_flow_reflect 持久化（在 phase_confirm 之前） |
| 轮次上限 | 2-3 轮 | 各 phase 不同（1-6 轮） |
| 反思内容 | 重新审视 7 步分析 | 自查缺漏/多余/合并拆分 |
| 调整方式 | 修正分析结论（如升级 complexity） | `opc_phase_adjust` 增删节点 |
| 为何轮次更少 | 7 个分析维度是离散决策 | 节点选择是组合优化，搜索空间更大 |

**自省报告格式（提交给 opc_task_analysis_complete）：**

```json
{
  "description": "实现用户认证系统（邮箱注册登录 + 会话管理）",
  "tags": ["backend", "auth", "database"],
  "complexity": "medium",
  "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
  "knowledge_unit": ["user-auth"],
  "scenario": "add-feature",
  "analysis_confidence": 0.88,
  "confidence_detail": {
    "description_precision": 0.9,
    "complexity_certainty": 0.85,
    "knowledge_unit_completeness": 0.9,
    "phase_recommendation": 0.85,
    "scenario_match": 0.9
  },
  "self_check_summary": "标准 add-feature 场景：新功能、单 domain、需要设计+实现+测试三阶段，复杂度无争议"
}
```

**低置信度示例（complexity 存疑）：**

```json
{
  "description": "优化数据库查询性能，可能涉及索引调整和查询重写",
  "complexity": "medium",
  "analysis_confidence": 0.52,
  "confidence_detail": {
    "description_precision": 0.7,
    "complexity_certainty": 0.35,
    "knowledge_unit_completeness": 0.6,
    "phase_recommendation": 0.45,
    "scenario_match": 0.6
  },
  "self_check_warning": "复杂度存疑：如果涉及 schema 变更或索引重建，应为 high；阶段推荐可能缺 04"
}
```

opc_intent_complete 收到后路由到反思（confidence < 0.8）→ Claude 进入反思循环。

**自动推进时（opc_intent_complete 路由不经过 ask_user）Claude 主动告知用户：**

> "任务分析完成（置信度 0.88）：
>  描述：实现用户认证系统（邮箱注册登录 + 会话管理）
>  复杂度：medium | 阶段：04→05→06 | 知识点：user-auth | 场景：add-feature
>  如需修正，回复'重新分析'或直接修改某项。"

**用户纠错指令：**

| 指令 | 效果 |
|------|------|
| "复杂度应该是 high" | Claude 调 `opc_flow_revise(field: "complexity", value: "high")` 重新推进 |
| "加上 03-design 阶段" | 同上，field: suggested_phases |
| "重新分析" / "重新评估" | Claude 调 `opc_flow_restart(from_step: "task_analysis")` |
| "就这样" / "继续" | Claude 推进到下一步（调用 opc_intent_complete 返回中的 next.tool） |

---

