# 实施路线

从前到后的构建顺序，每个 Phase 都有可验证的产出。

| Phase | 内容 | 可验证 |
|-------|------|--------|
| 1 | 项目骨架：`opc init` 自动创建 `.opc/`、`opc-knowledge/`、`opc-memory/`、`opc-logs/` | 执行命令即可生成完整目录结构 |
| 2 | opc-knowledge-server：知识库 MCP 服务（open/get/write/delete/list/search） | MCP 工具可被 claude 调用，读写知识 |
| 3 | opc-state-server：任务跟进 MCP 服务（pipeline/phase/node） + engine 核心 | MCP 工具可被 claude 调用，创建管线、推进阶段 |
| 4 | 第一个 kit + 第一个 node：dev-kit 的 tdd-implementation 示例节点 | 手动触发一个 node，走通 knowledge get → agent → knowledge write |
| 5 | `opc_pipeline_start`：意图识别 → knowledge_list → task-analyzer → (需求拆分) → knowledge_open → brief-generation | 输入自然语言，输出完整的管线工作单，大需求自动拆分子管线 |
| 6 | MCP 工具自动驾驶：依赖解锁、阶段自动推进、管线恢复 | 整个 node 执行流程无需手动干预 |
| 7 | 其余 phases（全部 9 个）和 kits（product/design/dev/qa/ship/growth） | 覆盖完整的 9 个 phase + 6 个 kit |
| 8 | 管线恢复 + 阶段回退 + 错误恢复 | 关闭 claude 后重启能恢复管线，失败能回退重试 |
