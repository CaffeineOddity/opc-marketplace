# 实施路线

从前到后的构建顺序，每个 Phase 都有可验证的产出。

| Phase | 内容 | 可验证 |
|-------|------|--------|
| 1 | 项目骨架：`opc init` 自动创建 `.opc/`、`opc-knowledge/`、`opc-memory/`、`opc-deliverables/`、`opc-logs/` | 执行命令即可生成完整目录结构 |
| 2 | opc-core 骨架：MCP server 启动 + 状态管理（state, session, lock） | MCP 工具可被 claude 调用，读写状态 |
| 3 | engine/ 核心：gate-evaluator + node-resolver | 给一组节点和前置条件，输出正确的执行计划 |
| 4 | 第一个 kit + 第一个 node：dev-kit 的 tdd-implementation 示例节点 | 手动触发一个 node，走通 entry-gate → agent → exit-gate |
| 5 | 意图识别 + task-classifier | 输入自然语言，输出正确的 tags + suggested_stages |
| 6 | Hook 体系：entry-gate-check、exit-gate-check、knowledge-load/save、stage-transition | 整个 node 执行流程无需手动干预 |
| 7 | 其余 stages（全部 9 个）和 kits（product/design/dev/qa/ship/growth） | 覆盖完整的 9 阶段 + 6 个 kit |
| 8 | 管线恢复 + 阶段回退 + 错误恢复 | 关闭 claude 后重启能恢复管线，失败能回退重试 |
