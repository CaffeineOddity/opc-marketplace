# 插件架构设计

## 插件结构规范

```
plugins/your-plugin/
├── .claude-plugin/
│   └── plugin.json          # 插件清单 (必需)
├── agents/                   # 代理定义
│   └── your-agent.md
├── skills/                   # 技能定义
│   └── your-skill/
│       └── SKILL.md
├── hooks/                    # 钩子定义
│   └── hooks.json
└── references/               # 参考文档
    └── guide.md
```

## 插件清单格式

```json
{
  "name": "plugin-name",
  "description": "插件描述",
  "version": "1.0.0",
  "author": { "name": "author-name" },
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/path/to/server.js"]
    }
  }
}
```

## 插件分类

| 分类 | 插件 | 职责 |
|------|------|------|
| orchestration | opc-founder | 编排、状态管理、插件管理 |
| product | product-kit | 研究、需求、市场分析 |
| design | design-kit | UI/UX 设计、设计系统 |
| development | dev-kit | 架构、编码、安全、性能 |
| testing | qa-kit | 测试规划、E2E、无障碍 |
| devops | ship-kit | 部署、CI/CD、基础设施 |
| marketing | growth-kit | 营销、SEO、数据分析 |
| documentation | docs-kit | 文档生成、翻译 |

## Why: 标准化结构确保插件可发现、可安装、可组合
## How to apply: 新插件必须遵循目录结构和清单格式