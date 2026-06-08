# 端到端走查：从 0 到 1 实现需求

以"实现用户认证系统（邮箱登录 + Session 管理）"为例，从头到尾逐步追踪 MCP 调用链与状态演进。

本文档已按主题拆分为多个子文档，本文是**聚合索引**，附端到端时序图与决策流程图。

---

## 端到端流程时序图

从用户输入到 pipeline_complete 的完整 MCP 调用链：

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant H as UserPromptSubmit<br/>Hook
    actor C as Claude
    participant F as flow-router<br/>(state-server)
    participant P as pipeline-store<br/>(state-server)
    participant KS as knowledge-server
    participant A as Sub-Agent<br/>(Task tool)

    Note over U,A: ① 用户输入触发流程启动
    U->>H: "实现用户认证系统..."
    H->>C: 注入"先调 opc_flow_query"
    C->>F: opc_flow_query()
    F-->>C: active=false<br/>+ suggested_actions
    C->>F: opc_flow_start({user_message})
    F-->>C: intent_analysis 指令

    Note over U,A: ② 意图判定 + 任务分析
    C->>F: opc_intent_complete(intent=task)
    F-->>C: task_analysis 指令<br/>+ prerequisites:[knowledge_list]
    C->>KS: opc_knowledge_list()
    KS-->>C: units:[]
    C->>C: 7 步分析 + 自省
    C->>F: opc_task_analysis_complete<br/>(0.88, medium, knowledge_unit:[user-auth])
    F-->>C: brief_generation 指令

    Note over U,A: ③ 生成 brief + 创建管线
    C->>C: 按模板生成 brief.md
    C->>F: opc_brief_complete({brief_content})
    F-->>C: next: pipeline_create (预填全部参数)
    C->>P: opc_pipeline_create(...)
    P-->>C: pipeline_id + flow_next: knowledge_open
    C->>KS: opc_knowledge_open([user-auth])
    KS-->>C: units + flow_next: phase_start

    Note over U,A: ④ 阶段执行循环（04→05→06）
    loop 每个 phase
        C->>P: opc_phase_start(phase)
        P-->>C: candidates + 排序
        C->>C: 自省评估
        opt 置信度不足
            C->>F: opc_flow_reflect
            F-->>C: 反思指令
        end
        C->>P: opc_phase_confirm(nodes)
        loop 每个 node
            C->>P: opc_node_start
            P-->>C: node_body + dispatch_instruction
            C->>A: Task spawn sub-agent
            A->>KS: opc_knowledge_get_batch
            KS-->>A: input knowledge
            A->>A: 执行 node 业务逻辑
            A->>KS: opc_knowledge_write
            KS-->>A: version+1
            A-->>C: evidence
            C->>P: opc_node_complete(evidence)
            P-->>C: unblocked_nodes
        end
        C->>P: opc_phase_complete
        P-->>C: next_phase + auto_advance
    end

    Note over U,A: ⑤ 管线完成
    C->>P: opc_pipeline_complete
    P-->>C: manifest.md 路径
    C-->>U: 完成通知
```

---

## 走查阶段决策流程图

每个 phase 内的决策路径（节点选择 → 反思 → 执行 → 推进）：

```mermaid
flowchart TD
    Start([opc_phase_start]) --> Score[候选排序<br/>tag+语义+scenario]
    Score --> Reflect[Claude 自省<br/>4 维度评分]
    Reflect --> Conf{置信度 ≥ min_auto?}

    Conf -->|是<br/>≥ 0.85| AutoConfirm[自动 opc_phase_confirm]
    Conf -->|否<br/>≥ 0.75×min| QuickConf[快速确认<br/>标注警告]
    Conf -->|否<br/>≥ 0.5×min| Adjust[1 轮反思调整<br/>opc_flow_reflect]
    Conf -->|否<br/>< 0.5×min| Manual[用户介入]

    Adjust --> Score
    QuickConf --> Confirm[opc_phase_confirm]
    AutoConfirm --> Confirm
    Manual --> Confirm

    Confirm --> Resolve[node-resolver<br/>解析依赖+冲突]
    Resolve --> Groups[拓扑分组]

    Groups --> Exec{有未完成 group?}
    Exec -->|是| StartNode[opc_node_start<br/>+ Task spawn]
    StartNode --> Sub[sub-agent 执行<br/>get_batch + write]
    Sub --> Complete[opc_node_complete<br/>+evidence]
    Complete --> L1{L1 校验<br/>knowledge 文件存在?}
    L1 -->|否| Retry[opc_node_retry]
    L1 -->|是| L2{L2 校验<br/>test/lint pass?}
    L2 -->|否| Retry
    L2 -->|是| NextNode[unblocked_nodes 推进]
    NextNode --> Exec
    Retry --> Sub

    Exec -->|否| Done[opc_phase_complete]
    Done --> Auto{auto_advance?<br/>complexity≠high<br/>+ confidence 高}
    Auto -->|是| Next([进入 next_phase])
    Auto -->|否| Wait([等待用户确认])
```

---

## 子文档导航

| 子文档 | 内容 |
|------|------|
| [walkthrough/01_user-input.md](01_user-input.md) | 第一步：用户输入 + 知识库初始状态 |
| [walkthrough/02_flow-startup.md](02_flow-startup.md) | 第二步：流程启动 + 意图分析 + 任务分析 |
| [walkthrough/03_brief-to-create.md](03_brief-to-create.md) | 第三步：brief 生成 + pipeline_create + knowledge_open |
| [walkthrough/04_phase-04-implement-design.md](04_phase-04-implement-design.md) | 第四步：Phase 04-implement-design（api-design + database-schema）|
| [walkthrough/05_phase-05-implement.md](05_phase-05-implement.md) | 第五步：Phase 05-implement（含反思调整）|
| [walkthrough/06_phase-06-testing.md](06_phase-06-testing.md) | 第六步：Phase 06-testing |
| [walkthrough/07_pipeline-complete.md](07_pipeline-complete.md) | 第七、八步：pipeline_complete + 最终知识库 + MCP 调用汇总 |

---

## 核心设计亮点（贯穿走查）

- **MCP 状态机驱动**：每一步由 flow-router 返回 step_instruction + next 工具，Claude 无需自行查阅文档
- **方法论文档按需引用**：flow tools 返回 methodology.docs，Claude 仅在自省不足或反思时读
- **预填参数减少决策**：`opc_brief_complete` 直接预填 `opc_pipeline_create` 的全部参数
- **flow_next 链式推进**：pipeline_create → knowledge_open → phase_start 串成自动链
- **Sub-agent 隔离执行**：node 内 Task spawn 隔离 context，sub-agent 自主调 knowledge 工具
- **L1+L2 双层校验**：knowledge 文件存在性（L1）+ 节点声明的 quality_gates（L2）

---

## 相关文档

- [02_test-overview.md](../02-test/00_overview.md) — 10 个测试场景从简单到复杂
- [../02-opc-state-server/01-intent-analysis/00_overview.md](../../02-opc-state-server/01-intent-analysis/00_overview.md) — 流程状态机
- [../02-opc-state-server/02-pipeline/00_overview.md](../../02-opc-state-server/02-pipeline/00_overview.md) — 管线模型
- [../02-opc-state-server/03-phase/00_overview.md](../../02-opc-state-server/03-phase/00_overview.md) — 阶段模型
- [../02-opc-state-server/04-node/00_overview.md](../../02-opc-state-server/04-node/00_overview.md) — 节点模型
- [../03-opc-knowledge-server/01-knowledge-model/00_overview.md](../../03-opc-knowledge-server/01-knowledge-model/00_overview.md) — 知识模型
- [../03-opc-knowledge-server/02-knowledge-api/00_overview.md](../../03-opc-knowledge-server/02-knowledge-api/00_overview.md) — 知识 API
