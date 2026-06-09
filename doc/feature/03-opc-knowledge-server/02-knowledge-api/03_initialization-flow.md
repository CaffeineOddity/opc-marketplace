# 03 初始化时序

> 本文档是 [知识 API 总览](00_overview.md) 的子文档。其他子文档：
> [核心工具](02_core-tools.md)

---

管线启动时，Claude 按 MCP 流程状态机推进（详见 [intent-analysis 流程工具速览](../../02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md)），知识工具穿插调用：

```
① Hook 注入"调 opc_flow_start"指令 → Claude → opc_flow_start
  → opc_flow_query 返回 intent_analysis 指令 + methodology(prompts/01_intent-analysis-overview.md)
  → Claude 判断 intent → opc_intent_complete

② opc_flow_start 路由 task 分支 → 返回 task_analysis 指令 + prerequisites:[opc_knowledge_list]
  → Claude → opc_knowledge_list
    → readdir 扫描 opc-knowledge/ 下所有 unit/section/subsection
    → 返回已有 unit 列表 + 结构

③ Claude 按方法论做 7 步分析 + 自省 → opc_task_analysis_complete
  → opc_intent_complete 按 confidence + modify_count 路由

③b 修改 unit ≥ 2 时 opc_intent_complete 路由 task_decomposition → Claude 拆分 → opc_decomposition_complete

④ opc_intent_complete/opc_task_analysis_complete 路由 brief_generation → Claude 生成 brief → opc_brief_complete
  → opc_decomposition_complete 返回 next:opc_pipeline_create（预填全部参数）

⑤ Claude → opc_pipeline_create → state-server 写入文件
  → 返回 flow_next: opc_knowledge_open

⑥ Claude 按 flow_next → opc_knowledge_open → 按子管线加载对应 unit
  → 已存在 → 复用，读 .md frontmatter 获取已有条目 + version
  → 不存在 → 创建 unit 目录
  → 自动加载 _refs 关联的 unit 作为可读上下文
  → 返回 flow_next: opc_phase_start

⑦ 进入阶段执行循环
```

---

## 相关文档

- [02_core-tools.md](02_core-tools.md) — `opc_knowledge_open` / `opc_knowledge_list` 细节
- [../../02-opc-state-server/01-intent-analysis/00_overview.md](../../02-opc-state-server/01-intent-analysis/00_overview.md) — 流程状态机
