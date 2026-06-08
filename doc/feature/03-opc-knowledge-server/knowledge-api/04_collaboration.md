# 04 与 opc-state-server 的协作

> 本文档是 [知识 API 总览](../02_knowledge-api-overview.md) 的子文档。其他子文档：
> [工具速览](01_tools-overview.md) · [核心工具](02_core-tools.md) · [初始化时序](03_initialization-flow.md)

---

| 场景 | knowledge-server 角色 | state-server 角色 |
|------|----------------------|-------------------|
| 流程启动 | 被 prerequisites 驱动调用 knowledge_list | flow tools 路由判定 |
| 管线创建 | knowledge_open 接收 flow_next 指令 | pipeline_create 返回 flow_next:knowledge_open |
| node 执行 | get_batch 加载 input，write 产出 output | node_start 返回 node_body + dispatch；node_complete 校验 knowledge 文件存在性（L1） |
| 阶段回退 | 无感知（文件被快照覆盖） | phase_reset 从快照恢复 knowledge 文件 |
| 搜索 | search / list / reindex | 无感知 |

---

## 相关文档

- [03_initialization-flow.md](03_initialization-flow.md) — 完整的启动时序
- [../../02-opc-state-server/01_intent-analysis-overview.md](../../02-opc-state-server/01_intent-analysis-overview.md) — 流程状态机 + 方法论文档协作
- [../../02-opc-state-server/04_node-overview.md](../../02-opc-state-server/04_node-overview.md) — 节点定义中的 knowledge input/output 声明
- [../../02-opc-state-server/02_pipeline-overview.md](../../02-opc-state-server/02_pipeline-overview.md) — 管线创建与状态管理
