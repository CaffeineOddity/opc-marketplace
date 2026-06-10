# Task Decomposition Method (P3)

> Methodology for `opc_decomposition_complete`. Loaded as a docs
> reference when Claude is at `current_step = task_decomposition`.
> Spec source:
> [doc/feature/02-opc-state-server/01-intent-analysis/07_task-decomposition.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/07_task-decomposition.md).

## 1. Purpose

Split a multi-unit task into independently executable
`sub_pipelines[]` with a correct `execution_order` derived from
`_refs`. Emit `decomposition_evidence` (NOT a confidence number) so
the P3 reflection layer can validate via V1–V5 + meta-validator.

## 2. When this step fires

Triggered by `opc_task_analysis_complete` ONLY when
`analysis_result.knowledge_plan` contains **modify count ≥ 2**.

```
modify count = 1 → skip decomposition → brief_generation
modify count ≥ 2 → task_decomposition (this step)
  → if modified units cross-reference via _refs → merge into one sub
  → if modified units are independent          → split into separate subs
```

A `read`-only unit never increases the modify count — only `create`
/ `update` count.

## 3. Decomposition principles

| Principle | Action |
|---|---|
| Domain boundary | Each `knowledge_unit` ≈ one domain. One sub_pipeline owns 1–2 tightly-coupled units. |
| Independent → split | Two units with no `_refs` between them → separate subs, parallelizable. |
| Tightly coupled → merge | Two units with strong `_refs` → same sub. |
| Dependency derivation | `unitA._refs → [unitB, unitC]` means `subA blocked_by [subB, subC]`. |

### 3.1 Worked example

```
knowledge_unit: [product, cart, order, payment, user-center]
                    ↓
sub-1: product          (no _refs out, no _refs in → independent)
sub-2: user-center      (no _refs out, no _refs in → independent)
sub-3: cart             (cart._refs → [product, user-center])
sub-4: order + payment  (order._refs → [cart, user-center]; payment merged because order ↔ payment _refs are bidirectional)
```

Resulting `execution_order`:

```json
[
  {"group": 1, "sub_pipeline_ids": ["sub-1", "sub-2"]},
  {"group": 2, "sub_pipeline_ids": ["sub-3"]},
  {"group": 3, "sub_pipeline_ids": ["sub-4"]}
]
```

## 4. Evidence schema (REQUIRED — replaces `confidence: number`)

```json
{
  "decomposition_evidence": {
    "boundary_rationale": [
      {"sub_id": "sub-1", "rationale": "product is a standalone domain, no outgoing _refs"},
      {"sub_id": "sub-4", "rationale": "order/payment are bidirectionally coupled, merged into one sub"}
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

- `boundary_rationale[]` MUST cover every sub_id in
  `sub_pipelines[]`. Missing sub_ids fail V1.
- `dependency_graph[].source` MUST cite the actual `_refs` field
  (e.g. `cart._refs`) that justifies the edge — synthetic
  justifications fail V3.
- `unit_isolation_check[].shared_with` MUST list every other
  knowledge_unit that holds an `_refs` to this unit. Empty list
  with `isolated: true` is OK; non-empty with `isolated: true` is
  a V2 hard fail.

## 5. Output contract

```json
{
  "sub_pipelines": [
    {"id": "sub-1", "title": "商品管理", "knowledge_unit": ["product"], "blocked_by": []},
    {"id": "sub-2", "title": "用户中心", "knowledge_unit": ["user-center"], "blocked_by": []},
    {"id": "sub-3", "title": "购物车", "knowledge_unit": ["cart"], "blocked_by": ["sub-1", "sub-2"]},
    {"id": "sub-4", "title": "下单与支付", "knowledge_unit": ["order", "payment"], "blocked_by": ["sub-3", "sub-2"]}
  ],
  "execution_order": [
    {"group": 1, "sub_pipeline_ids": ["sub-1", "sub-2"]},
    {"group": 2, "sub_pipeline_ids": ["sub-3"]},
    {"group": 3, "sub_pipeline_ids": ["sub-4"]}
  ],
  "decomposition_evidence": { ... },
  "next": { "tool": "opc_decomposition_complete" }
}
```

Hard validation errors raised by `opc_decomposition_complete`:

- `execution_order` group N references a sub_id NOT in
  `sub_pipelines[]` — fails fast.
- `blocked_by` references a sub_id NOT in `sub_pipelines[]` — fails
  fast (topology validator).
- Any `sub_pipelines[].knowledge_unit` not present in the upstream
  `analysis_result.knowledge_unit` — drift error.
- Cycle in `blocked_by` graph — TopologyError.

## 6. Routing by validator result

Spec [§7.4](../../../../doc/feature/02-opc-state-server/01-intent-analysis/07_task-decomposition.md):

| V1–V5 + meta result | Effect |
|---|---|
| All pass + no severe objection | Route to `brief_generation`. `step_instruction`: "decomposition evidence passed, start brief". |
| Pass + medium objection | Same, plus `reasoning_trace` shown to user before brief. |
| Fail or severe objection | Enter P3 reflection: primary=M6 (ToT, explore alternate splits), secondary=M5 (Debate, ≥ medium). Rounds-guard bounded; exhausted → `ask_user`. |

Method definitions:
[05-opc-reflection-server/01-method-theory/00_overview.md](../../../../doc/feature/05-opc-reflection-server/01-method-theory/00_overview.md).

## 7. Auto-advance announcement (when V1–V5 all pass)

When advancing without P3 reflection, Claude tells the user:

```
"已自动拆分为 4 条子管线（P3 evidence 通过 V1-V5）:
  sub-1: 商品管理      (独立)
  sub-2: 用户中心      (独立)
  sub-3: 购物车        (依赖 sub-1, sub-2)
  sub-4: 下单与支付    (依赖 sub-3, sub-2)
 如需调整，回复'调整拆分'。"
```

This is mandatory — silent auto-advance breaks the user's ability
to short-confirm.

## 8. Correction commands (post-decomposition)

| User phrase | Tool to call |
|---|---|
| "调整拆分" / "修改子管线" | `opc_flow_restart({from_step:"task_decomposition"})` |
| "合并 sub-1 和 sub-2" | `opc_flow_revise({field:"sub_pipelines", merge:["sub-1","sub-2"]})` |
| "不用拆分了" | `opc_flow_revise({field:"decomposition", value:null})` — degrades to single pipeline |
| "就这样" / "继续" | Honor previous `flow_next` (typically `opc_brief_generation_complete`); no flow tool needed |
