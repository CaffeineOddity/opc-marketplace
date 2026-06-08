# 管线创建、知识初始化与阶段执行

> 本文档是 [意图分析总览](../01_intent-analysis-overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 九、管线创建（opc_decomposition_complete 路由触发 opc_pipeline_create）

opc_decomposition_complete `opc_brief_complete` 收到 brief 内容后，**不是 Claude 自由决定下一步**——而是 opc_decomposition_complete 路由返回里直接预填 `opc_pipeline_create` 的全部参数（从 flow-state.json 中累积的分析结果取出）：

```json
// opc_decomposition_complete 返回
{
  "step": "brief_completed",
  "step_instruction": "下一步创建管线，参数已预填，直接调用 next.tool 即可。",
  "next": {
    "tool": "opc_pipeline_create",
    "args": {
      "description": "...",
      "tags": [...],
      "complexity": "medium",
      "knowledge_unit": ["user-auth"],
      "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
      "scenario": "add-feature",
      "brief_content": "<刚提交的 brief markdown>",
      "sub_pipelines": [{
        "id": "sub-1",
        "title": "用户认证系统",
        "knowledge_unit": ["user-auth"],
        "blocked_by": []
      }],
      "execution_order": [{"group": 1, "parallel": ["sub-1"]}]
    }
  }
}
```

`opc_pipeline_create` 完成后返回里也带 `flow_next` 字段，指引 Claude 调 `opc_knowledge_open`：

```json
// opc_pipeline_create 返回
{
  "pipeline_id": "pipeline-20260608-001",
  "created_at": "...",
  "flow_next": {
    "tool": "opc_knowledge_open",
    "args": {"units": ["user-auth"]},
    "why": "管线已创建，下一步初始化知识单元（每条子管线的 knowledge_unit）"
  }
}
```

state-server 内部行为（纯确定性）：
- 生成 pipeline ID，创建 `.opc/pipelines/<id>/` 目录结构
- 写入 `pipeline-plan.json`
- 写入 `brief.md`（内容由 Claude 提供）
- 写入 `state.json`（初始空 phases）
- 更新 `.opc/sessions/<id>/flow-state.json`，标记 step: pipeline_created
- 返回 `{ pipeline_id, flow_next }`

---

## 十、知识初始化（flow_next 触发 opc_knowledge_open）

Claude 按 `pipeline_create` 返回的 flow_next 指引调用 `opc_knowledge_open`。`opc_knowledge_open` 完成后同样返回 flow_next，指引进入阶段执行：

```json
// opc_knowledge_open 返回（流程内调用）
{
  "units": { "user-auth": {} },
  "related": [],
  "flow_next": {
    "tool": "opc_phase_start",
    "args": {
      "pipeline_id": "pipeline-20260608-001",
      "sub_pipeline_id": "sub-1",
      "phase": "04-implement-design"
    },
    "why": "知识单元就绪，进入第一个阶段"
  },
  "methodology": {
    "docs": ["prompts/phase-execution.md"],
    "ref": "§十 阶段执行循环",
    "summary": "phase_start → 自省排序 → 反思 → phase_confirm → 逐 node 执行 → phase_complete"
  }
}
```

操作逻辑非常简单。完整工具规范见 [03-2 知识 MCP API](../03-opc-knowledge-server/02_knowledge-api-overview.md) §2.1 `opc_knowledge_open`。

---

## 十一、阶段执行循环（方法论：prompts/phase-execution.md）

知识初始化完成后，Claude 进入阶段执行循环。详细规范见 [阶段](03_phase-overview.md) 和 [节点](04_node-overview.md)。阶段层工具也按相同模式返回 `flow_next` 指引下一步。

节点选择反思循环也通过 `opc_flow_reflect` 持久化（与任务分析反思共用 opc_brief_complete 工具），完整日志写入 `flow-state.json`。

---

