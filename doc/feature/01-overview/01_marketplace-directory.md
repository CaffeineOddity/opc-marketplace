# 01 Marketplace 目录结构

> 本文档是 [OPC 概览](00_index.md) 的子文档。其他子文档：
> [用户项目目录](02_user-project.md) · [架构分层与时序](03_architecture.md)

---

```
opc-marketplace/
│
├── marketplace.json
├── README.md
├── CLAUDE.md
│
├── platform/
│   │
│   ├── mcp/
│   │   ├── opc-state-server/
│   │   │   ├── server.ts
│   │   │   ├── prompts/                # 方法论文档（MCP 在工具返回里引用路径，Claude 按需 Read）
│   │   │   │   ├── 01_intent-analysis-overview.md          无流程时的意图判断
│   │   │   │   ├── in-flow-decision.md         有活跃流程时的延续/纠正/补充判断
│   │   │   │   ├── task-analysis.md
│   │   │   │   ├── task-decomposition.md
│   │   │   │   ├── brief-generation.md
│   │   │   │   ├── phase-execution.md
│   │   │   │   ├── recovery.md                 孤儿流程恢复策略
│   │   │   │   ├── state-machine.md            每个 F 工具的 expected_steps 路由表
│   │   │   │   ├── reflection-task-analysis.md
│   │   │   │   └── reflection-node-selection.md
│   │   │   ├── flow/                   # 流程状态机
│   │   │   │   ├── flow-router.ts      #   按 confidence/intent/current_step 路由
│   │   │   │   ├── flow-state-store.ts #   .opc/sessions/<id>/flow-state.json 读写
│   │   │   │   └── owner-manager.ts    #   owner pid 接管 + 心跳 + 孤儿检测
│   │   │   ├── tools/
│   │   │   │   ├── flow.ts             #   13 个流程工具
│   │   │   │   ├── pipeline.ts         #   pipeline_create, pipeline_status, pipeline_replan, ...
│   │   │   │   ├── phase.ts            #   phase_start, phase_confirm, phase_complete, phase_reset
│   │   │   │   └── node.ts             #   node_start, node_complete, node_fail
│   │   │   └── engine/
│   │   │       ├── state-manager.ts
│   │   │       ├── phase-validator.ts
│   │   │       └── node-resolver.ts
│   │   └── opc-knowledge-server/
│   │       ├── server.ts
│   │       └── tools/
│   │           ├── open.ts
│   │           ├── get.ts
│   │           ├── write.ts
│   │           ├── delete.ts
│   │           ├── list.ts
│   │           └── search.ts
│   │
│   └── opc-orchestrator/                    # 极简插件：hook + scenarios
│       ├── .claude-plugin/plugin.json        #   UserPromptSubmit hook（指向 opc_flow_query）
│       ├── bin/opc-hook.sh                   #   可选脚本（slash 命令过滤等工程逻辑）
│       └── scenarios/                        #   场景配方（Claude 按需读取）
│           ├── add-feature.md
│           ├── fix-bug.md
│           └── ...
│
├── phases/                                       # 阶段 = 定义 + 节点 + 模板
│   ├── 00-ideation/
│   │   ├── phase.md + nodes.md
│   │   ├── nodes/
│   │   └── templates/
│   ├── 01-validation/
│   │   ├── phase.md + nodes.md
│   │   ├── nodes/
│   │   │   ├── user-persona.md
│   │   │   └── prd-writing.md
│   │   └── templates/
│   │       ├── prd-template.md
│   │       └── persona-template.md
│   ├── 03-design/
│   ├── 04-implement-design/
│   ├── 05-implement/
│   ├── 06-testing/
│   ├── 07-release/
│   ├── 08-growth/
│   └── 09-scale/
│
├── kits/
│   │
│   ├── product-kit/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/
│   │   │   ├── product-manager.md
│   │   │   ├── market-analyst.md
│   │   │   ├── startup-advisor.md
│   │   │   └── ux-researcher.md
│   │   ├── skills/
│   │   │   ├── write-prd/
│   │   │   ├── competitor-analysis/
│   │   │   ├── market-sizing/
│   │   │   ├── startup-brainstorm/
│   │   │   └── pricing-strategy/
│   │   └── mcp/.mcp.json
│   │
│   ├── design-kit/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/
│   │   │   ├── ui-designer.md
│   │   │   ├── ux-designer.md
│   │   │   └── design-reviewer.md
│   │   ├── skills/
│   │   │   ├── generate-wireframe/
│   │   │   ├── create-design-system/
│   │   │   ├── generate-ui/
│   │   │   ├── accessibility-audit/
│   │   │   └── mobile-ux-review/
│   │   └── mcp/.mcp.json
│   │
│   ├── dev-kit/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/
│   │   │   ├── frontend-engineer.md
│   │   │   ├── backend-engineer.md
│   │   │   ├── database-engineer.md
│   │   │   ├── security-engineer.md
│   │   │   └── architect.md
│   │   ├── skills/
│   │   │   ├── scaffold-nextjs/
│   │   │   ├── build-api/
│   │   │   ├── auth-system/
│   │   │   ├── code-review/
│   │   │   └── security-audit/
│   │   └── mcp/.mcp.json
│   │
│   ├── qa-kit/
│   │   └── ...
│   │
│   ├── ship-kit/
│   │   └── ...
│   │
│   └── growth-kit/
│       └── ...
│
├── scripts/
├── .github/workflows/
└── .mcp.json
```

---

## 相关文档

- [02_user-project.md](02_user-project.md) — 用户项目目录（.opc / opc-knowledge / opc-memory）
- [03_architecture.md](03_architecture.md) — 架构分层 + 时序图 + 流程图
