# 06 节点来源、覆盖与 plugin.json

---

## 一、节点来源与覆盖

| 来源 | 位置 | 说明 |
|------|------|------|
| 内置节点 | `phases/<phase>/nodes/` | 随 marketplace 分发 |
| 项目节点 | `opc-nodes/` | 同名覆盖内置节点 |

```
my-project/
└── opc-nodes/
    ├── 04-implement-design/nodes/
    │   └── api-design.md
    └── 05-implement/nodes/
        └── tdd-implementation.md
```

优先级：`opc-nodes/` > `phases/`。

`opc_phase_start` 扫描时同名节点以项目版本胜出；`opc_node_start` 中 `node_file_path` 字段返回实际生效的路径，供 Agent 引用。

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
