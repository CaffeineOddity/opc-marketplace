# 01 Marketplace 目录结构

> 本文档是 [OPC 概览](00_index.md) 的子文档。其他子文档：
> [用户项目目录](02_user-project.md) · [架构分层与时序](03_architecture.md)

---

```
opc-marketplace/
│
├── .claude-plugin/marketplace.json      # 市场清单：opc + opc-official-kits 两个插件
├── README.md / README.zh-CN.md
├── package.json                          # pnpm workspace 根
├── pnpm-workspace.yaml                   # packages: src/shared/*, src/mcp/*, src/plugins/opc
├── tsconfig.base.json
├── scripts/build-release.mjs             # 一条命令打包全部到 dist/
├── doc/                                  # 设计文档（118 篇，按 MCP 边界组织）
│
├── src/                                  # 源代码
│   │
│   ├── mcp/                              # 三个零 LLM 依赖的 MCP server
│   │   ├── opc-state-server/             # 流程状态机：意图→管线→9 阶段→节点（15 工具）
│   │   │   ├── src/                      #   server.ts / flow-server / phase-server / node-server ...
│   │   │   ├── prompts/                  #   方法论文档（MCP 在工具返回里引用路径，Claude 按需 Read）
│   │   │   ├── phases/                   #   9 阶段定义：phase.md + nodes/*.md + templates/
│   │   │   └── scenarios/                #   场景配方（add-feature.md / fix-bug.md / ...）
│   │   ├── opc-knowledge-server/         # 项目知识库：unit→section→subsection（4 工具）
│   │   └── opc-reflection-server/        # 反思方法学 + 纠正库：5 种方法 + 三层存储（5 工具）
│   │
│   ├── plugins/                          # Claude Code 插件
│   │   ├── opc/                          # 核心插件：hook + /opc-status + opc-status CLI
│   │   │   ├── .claude-plugin/
│   │   │   │   ├── plugin.json           #   UserPromptSubmit hook 配置（指向 opc_flow_query）
│   │   │   │   └── .mcp.json             #   注册上面三个 MCP server
│   │   │   ├── bin/opc-hook.sh           #   hook 脚本（quiet/loud/off 三档触发）
│   │   │   ├── bin/opc-status.mjs        #   终端只读健康快照 CLI
│   │   │   ├── commands/opc-status.md    #   /opc-status slash 命令
│   │   │   └── test/e2e/                 #   7 stage + 16 scenario e2e
│   │   └── official-kits/                # opc-official-kits 插件：27 个子 agent
│   │       ├── .claude-plugin/plugin.json
│   │       └── agents/                   #   product/ design/ dev/ infra/ qa/ reflection/
│   │
│   └── shared/                           # 内部 workspace 包
│       ├── memory-store/                 #   原子文件写入 + frontmatter + 索引
│       └── tool-aliases/                 #   工具名别名归一化
│
└── dist/                                 # 构建产物（gitignored，由 pnpm build 生成，自包含）
    ├── mcp/<name>/dist/<entry>.js        #   esbuild bundle，依赖全 inline
    └── plugins/<name>/                   #   插件元数据 + 打包后 CLI / agents
```

> **历史说明**：v1 曾采用 `platform/`（mcp + opc-orchestrator）+ 顶层 `phases/` + `kits/`（6 个独立 kit）
> 三段式布局。v2 重构后改为 `src/{mcp,plugins,shared}/` workspace + 单一 `opc-official-kits` 插件，
> phases/scenarios 收编进 `src/mcp/opc-state-server/`。上面的树反映当前实际布局。

---

## 相关文档

- [02_user-project.md](02_user-project.md) — 用户项目目录（.opc / opc-knowledge / opc-memory）
- [03_architecture.md](03_architecture.md) — 架构分层 + 时序图 + 流程图
