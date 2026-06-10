# 04 反思流程

> 反思在 pipeline 全链路中的串联：per-step 反思时序、用户介入处理、用户自治（intensity / skip / on_demand）、pipeline 级 meta-reflection、与 `opc_flow_correct({action:"phase_reset"})` 的交互。

---

## 一、per-step 反思链路（标准时序）

> ⚠️ 本时序图遵循单驱动者原则：**`flow_next` 只从 state-server 发出**。`opc_reflect_complete({method})` 写盘 artifact 并发出 `pending_reflection`，Claude 必须调 `opc_flow_reflect({reflection_id})` 登记才能推进。详见 [06_call-sequence-contract.md](06_call-sequence-contract.md)。

每个判断点 P1–P8 的统一时序：

```mermaid
sequenceDiagram
    autonumber
    actor C as Claude (Host)
    participant SS as state-server
    participant RS as reflection-server
    participant MS as memory-store
    participant A as Sub-Agent
    actor U as User

    Note over C,U: ① 提交 evidence
    C->>SS: opc_flow_step_complete({step, evidence})
    SS->>SS: V1-V5 validator
    alt validator 失败
        SS-->>C: reject + 要求补 evidence
    end

    Note over C,U: ② 决定是否反思（用户自治）
    SS-->>C: flow_next: opc_reflect_plan<br/>(若 intensity=off 则跳过)

    alt intensity != off
        C->>RS: opc_reflect_plan(step, ctx)
        RS->>MS: opc_corrections({action:"query"})
        RS-->>C: { method, secondary, prior_corrections, budget, next_step_hint }

        Note over C,U: ③ 执行 primary 方法
        C->>RS: opc_reflect_execute({method, artifact, prompt})
        RS-->>C: agent_spec
        C->>A: Task(agent_spec)
        A-->>C: objections + reasoning_trace

        Note over C,U: ④ reflection-server 跑 meta-validator + 写盘 artifact + 发 pending_reflection
        C->>RS: opc_reflect_complete({method, objections})
        RS->>RS: meta-validator + 写盘 artifact 到 opc-logs/reflection/
        RS-->>C: { verdict, kept_objections, next_step_hint,<br/>pending_reflection: {reflection_id, artifact_path} }

        Note over C,U: ⑤ state-server 登记并决定下一步
        C->>SS: opc_flow_reflect({ reflection_id })
        SS->>SS: registry-guard 读 artifact + 登记到 reflection_log[]
        alt verdict=objections_remain
            SS-->>C: flow_next: opc_reflect_execute({method: secondary}) (secondary 方法)
            Note over C,A: 重复 ③–⑤
        else verdict=clean
            SS-->>C: flow_next: opc_flow_step_complete({step}) 后续 (上层流程继续)
        else rounds 耗尽 (rounds_exceeded)
            SS-->>C: ask_user + reasoning_trace
        end
    end

    Note over C,U: ⑥ 用户介入（任意时刻可触发）
    opt 反思建议 ask_user
        C->>U: ask_user(question + context)
        U-->>C: 纠正意见
        C->>SS: opc_flow_correct({action:"revise"})<br/>写 user_interventions[] (L1)
    end
```

---

## 二、用户自治：intensity / skip / on_demand

用户对反思强度有完全控制权，三种模式：

| 模式 | 设置位置 | 行为 |
|---|---|---|
| `intensity: high` | `.opc/config.json` 或 `/opc reflect intensity high` | 所有 step 都跑 primary + secondary |
| `intensity: medium` (默认) | 同上 | step P3/P5/P8 跑 primary + secondary，其余 primary |
| `intensity: low` | 同上 | 只在 step P3 / P5 跑 primary，其他仅 validator |
| `intensity: off` | 同上 | 全部跳过反思，仅 validator-only |
| `skip once` | `opc_flow_skip_reflection({step})` | 仅当前 step 跳过 |
| `on_demand` | `opc_reflect_admin({action:"on_demand", target})` | 用户主动触发对历史 step 的事后反思 |

**降级建议**：如果某 step 近 N 次反思 FP 率 > 阈值，server 会建议 `intensity` 降级或 `opc_reflect_admin({action:"unlearn_method"})`，但**最终权在用户**。

---

## 三、用户介入处理（intervention → L1 → L2）

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    actor C as Claude
    participant SS as state-server
    participant RS as reflection-server
    participant MS as memory-store

    Note over U,MS: ① 实时介入
    U->>C: "不对，应该 X"
    C->>SS: opc_flow_correct({action:"revise"}) / opc_pipeline_lifecycle({action:"replan"})
    SS->>SS: 写 user_interventions[] (L1 flow-state.json)
    SS-->>C: flow_next: 修正后继续

    Note over U,MS: ② pipeline 结束归档
    C->>SS: opc_pipeline_lifecycle({action:"complete"})
    SS-->>C: flow_next: opc_reflect_admin({action:"record_interventions"})

    C->>RS: opc_reflect_admin({action:"record_interventions", pipeline_id})
    RS->>A: 派 distiller sub-agent
    A->>SS: 读 L1 user_interventions[]
    A->>MS: opc_corrections({action:"query"}) (相似匹配)
    alt 找到相似
        A->>MS: 合并 + hotness++
    else 没有
        A->>MS: 新建 L2 条目
    end
    A-->>RS: 完成报告 (新增 / 合并数)
    RS-->>C: manifest 含新增教训摘要

    Note over U,MS: ③ 用户晋升到 L3（可选）
    U->>C: "这条经验所有项目都适用"
    C->>RS: opc_corrections({action:"promote", correction_id})
    RS->>MS: 写 ~/.opc/global-corrections.jsonl
```

---

## 四、Meta-reflection（pipeline 级总结）

pipeline 结束时除了归档纠正，还跑一次 meta-reflection，**反思本次反思本身**：

| 评估项 | 方法 |
|---|---|
| 各 step 反思的命中率（objection → evidence_diff 转化率） | TS 统计 + meta synthesizer agent |
| 哪些方法在哪些 step 表现差（FP 率高） | 自动建议 `opc_reflect_admin({action:"unlearn_method"})` |
| 哪些 corrections 被反复命中（应升 L3） | 推送给用户决定 |
| 反思总开销占比是否合理 | 与 budget 对比 |
| 用户介入与反思发现的重合率（反思是否「发现了用户会发现的事」） | 关键质量指标 |

输出：
- `opc-logs/meta-reflection/<pipeline-id>.md`
- 写入 `opc-memory/lessons/` 三层结构
- pipeline manifest 末尾追加「反思开销 / 新增教训 / 方法健康度变化」

---

## 五、与 `opc_flow_correct({action:"phase_reset"})` 的交互

phase 回退时反思状态如何处理：

| 回退层级 | 反思状态处理 |
|---|---|
| L0 仅当前 phase | 当前 step 的反思日志保留（供 audit），corrections 不回滚（教训不可丢失） |
| L1 + 下游 phase | 同 L0；下游 phase 的反思记录标记 `superseded=true` |
| L2 + 跨 sub 下游 | 同 L1 |
| L3 整个 pipeline | 反思日志保留；user_interventions[] 保留；新一轮 phase_start 时 prior_corrections 仍可注入 |

**关键性质**：反思状态**只追加、不回滚**。回退会重做反思，但历史教训永久留底，供后续 reflexion 注入。

---

## 六、端到端时序（pipeline 全程反思视角）

> ⚠️ 简化版示意：仅展示 state-server 与 reflection-server 的接力主线。完整 5 步铁律见 [06_call-sequence-contract.md 二](06_call-sequence-contract.md)。

```mermaid
sequenceDiagram
    autonumber
    actor C as Claude
    participant SS as state-server
    participant RS as reflection-server
    participant U as User

    Note over C,U: P1 意图
    C->>SS: opc_flow_step_complete({step:"intent_analysis", intent_evidence})
    SS-->>C: flow_next: opc_reflect_plan
    C->>RS: opc_reflect_plan + opc_reflect_complete({method:"cove"})
    RS-->>C: { verdict:clean, pending_reflection }
    C->>SS: opc_flow_reflect({ reflection_id })
    SS-->>C: flow_next: opc_flow_step_complete({step:"task_analysis"})

    Note over C,U: P2 任务分析
    C->>SS: opc_flow_step_complete({step:"task_analysis", evidence})
    SS-->>C: flow_next: opc_reflect_plan
    C->>RS: CoVe → objection → Critique (secondary)
    RS-->>C: { verdict:objections_remain, pending_reflection }
    C->>SS: opc_flow_reflect({ reflection_id })
    SS-->>C: ask_user (budget 或严重 objection)
    C->>U: ask_user
    U-->>C: 补充需求
    C->>SS: opc_flow_correct({action:"revise"}) → L1 写

    Note over C,U: P3 分解 / P4 brief / P5 节点选择
    Note over C,U: ... 每个 step 重复 plan → method → complete → ack → flow_reflect

    Note over C,U: P6/P7 执行与完成
    C->>SS: opc_node_finish({status:"completed"}) (validator-heavy)
    C->>SS: opc_phase_complete

    Note over C,U: P8 推进 / 回退
    alt auto_advance
        SS-->>C: flow_next phase_start
    else reset
        SS-->>C: opc_flow_correct({action:"phase_reset"})
    end

    Note over C,U: Pipeline 结束
    C->>SS: opc_pipeline_lifecycle({action:"complete"})
    SS-->>C: flow_next: opc_reflect_admin({action:"record_interventions"})
    C->>RS: distiller 提炼 L1 → L2
    RS->>RS: meta-reflection (本次方法表现)
    RS-->>C: { manifest, 新增教训, 健康度变化 } (无 flow_next)
```

---

## 七、子文档导航

| 子文档 | 内容 |
|------|------|
| [01_per-step-sequence.md](01_per-step-sequence.md) | **P3 / P4 / P7 / P8 反思工作示例**（P1 / P2 / P5 / P6 在本文档六 + e2e 04/05 已展开）|
| 02_user-autonomy.md | intensity / skip / on_demand 完整 API + 默认 |
| 03_intervention-archival.md | L1 → L2 → L3 归档链与 distiller 提示词 |
| [04_meta-reflection.md](04_meta-reflection.md) | **A/B/C/D 四类 meta-validator 规则 + FP/FN 指标 + unlearn 阈值（PoC TODO）** |
| 05_phase-reset-interaction.md | 与 state-server phase_reset 的边界 |
| [06_call-sequence-contract.md](06_call-sequence-contract.md) | 单驱动者契约 + reflection-registry-guard 三层防御 + 5 步铁律 + 命名约定 + 不变量 |
| [07_three-server-seam-matrix.md](07_three-server-seam-matrix.md) | **接缝矩阵**：P1–P8 × 触发器/evidence/方法/pending/持久化/knowledge/降级一表打通 |

---

## 八、核心设计原则

- **per-step 统一时序**：plan → method → meta-validator → 路由，所有 step 复用
- **用户自治优先**：intensity / skip / on_demand 三档自由切换，server 只建议不强制
- **介入永久沉淀**：L1 → L2 → L3 链路保证教训不丢失
- **反思自身被反思**：每个 pipeline 跑一次 meta-reflection，淘汰差方法
- **回退不丢教训**：反思状态只追加不回滚，phase_reset 后历史 corrections 仍可注入
- **永不阻塞**：所有反思失败链最差降级到 validator-only + ask_user

---

## 九、相关文档

- [01 反思方法学](../01-method-theory/00_overview.md) — 各 step 的 primary / secondary 方法
- [02 server 设计](../02-server-design/00_overview.md) — 反思工具 + meta-validator + 可观测性
- [03 corrections 存储](../03-corrections-store/00_overview.md) — L1 / L2 / L3 三层存储
- [02 opc-state-server / 03 phase](../../02-opc-state-server/03-phase/00_overview.md) — phase_reset 与反思状态交互
- [04 e2e](../../04-e2e/00_index.md) — 反思相关测试用例 11–15
