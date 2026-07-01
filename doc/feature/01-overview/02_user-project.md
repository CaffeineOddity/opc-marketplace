# 02 用户项目目录结构

> 本文档是 [OPC 概览](00_index.md) 的子文档。其他子文档：
> [Marketplace 目录](01_marketplace-directory.md) · [架构分层与时序](03_architecture.md)

---

```
my-project/                              # 用户工程目录（claude 执行目录）
│
├── .claude/
│   ├── settings.json                    #   /opc init 写入 UserPromptSubmit hook（项目级）
│   └── permissions.json
│
├── .opc/                                # OPC 全部运行时 + 可共享数据（见 .gitignore 例外）
│   ├── .project-init                    #   /opc init 标记；state-server bootstrap 门控于此
│   ├── .builtin-manifest.json           #   内置 phases/scenarios 的 bundle 快照（三路比对祖先）
│   ├── phases/                          #   内置阶段定义（bootstrap 进来，可项目级覆盖）
│   ├── scenarios/                       #   内置场景配方
│   ├── sessions/                        #   流程状态机会话存储（gitignore）
│   │   └── sess-abc/
│   │       └── flow-state.json          #     当前流程步骤 + 反思日志 + 累积分析结果
│   ├── pipelines/                       #   管线编排（随会话存于 sessions/<sid>/pipelines/）
│   ├── knowledge/                       #   项目知识库（git 跟踪；/opc init 在 .gitignore 放行）
│   │   ├── .opc-knowledge.json          #     _refs（跨 unit 依赖，git 跟踪）
│   │   ├── .opc-knowledge.idx           #     搜索索引（派生，gitignore）
│   │   ├── user-auth/                   #     ← unit
│   │   │   └── login/                   #       ← section
│   │   │       └── api.md               #         ← subsection
│   │   └── ...
│   ├── memory/                          #   项目持久记忆 + corrections（git 跟踪）
│   │   ├── corrections/                 #     反思蒸馏出的 L2 纠正
│   │   └── ...
│   ├── logs/                            #   运行日志（gitignore）
│   │   ├── reflection/                  #     反思产物 + telemetry
│   │   ├── validator/                   #     validator 产物
│   │   ├── on-demand/                   #     按需反思日志
│   │   └── distiller/                   #     distiller 失败日志
│   └── state/                           #   unlearn 等内部状态（gitignore）
│
├── src/                                 # 项目实际代码
├── tests/
├── package.json
└── ...
```

> 跨项目共享的全局纠正存于 `~/.opc/global-corrections.jsonl`（家目录，由
> `OPC_GLOBAL_CORRECTIONS_ROOT` 可覆盖），不在任何单个项目内。

---

## 相关文档

- [01_marketplace-directory.md](01_marketplace-directory.md) — Marketplace 自身结构
- [03_architecture.md](03_architecture.md) — 架构分层 + 时序图 + 流程图
- [../03-opc-knowledge-server/01-knowledge-model/01_concept-and-storage.md](../03-opc-knowledge-server/01-knowledge-model/01_concept-and-storage.md) — opc-knowledge/ 详细布局
