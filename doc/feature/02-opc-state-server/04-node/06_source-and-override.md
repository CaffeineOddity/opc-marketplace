# 06 节点来源、覆盖与 plugin.json

---

## 一、节点来源与覆盖

| 来源 | 位置 | 说明 |
|------|------|------|
| 内置节点 | `.opc/phases/<phase>/nodes/` | state-server 首次启动时从 bundle 复制到项目 |
| 项目自定义 | `.opc/phases/<phase>/nodes/` | 用户直接编辑、新增、删除节点 |

```
my-project/
└── .opc/
    └── phases/
        ├── 04-implement-design/
        │   └── nodes/
        │       └── api-design.md          ← 内置
        ├── 05-implement/
        │   └── nodes/
        │       ├── backend-endpoint.md    ← 内置
        │       ├── tdd-implementation.md  ← 用户自定义
        │       └── deploy-to-k8s.md       ← 用户新增
        └── 99-custom/                     ← 用户新增的 phase
            └── nodes/
                └── my-node.md
```

所有节点均在 `.opc/phases/` 下，用户可自由编辑、新增、删除。

升级时 state-server 进行三方对比（内置旧版 vs 内置新版 vs 用户当前版），若内置升级了且用户也改过同一文件，生成 `<node>.conflict` 供用户合并。用户接受内置版则手动覆盖；用户偏好本地版则忽略 `.conflict`。优质改动可通过 MR 回流至上游 marketplace 仓库。

---

## 二、plugin.json 声明式能力

每个 kit 通过 `plugin.json` 声明提供哪些 agent、skill、node：

```json
{
  "name": "dev-kit",
  "depends": ["mcp"],
  "capabilities": {
    "phases": ["04-implement-design", "05-implement"],
    "agents": [
      { "name": "frontend-engineer", "model": "sonnet", "expertise": ["react", "nextjs"] },
      { "name": "backend-engineer", "model": "sonnet", "expertise": ["api", "database"] }
    ],
    "skills": ["scaffold-nextjs", "build-api", "auth-system", "code-review"],
    "nodes": [
      "scaffold", "api-design", "database-schema", "tdd-implementation",
      "frontend-component", "backend-endpoint", "auth-integration"
    ]
  }
}
```

`opc_phase_start` 扫描已安装 kit 的 `plugin.json`，构建 Agent 目录和 Skill 索引。`opc_node_start` 校验 `agents.primary[]` 是否全部在该索引中存在。

---

## 相关文档

- [01_types-and-definition.md](01_types-and-definition.md) — 控制节点 vs 任务节点
- [07_tools.md](07_tools.md) — `opc_node_start` Agent 可用性校验
