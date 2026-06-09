# 任务拆分

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 七、任务拆分（方法论：prompts/task-decomposition.md）

### 7.1 触发条件

`opc_task_analysis_complete` 检测到 analysis_result 中需要**修改**的 unit 数量 ≥ 2 时，路由返回拆分指令：

```json
{
  "step": "task_decomposition",
  "step_instruction": "按方法论执行拆分分析，收集 decomposition_evidence，提交给 opc_decomposition_complete。",
  "methodology": {
    "docs": ["prompts/task-decomposition.md"],
    "ref": "§7.2 拆分原则 + 05-opc-reflection-server §二 decomposition_evidence schema",
    "summary": "按领域边界拆，独立的拆开，紧密耦合的合并，通过 _refs 推导依赖"
  },
  "schema": { sub_pipelines, execution_order, decomposition_evidence },
  "next": {"tool": "opc_decomposition_complete"}
}
```

> 本步骤走 reflection-server **P3 反思位点**，提交 `decomposition_evidence`（schema 包含 `boundary_rationale[]` / `dependency_graph` / `unit_isolation_check[]` 等，详见 [05-opc-reflection-server/02-server-design/00_overview.md §二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)）。路由由 V1-V5 验证器 + meta-validator 输出，primary 方法 = M6 ToT（探索多种切分方案），secondary = M5 Debate（complexity ≥ medium 启用），详见 [05-opc-reflection-server/01-method-theory/00_overview.md §五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

修改数 = 1 时跳过：opc_task_analysis_complete 直接路由到 brief_generation。

```
修改数 = 1：跳过拆分
  → 例："给用户认证加个短信验证" → user-auth(update) + notification(read)
  → notification 只读 → 单管线

修改数 ≥ 2：opc_task_analysis_complete 路由到 task_decomposition
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
  "decomposition_evidence": {
    "boundary_rationale": [
      {"sub_id": "sub-1", "rationale": "product 是独立领域，无外部 _refs"},
      {"sub_id": "sub-4", "rationale": "order/payment 紧密耦合，合并为一条 sub"}
    ],
    "dependency_graph": [
      {"from": "sub-3", "to": ["sub-1", "sub-2"], "source": "cart._refs"},
      {"from": "sub-4", "to": ["sub-3", "sub-2"], "source": "order._refs"}
    ],
    "unit_isolation_check": [
      {"unit": "product", "shared_with": [], "isolated": true},
      {"unit": "user-center", "shared_with": [], "isolated": true}
    ]
  }
}
```

### 7.4 路由（由 opc_decomposition_complete 按 V1-V5 + meta-validator 结果分流）

详见 [03_flow-tools-step-routing.md §opc_decomposition_complete](03_flow-tools-step-routing.md#opc_decomposition_complete)。

| validator 结果 | 路由行为 | 典型场景 |
|----------------|---------|---------|
| V1-V5 pass + 无严重 objection | 路由到 brief_generation，附 step_instruction "拆分方案 evidence 通过验证，开始生成 brief" | _refs 完整 + 边界清晰 |
| V1-V5 pass + 中等 objection | 路由到 brief_generation，附 step_instruction "展示方案 + reasoning_trace 后开始生成 brief" | 大部分常规任务 |
| V1-V5 fail 或 严重 objection | 路由到 P3 反思（primary=M6 ToT，secondary=M5 Debate），受 budget-guard 约束；budget 耗尽 → ask_user | 全新领域、边界模糊 |

**自动推进时 Claude 主动告知：**

```
"已自动拆分为 4 条子管线（P3 evidence 通过 V1-V5）:
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

