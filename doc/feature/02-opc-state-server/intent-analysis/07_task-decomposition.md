# 任务拆分

> 本文档是 [意图分析总览](../01_intent-analysis-overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 七、任务拆分（方法论：prompts/task-decomposition.md）

### 7.1 触发条件

opc_intent_complete `opc_task_analysis_complete` 检测到 analysis_result 中需要**修改**的 unit 数量 ≥ 2 时，路由返回拆分指令：

```json
{
  "step": "task_decomposition",
  "step_instruction": "按方法论执行拆分分析 + 自省评估，提交给 opc_decomposition_complete。",
  "methodology": {
    "docs": ["prompts/task-decomposition.md"],
    "ref": "§7.2 拆分原则 + §7.4 自省评估 4 维度",
    "summary": "按领域边界拆，独立的拆开，紧密耦合的合并，通过 _refs 推导依赖"
  },
  "schema": { sub_pipelines, execution_order, decomposition_confidence, confidence_detail },
  "next": {"tool": "opc_decomposition_complete"}
}
```

修改数 = 1 时跳过：opc_intent_complete 直接路由到 brief_generation。

```
修改数 = 1：跳过拆分
  → 例："给用户认证加个短信验证" → user-auth(update) + notification(read)
  → notification 只读 → 单管线

修改数 ≥ 2：opc_intent_complete 路由到 task_decomposition
  → 修改的 unit 之间互相 _refs → 合并为一条子管线
  → 修改的 unit 之间独立 → 拆分
```

### 7.2 拆分原则

**按领域边界拆分** — 每个 knowledge_unit 对应一个领域，一条子管线负责 1-2 个紧密耦合的 unit：

```
knowledge_unit: [product, cart, order, payment, user-center]
                    ↓
子管线-1: product          (商品管理)
子管线-2: user-center      (用户中心)
子管线-3: cart             (购物车，依赖 product + user-center)
子管线-4: order + payment  (下单支付，依赖 cart + user-center)
```

**独立可并行的拆开** — 两个 unit 之间没有 `_refs` → 拆成独立子管线，可并行执行。

**紧密耦合的合并** — 两个 unit 之间有强 `_refs` 引用 → 合并到同一子管线。

**依赖推导**（管线级 output → input）— 通过 `_refs` 关系自动推导 blocked_by：

```
cart._refs → [product, user-center]
  → cart 子管线 blocked_by: [product 子管线, user-center 子管线]

order._refs → [cart, user-center]
  → order+payment 子管线 blocked_by: [cart 子管线, user-center 子管线]
```

### 7.3 输出格式（提交给 opc_decomposition_complete）

```json
{
  "sub_pipelines": [
    { "id": "sub-1", "title": "商品管理", "knowledge_unit": ["product"], "blocked_by": [] },
    { "id": "sub-2", "title": "用户中心", "knowledge_unit": ["user-center"], "blocked_by": [] },
    { "id": "sub-3", "title": "购物车", "knowledge_unit": ["cart"], "blocked_by": ["sub-1", "sub-2"] },
    { "id": "sub-4", "title": "下单与支付", "knowledge_unit": ["order", "payment"], "blocked_by": ["sub-3", "sub-2"] }
  ],
  "execution_order": [
    {"group": 1, "parallel": ["sub-1", "sub-2"]},
    {"group": 2, "sequential": ["sub-3"]},
    {"group": 3, "sequential": ["sub-4"]}
  ],
  "decomposition_confidence": 0.87,
  "confidence_detail": {
    "boundary_clarity": 0.9,
    "coupling_clarity": 0.85,
    "intent_clarity": 0.8,
    "granularity": 0.9
  }
}
```

### 7.4 自省评估与推进

opc_task_analysis_complete `opc_decomposition_complete` 收到拆分方案 + 自省置信度后路由：

**评估维度（Claude 自省打分）：**

| 维度 | 权重 | 0-0.4 (低) | 0.5-0.7 (中) | 0.8-1.0 (高) |
|------|------|-----------|-------------|------------|
| 领域边界清晰度 | 0.35 | unit 边界模糊，多个概念混杂 | 边界基本清晰，少量重叠 | 每个 unit 职责单一，边界明确 |
| 耦合关系明确度 | 0.30 | _refs 关系不确定，依赖方向存疑 | _refs 可推导但存在歧义 | _refs 关系清晰，依赖方向无争议 |
| 任务意图明确度 | 0.20 | 用户描述模糊，需猜测范围 | 意图基本清楚，个别细节待澄清 | 用户明确指定了全部范围和边界 |
| 拆分粒度合理性 | 0.15 | 子管线过大或过碎 | 粒度基本合理 | 每条子管线 1-2 个紧密耦合的 unit |

```
拆分置信度 = 领域边界清晰度×0.35 + 耦合关系明确度×0.30
            + 任务意图明确度×0.20 + 拆分粒度合理性×0.15
```

**opc_task_analysis_complete 推进决策：**

| 置信度 | opc_task_analysis_complete 路由行为 | 典型场景 |
|--------|------------|---------|
| ≥ 0.8 | 路由到 brief_generation，附带 step_instruction "通知用户拆分结果后继续" | _refs 完整 + 边界清晰 |
| 0.5-0.8 | 路由到 brief_generation，附带 step_instruction "快速确认拆分方案后继续" | 大部分常规任务 |
| < 0.5 | 路由到 ask_user（详细确认）或 reflection（深度审视） | 全新领域、边界模糊 |

**自动推进时 Claude 主动告知：**

```
"已自动拆分为 4 条子管线（置信度 0.87）:
  sub-1: 商品管理      (独立，无依赖)
  sub-2: 用户中心      (独立，无依赖)
  sub-3: 购物车        (依赖 sub-1, sub-2)
  sub-4: 下单与支付    (依赖 sub-3, sub-2)
 
 如需调整，回复'调整拆分'。"
```

### 7.5 纠错指令

| 指令 | 效果 |
|------|------|
| "调整拆分" / "修改子管线" | Claude 调 `opc_flow_restart(from_step: "task_decomposition")` |
| "合并 sub-1 和 sub-2" | Claude 调 `opc_flow_revise(field: "sub_pipelines", merge: ["sub-1", "sub-2"])` |
| "不用拆分了" | Claude 调 `opc_flow_revise(field: "decomposition", value: null)` 降级单管线 |
| "就这样" / "继续" | Claude 推进到 brief（next.tool） |

---

