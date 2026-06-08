# 阶段

阶段根据任务信号自主选择节点，node-resolver 自动解析依赖、拓扑排序、生成执行计划。每个阶段目录自包含：`phase.md` + `nodes.md` + `nodes/` + `templates/`。

本文档已按主题拆分为多个子文档，本文是**聚合索引**，按阅读顺序指向各子文档。

---

## 阶段生命周期时序图

`opc_phase_start` → 节点选择反思 → `opc_phase_confirm` → 逐 node 执行 → `opc_phase_complete` 的完整链路：

```mermaid
sequenceDiagram
    autonumber
    actor C as Claude
    participant PH as phase-tools<br/>(state-server)
    participant NR as node-resolver
    participant SM as state-manager
    participant ND as node-tools
    participant A as Sub-Agent
    participant K as knowledge-server

    Note over C,K: ① 进入阶段
    C->>PH: opc_phase_start({sub_id, phase})
    PH->>PH: 扫描可用节点<br/>(tag 过滤 + scenario 标记)
    PH-->>C: 节点候选集<br/>+ phase.md 元信息<br/>+ methodology

    Note over C,K: ② 节点选择 + 自省
    C->>C: 语义匹配 + 置信度打分<br/>(4 维度自省评估)
    alt 置信度 < 阈值
        C->>PH: opc_flow_reflect()
        PH-->>C: 反思指令
        C->>C: 重新选择
    end

    Note over C,K: ③ 锁定执行计划
    C->>PH: opc_phase_confirm({nodes, blocked_by})
    PH->>NR: resolve(phase, nodes)
    NR->>NR: 依赖解析<br/>+ 拓扑排序<br/>+ 文件域冲突检测
    NR-->>PH: execution_order 分组
    PH->>K: 生成 knowledge 快照
    PH-->>C: 已锁定 + flow_next: opc_node_start

    Note over C,K: ④ 逐 group 执行 node
    loop 每个并行组
        par 组内并行
            C->>ND: opc_node_start(node_a)
            ND->>A: dispatch sub-agent
            A->>A: 执行 node_body
            A->>ND: evidence 回报
            ND->>SM: validate_node_completion<br/>(L1 + L2)
        and
            C->>ND: opc_node_start(node_b)
            ND->>A: dispatch sub-agent
            A->>ND: evidence
        end
    end

    Note over C,K: ⑤ 完成阶段
    C->>PH: opc_phase_complete()
    PH->>SM: 校验全部 node completed
    PH->>PH: auto_advance 4 条件判定

    alt 自动推进
        PH-->>C: flow_next: opc_phase_start<br/>(下一阶段)
    else 显式确认
        PH-->>C: 询问下一阶段
    else 全部完成
        PH-->>C: flow_next: opc_pipeline_complete
    end
```

---

## 阶段推进与回退决策流

`opc_phase_complete` 后 auto_advance 判定，以及 `opc_phase_reset` 的分层回退：

```mermaid
flowchart TD
    Complete([opc_phase_complete]) --> Check{node 全部<br/>completed?}
    Check -->|否| Err[拒绝 + 报错]
    Check -->|是| Auto{auto_advance<br/>4 条件}

    Auto -->|complexity ≤ medium<br/>+ confidence ≥ 0.8<br/>+ 节点完成率 100%<br/>+ suggested_phases 单一| AA[自动推进]
    Auto -->|任一不满足| Ask[询问 Claude]

    AA --> Next{order.next?}
    Ask --> NextA{order.next?}

    Next -->|存在| StartNext[opc_phase_start<br/>下一阶段]
    Next -->|不存在| PC[opc_pipeline_complete]

    NextA -->|存在| Decide{Claude 决策}
    NextA -->|不存在| PC

    Decide -->|前进| StartNext
    Decide -->|回退| Reset[opc_phase_reset]

    Reset --> RType{回退层级}
    RType -->|L0<br/>仅当前 phase| L0[重置 phase nodes<br/>knowledge 恢复快照]
    RType -->|L1<br/>+ 下游 phase| L1[L0 + 下游 pending]
    RType -->|L2<br/>+ 跨 sub 下游| L2[L1 + 受影响<br/>sub-pipelines pending]
    RType -->|L3<br/>整个 pipeline| L3[整个管线<br/>回退到指定 phase]

    L0 --> Resume[Claude 重新<br/>opc_phase_start]
    L1 --> Resume
    L2 --> Resume
    L3 --> Resume

    StartNext --> EndN([进入下一阶段循环])
    Resume --> EndR([重做该阶段])
    PC --> EndP([管线完成])
```

---

## 子文档导航

### 阶段定义

| 子文档 | 内容 |
|------|------|
| [01_nine-phases.md](01_nine-phases.md) | 9 阶段总览 + `phase.md` 元信息文件 |
| [02_node-selection.md](02_node-selection.md) | 节点选择策略、反思轮次表、置信度阈值表 |
| [03_scenarios.md](03_scenarios.md) | Scenario 场景配方与加权机制 |

### 阶段生命周期（按执行顺序）

| 子文档 | 内容 | 涉及工具 |
|------|------|------|
| [04_phase-start.md](04_phase-start.md) | `opc_phase_start` + 自省评估 4 维度 + 三种推进路径 + 反思循环 | `opc_phase_start` / `opc_flow_reflect` |
| [05_phase-confirm-execute.md](05_phase-confirm-execute.md) | `opc_phase_confirm` 锁定执行 + 逐 node 执行 | `opc_phase_confirm` / `opc_node_start` |
| [06_phase-complete-reset.md](06_phase-complete-reset.md) | `opc_phase_complete` + auto_advance 规则 + `opc_phase_reset` + 分层回退 L0–L3 | `opc_phase_complete` / `opc_phase_reset` |

### 扩展能力

| 子文档 | 内容 |
|------|------|
| [07_comma-command.md](07_comma-command.md) | `/comma` 阶段独立运行 + dry-run / mock-inputs |
| [08_tools-and-automation.md](08_tools-and-automation.md) | 节点来源 + 6 个阶段工具汇总 + 自动机制 |

---

## 快速入口

- **进入阶段**：[`opc_phase_start`](04_phase-start.md#二opc_phase_start--扫描与返回) — 由 `opc_pipeline_create` / 上一 phase 的 `opc_phase_complete` 路由触发
- **锁定执行**：[`opc_phase_confirm`](05_phase-confirm-execute.md#一opc_phase_confirm--锁定执行计划) — 自省置信度 ≥ 阈值后调用
- **回退**：[`opc_phase_reset`](06_phase-complete-reset.md#三opc_phase_reset--阶段重置) — 快照恢复，下游级联 pending

---

## 核心设计原则

- **节点选择由 Claude 完成**：state-server 只做 tag 过滤和 scenario 标记，**不调 LLM**；语义匹配和置信度打分由 Claude 在主循环承担
- **自省驱动确认**：高置信度自动确认、中置信度快速确认、低置信度反思循环，max_reflection_rounds 兜底
- **快照保证可回退**：每次 `opc_phase_confirm` 生成 knowledge 快照，`opc_phase_reset` 可幂等恢复
- **auto_advance 严格判定**：复杂度 + 置信度 + 节点完成率 + suggested_phases 4 条件全满足才自动推进

---

## 相关文档

- [意图分析](../01-intent-analysis/00_overview.md) — 任务复杂度决定反思轮次和推进策略
- [管线](../02-pipeline/00_overview.md) — 管线状态管理
- [节点](../04-node/00_overview.md) — 节点定义与执行
