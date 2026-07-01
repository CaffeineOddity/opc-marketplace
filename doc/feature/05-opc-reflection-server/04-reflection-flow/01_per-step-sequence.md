# 01 per-step 反思时序

> 配套 [06_call-sequence-contract.md](06_call-sequence-contract.md) 的契约规范、[07_three-server-seam-matrix.md](07_three-server-seam-matrix.md) 的接缝矩阵；本文档给 **P3 / P4 / P7 / P8 四个尚未在其他文档展开的反思位点** 各一个工作示例（P1 / P2 / P5 / P6 已分别在 [00_overview 六 端到端时序](00_overview.md#六端到端时序pipeline-全程反思视角)、[04-e2e/02-test/04_medium-single.md](../../../04-e2e/02-test/04_medium-single.md) 和 [04-e2e/02-test/05_high-single.md](../../../04-e2e/02-test/05_high-single.md) 中展开）。
>
> P6 / P7 的"反思"实际走 Validator-only（不调 `opc_reflect_*` 工具面）；本文档 P7 给出的是 **Claude 主动升级到 reflection 工具面** 的工作示例，详见 [02-server-design 三·补](../02-server-design/00_overview.md#三补-p6--p7-不走-reflection-工具面边界澄清)。

---

## P3 任务拆分 — M6 ToT 主路径

**场景**：用户输入"实现完整电商：商品 + 用户中心 + 购物车 + 订单 + 支付"。`opc_flow_step_complete({step:"task_decomposition"})` 后跑 P3 反思，验证 5 个 sub-pipeline 边界合理。

```
Claude → opc_flow_step_complete({step:"task_decomposition",
           sub_pipelines:[product, user-center, cart, order, payment],
           execution_order:["product","user-center","cart","order","payment"],
           decomposition_evidence:{
             boundary_rationale:["product/cart 共享 SKU model","..."],
             dependency_graph:{cart:["product"], order:["cart","user-center"], payment:["order"]},
             unit_isolation_check:[{unit:"product",isolated:true}, ...]
           }})
  → state-server V1+V2+V3+V5 全 pass
  → flow_next: opc_reflect_execute({step:"task_decomposition", inline:true})

Claude → opc_reflect_execute({
           step:"task_decomposition",
           method:"tot",
           inline:true,
           artifact:{...decomposition_evidence...}
         })
  → reflection-server 内部:
    1. opc_reflect_plan 选 M6 ToT (P3 primary), corrections_query 取近 3 条同类教训
    2. Task spawn 3 个 tot-explorer (read-only), 各产 2-3 分支
       分支 A: 现状（5 sub）
       分支 B: 4 sub（合并 cart+order）
       分支 C: 6 sub（拆 product → catalog+inventory）
    3. critic agent 对每分支评分，剪枝
    4. meta-validator: ToT 分支评分不全 > 0.9 (避免乐观偏差) ✓
    5. 写盘 .opc/logs/reflection/sess-abc/rfl-P3-r1-01H.json
  → 返回 {
      verdict:"clean",
      best_path:"A",
      pruning_rationale:["B 合并破坏单一职责","C 过早优化"],
      pending_reflection:{reflection_id:"rfl-P3-r1-01H", artifact_path, expires_at}
    }

Claude → opc_flow_reflect({reflection_id:"rfl-P3-r1-01H"})
  → state-server 登记到 flow-state.reflection_log[]
  → flow_next: opc_flow_step_complete({step:"brief_generation"})
```

**Secondary 升级路径**：若 verdict=objections_remain 且 complexity ≥ medium，state-server 路由 `opc_reflect_execute({method:"debate", inline:true})` 派 2 个 debater 对立辩论（"5 sub 是否过细" vs "5 sub 边界天然清晰"），meta-validator 校验立场重合度 < 阈值。

---

## P4 Brief 生成 — M3 CoVe 轻量验证

**场景**：medium 单管线（短信验证码登录），brief 生成后跑 P4 反思，验证 brief 是否完整覆盖 P2 的 requirements。

```
Claude → opc_flow_step_complete({step:"brief_generation",
           brief_content:"<markdown>",
           brief_evidence:{
             brief_to_task_mapping:[
               {brief_section:"功能", task_req:"短信验证码登录", coverage:"full"},
               {brief_section:"验收", task_req:"5分钟过期", coverage:"full"},
               {brief_section:"边界", task_req:"sms-gateway 依赖", coverage:"partial"}
             ],
             coverage_score:0.83
           }})
  → state-server V1 + V4 coverage：阈值 0.8，0.83 ≥ 0.8 ✓
  → 默认 budget = 1 轮，flow_next: opc_reflect_execute({step:"brief_generation", inline:true})

Claude → opc_reflect_execute({step:"brief_generation", method:"cove", inline:true,
                              artifact:{brief_content, brief_evidence}})
  → reflection-server 内部:
    1. CoVe 拆 brief 为 4 条断言:
       a1: "支持手机号 + 验证码登录"
       a2: "验证码 6 位数字"  ← brief 未明确，可疑
       a3: "5 分钟过期"
       a4: "调用 sms-gateway"
    2. 对每条断言生成验证问题，查 task_analysis_evidence
    3. a2 "6 位数字" 在 evidence 中找不到 → 标 missing_in_source
    4. meta-validator: reasoning_trace 包含 ≥ 4 条断言 ✓
    5. 写盘 artifact
  → 返回 {
      verdict:"objections_remain",
      kept_objections:[{id:"obj-a2", text:"brief 未指定验证码格式", evidence_ref:"a2"}],
      pending_reflection:{reflection_id:"rfl-P4-r1-01J", ...}
    }

Claude → opc_flow_reflect({reflection_id:"rfl-P4-r1-01J"})
  → state-server: rounds=1, max_rounds=2, kept_objections 仅 1 条且非严重
  → 判定 verdict ≈ clean，flow_next: opc_pipeline_create（带 obj-a2 作为 warning 透传到 brief）
```

**FP 降级**：若该项目近 5 次 P4 反思命中率 < 20%（objection 都被用户裁定为 false positive），`opc_reflect_admin({action:"query_stats", step:"brief_generation"})` 触发降级建议 `intensity:off`，brief 跳过反思直接 `opc_pipeline_create`。

---

## P7 阶段完成 — 主动升级到反思工具面（M3 CoVe）

**默认路径**：P7 走 Validator-only，state-manager 内部跑 L1+L2 聚合校验，不调 `opc_reflect_*`。下面展示**升级路径**——当 quality_gate 在本 phase 内连续自动跑失败 ≥ 阈值（默认 3 次）时，Claude 主动调反思工具面逐条核对。

```
Claude → opc_phase_complete({phase:"06-testing"})
  → state-manager Validator-only 跑:
    L1 artifacts 存在性 ✓
    L2 quality_gates:
      - coverage ≥ 80%: 第 1 次自动跑 79.5%（fail），重跑 81%（pass）
      - lint clean: ✓
      - integration test: 第 1 次超时（fail），重跑 ✓
      - mutation score ≥ 60%: 56%（fail），57%（fail），58%（fail）← 3 次连续 fail
  → state-manager 检测到 mutation gate ≥ 3 次连续 fail
  → 不直接 reject，而是 flow_next: opc_reflect_execute({
        step:"phase_completion",
        method:"cove",
        inline:true,
        upgrade_reason:"quality_gate_consecutive_failures"
      })

Claude → opc_reflect_execute(...)
  → reflection-server:
    1. CoVe 拆 phase_evidence 的 quality_gate_results 为断言:
       "mutation score 阈值 60% 合理"
       "测试用例集足以杀掉 mutation"
    2. 派 critic 读 test 文件 + mutation report
    3. critic 发现：被测代码包含大量 defensive null check，mutation 集中在这些分支
    4. kept_objection: "阈值 60% 对当前防御性代码风格过严，建议降到 55% 或补 mutation 杀手测试"
    5. meta-validator + 写盘
  → 返回 {
      verdict:"objections_remain",
      kept_objections:[{id, text, evidence_ref:"mutation-report.json#L42"}],
      pending_reflection:{reflection_id:"rfl-P7-r1-01K", ...}
    }

Claude → opc_flow_reflect({reflection_id:"rfl-P7-r1-01K"})
  → state-server 登记
  → ask_user("mutation score 多次未达 60%，反思建议降阈值或补测试，请裁定")
  → 用户回 "补测试" → opc_flow_user_reply → opc_phase_complete 维持 reject → opc_node_finish({status:"retry"}) 重跑测试节点
```

**关键约束**：P7 升级反思**必须由 Claude 显式调用** `opc_reflect_execute`，state-manager 不会自动升级——这是为了让升级行为可审计、可关闭（`intensity:off` 时 Claude 不会主动升级）。

---

## P8 阶段推进 / 回退 — M4 Critique 主路径

**场景**：05-implement phase 已完成，准备推进到 06-testing；但 evidence 出现 regression 信号（某 unit 的 version 比 phase_start 时低，疑似被外部回滚）。

```
Claude → opc_phase_complete({phase:"05-implement"})
  → Validator-only L1+L2 ✓
  → flow_next: opc_flow_step_complete({step:"phase_advance",
                advance_evidence:{
                  auto_advance_4_conditions:{
                    complexity_le_medium:true,
                    p5_evidence_pass:true,
                    node_completion_rate:1.0,
                    next_in_phase_plan:true
                  },
                  unblocked_phases:["06-testing"],
                  regression_signals:[{
                    type:"unit_version_decrease",
                    unit:"user-auth/session",
                    expected_min_version:3,
                    actual_version:2,
                    detected_at:"phase_advance_pre_check"
                  }]
                }})
  → state-server V1+V3+V4 校验 4 条件全 ✓，但 regression_signals 非空 → 强制反思
  → flow_next: opc_reflect_execute({step:"phase_advance", inline:true})

Claude → opc_reflect_execute({step:"phase_advance", method:"critique", inline:true,
                              artifact:{advance_evidence}})
  → reflection-server:
    1. 派 critic agent (read-only + opc_corrections({action:"query"}) 查"回退决策"类教训)
    2. critic 读 state.json.snapshots[] + git log user-auth/session.md
    3. 发现：05-implement 中某 node 误调 opc_knowledge_write 时 base_version 用了 v1 → auto_merged 把 v3 内容合并丢了一条
    4. kept_objection: "session unit 存在静默回滚，推进 06-testing 会基于错误状态"
    5. meta-validator + 写盘
  → { verdict:"objections_remain", kept_objections:[...], pending_reflection:{...} }

Claude → opc_flow_reflect({reflection_id})
  → state-server: 严重 objection + regression 类型
  → 不路由 06-testing，路由 ask_user
  → ask_user("检测到 session 静默回滚，建议 opc_flow_correct({action:'phase_reset', target:'05-implement'})")
  → 用户确认 → opc_flow_correct({action:"phase_reset"}) → git checkout confirm_ref + v+1 写回
```

**Secondary 升级（仅回退决策时启用）**：若用户提议回退多个 phase（L2 / L3 级），P8 反思自动升级到 M5 Debate，2 个 debater 分别站"最小化回退（仅 05）"和"安全回退（04 + 05）"立场，meta-validator 校验立场重合度。

---

## 共通要素提炼

| 维度 | P3 | P4 | P7（升级路径）| P8 |
|---|---|---|---|---|
| Primary 方法 | M6 ToT | M3 CoVe | M3 CoVe（升级时）| M4 Critique |
| Secondary 触发 | complexity ≥ medium | coverage < 阈值 | quality_gate 连续 fail ≥ 阈值 | 决策方向 = 回退 |
| inline 模式 | ✅ 默认 | ✅ 默认 | ✅ 默认 | ✅ 默认 |
| `pipeline_pointer_ref` | ❌ | ❌ | ✅ phase | ✅ phase |
| 触发 ask_user 的条件 | rounds 耗尽 + primary 也失败 | FP 率高时降级 off | 严重 objection + 涉及验收阈值 | regression_signals 非空 / 回退方向不明 |
| 写入 `state.json` 的反思 log 路径 | `flow-state.reflection_log[]`（无 pipeline_pointer）| 同 P3 | `state.json.phases[].phase_reflection_log[]` | `state.json.phases[].advance_reflection_log[]` |

> P1 / P2 / P5 / P6 在 [00_overview 六 端到端时序](00_overview.md#六端到端时序pipeline-全程反思视角) / [04-medium-single](../../../04-e2e/02-test/04_medium-single.md) / [05-high-single](../../../04-e2e/02-test/05_high-single.md) 已展开，本文档不重复。

---

## 相关文档

- [00_overview.md](00_overview.md) — 反思流程总览
- [06_call-sequence-contract.md](06_call-sequence-contract.md) — 单驱动者契约 + 5 步铁律
- [07_three-server-seam-matrix.md](07_three-server-seam-matrix.md) — 三服务接缝矩阵
- [04_meta-reflection.md](04_meta-reflection.md) — 元校验规则与健康度指标
- [02-server-design 三·补 P6/P7 边界](../02-server-design/00_overview.md#三补-p6--p7-不走-reflection-工具面边界澄清)
