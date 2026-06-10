# 02 — 8 Step × 5 Method 决策矩阵

> 本章展开 `00_overview.md` §五的决策表，提供每个 step 的完整
> primary/secondary 选择逻辑、决策树分支条件、inline-mode 映射、
> 以及与 method 健康度统计的交互。

## 一、完整决策矩阵

每个 reflection point (P1–P8) 配一个 primary method 和一个 secondary
method。Primary 必跑；secondary 仅在 primary 触发 objection 时执行
（节省 token）。

| Step | Primary | 触发 secondary 条件 | Secondary | 触发 ask_user 条件 |
|---|---|---|---|---|
| P1 意图分类 | M3 CoVe | V2 判定 ≥1 objection | M4 Critique | secondary 也 objection |
| P2 任务分析 | M3 CoVe | V2 ≥1 objection | M2 Reflexion | secondary 也 objection |
| P3 分解 | M6 ToT | V5 判定分支同质化 或 best score < 3 | M5 Debate | secondary 也 objection |
| P4 Brief | M3 CoVe | V2 ≥1 objection | M4 Critique | secondary 也 objection |
| P5 节点选择 | M4 Critique | complexity ≥ medium 且 V3 ≥1 objection | M5 Debate | secondary 也 objection 或 complexity=simple 时 primary objection |
| P6 节点执行 | V1–V5 (Deterministic) | V1/L1/L2 失败 | M4 Critique | critic 也 objection |
| P7 阶段完成 | V1–V5 (Deterministic) | quality_gate 未通过 | M3 CoVe | CoVe 也 objection |
| P8 阶段推进 | M4 Critique | V3 ≥1 objection 且 涉及回退决策 | M5 Debate | secondary 也 objection |

**规则总结**：
- A 类失败（分类）→ M3 CoVe primary，M4 Critique secondary
- B 类失败（完整性）→ M3 CoVe primary，M2 Reflexion 或 M4 Critique secondary
- C 类失败（执行）→ Validator primary，M4 Critique 或 M3 CoVe secondary
- D 类失败（元决策）→ M4 Critique 或 M6 ToT primary，M5 Debate secondary

## 二、8 个 Step 的决策树

### P1 — 意图分类

```
opc_flow_step_complete({step:"intent_analysis"})
    │
    ▼
opc_reflect_plan({step:"P1"})
    │
    ▼
M3 CoVe: 拆 "task 判定 5 条信号"
    ├── V2 判定 clean → done (no reflection needed)
    ├── V2 判定 ≥1 objection →
    │       │
    │       ▼
    │   M4 Critique: critic 独立审查分类结果
    │       ├── V3 判定 clean → record correction + done
    │       └── V3 判定 objection →
    │           ask_user: "这是任务吗？(y/n/需要调整)"
    │
    └── V2 判定 severe objection →
        ask_user (跳过 secondary)
```

**inline-mode**：P1 支持 3-step inline（见 §三）。

### P2 — 任务分析

```
opc_flow_step_complete({step:"task_analysis"})
    │
    ▼
M3 CoVe: 列 "需求 5 要素" 逐条验证
    ├── V2 clean → done
    ├── V2 ≥1 objection →
    │       │
    │       ▼
    │   M2 Reflexion: 查同 step 历史教训，注入 prompt
    │       │   如果命中 ≥3 条教训 → M2 优先
    │       │   否则 M2 作为 secondary
    │       ├── 无 violation → record correction + done
    │       └── 有 violation → ask_user + record correction
    │
    └── V2 severe → ask_user (跳过 secondary)
```

### P3 — 分解

```
opc_flow_step_complete({step:"task_decomposition"})
    │
    ├── complexity = simple → skip reflection (3 sub-pipelines)
    ├── complexity = medium / high →
    │       │
    │       ▼
    │   M6 ToT: 生成 3-5 个分解方案 → 评估 → 剪枝
    │       ├── V5 判定 best_score ≥ 4 且 分支多样化 → done
    │       ├── V5 判定 分支同质化 或 best_score < 3 →
    │       │       │
    │       │       ▼
    │       │   M5 Debate: pro/con 辩论当前 best 方案
    │       │       ├── verdict: pro/compromise → done
    │       │       └── verdict: con/inconclusive → ask_user
    │       │
    │       └── V5 severe → ask_user
    │
    └── complexity = high → 无论 ToT 结果，始终跑 Debate 作为补充
```

### P4 — Brief 生成

```
opc_flow_step_complete({step:"brief_generation"})
    │
    ▼
M3 CoVe: brief 字段逐条对照 task_analysis 输出
    ├── V2 clean → done
    ├── V2 ≥1 objection →
    │       ▼
    │   M4 Critique: critic 审查 brief 偏离
    │       ├── V3 clean → record correction + done
    │       └── V3 objection → ask_user
    │
    └── V2 severe → ask_user
```

### P5 — 节点选择

```
opc_phase_confirm
    │
    ├── complexity = simple → 仅 scenario 匹配检查 (V0.x)
    │       └── matched → done，未匹配 → ask_user
    │
    ├── complexity ≥ medium →
    │       │
    │       ▼
    │   M4 Critique: critic 审查节点组合
    │       ├── V3 clean → done
    │       └── V3 ≥1 objection →
    │               │
    │               ▼
    │           M5 Debate: pro/con 辩论节点选择
    │               ├── verdict: pro/compromise → done
    │               └── verdict: con/inconclusive → ask_user
    │
    └── complexity = high → M5 Debate 始终执行（不限 primary 结果）
```

### P6 — 节点执行

```
opc_node_finish({status:"success"})
    │
    ├── V1 (L1 工件存在性) → 失败? → ask_user
    ├── V2–V5 (按 node 类型选择) → 失败? →
    │       │
    │       ▼
    │   M4 Critique: critic 审查 evidence
    │       ├── V3 clean → record correction + done
    │       └── V3 objection → ask_user
    │
    └── 全部通过 → done
```

### P7 — 阶段完成

```
opc_phase_complete
    │
    ├── L2 quality_gate → 失败? →
    │       │
    │       ▼
    │   M3 CoVe: quality_gate 逐条验证
    │       ├── V2 clean → done (gate 真跑)
    │       └── V2 objection → ask_user
    │
    └── L2 通过 → done
```

### P8 — 阶段推进

```
auto_advance (由 phase_complete 触发)
    │
    ▼
M4 Critique: critic 审查是否该推进（vs 回退）
    ├── V3 clean → advance
    └── V3 ≥1 objection:
        ├── 涉及回退决策 (L1/L2/L3) →
        │       │
        │       ▼
        │   M5 Debate: pro(推进)/con(回退) 辩论
        │       ├── pro → advance
        │       ├── con → phase_reset
        │       └── inconclusive → ask_user
        │
        └── 不涉及回退 → ask_user
```

## 三、Inline-mode 映射

`opc_reflect_execute({mode:"inline"})` 将 6 步标准流程压缩为 3 步，
仅在某些 low-complexity 场景下启用：

| 标准步骤 | Inline 步骤 | 压缩方式 |
|---|---|---|
| plan | plan（合并 stats + corrections 注入） | plan 不再单独查 statistics |
| execute | execute（合并 dispatch + collect） | 去掉了 sub-agent dispatch，由 Host 内联执行 |
| complete | complete（合并 validate + record） | TS 校验 + corrections 写入一步完成 |

**Inline 可用条件**：
- `complexity = simple` 且 method ≠ M5/M6（太重）
- 或 `OPC_REFLECTION_MODE=inline` 环境变量强制

**Inline 不可用条件**：
- `complexity ≥ medium`
- method 为 M5 Debate（需要多 agent）或 M6 ToT（需要多次探索）
- step 为 P3（decomposition 需要完整 ToT 搜索）

## 四、决策矩阵与 method 健康度的交互

`opc_reflect_plan` 在查表选 method 前，先查询 method 健康度：

```
opc_reflect_admin({action:"query_stats"}) →
    对每个 candidate method:
        FP_rate = 近 N 次中 meta-validator 拒收的比例
        if FP_rate > THRESH_FP: 临时禁用该 method（记录到 unlearn 列表）
        if 禁用后无可用 method: 降级到 validator-only + ask_user
```

**健康度加权决策**：
- 某 method 被 unlearn 后，其位置由 secondary method 替代
- 若 primary + secondary 均被 unlearn → 跳过 reflection，validator-only
- unlearn 有 TTL（`UNLEARN_TTL_HOURS`），过期后 method 自动恢复

详见 [04_composition-rules.md](./04_composition-rules.md)。

## 五、跨 Step 的 method 使用频率

| Method | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | 总次数（单管线） |
|---|---|---|---|---|---|---|---|---|---|
| M3 CoVe | primary | primary | — | primary | — | — | secondary | — | 4 |
| M4 Critique | secondary | — | — | secondary | primary | secondary | — | primary | 4 |
| M5 Debate | — | — | secondary | — | secondary | — | — | secondary | 3 |
| M2 Reflexion | — | secondary | — | — | — | — | — | — | 1 |
| M6 ToT | — | — | primary | — | — | — | — | — | 1 |
| Validator | — | — | — | — | — | primary | primary | — | 2 |

## 六、相关文档

- [01 方法目录](./01_method-catalog.md) — 5 种方法的完整定义
- [03 失败模式](./03_failure-modes.md) — 4 类失败的诊断与路由
- [04 组合规则](./04_composition-rules.md) — primary/secondary/禁用/max_rounds
- [父文档](./00_overview.md) — 方法学总览
