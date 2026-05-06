# 开发规范

## 插件命名规范

- 使用 kebab-case: `my-plugin-name`
- 一个插件对应一个产品生命周期阶段
- 代理应专注单一职责

## 版本管理

- 修改时更新 `plugin.json` 中的 `version`
- 遵循语义化版本: MAJOR.MINOR.PATCH

## 代理定义规范

```markdown
# agent-name

## 角色定义
[代理的职责和能力]

## 可用工具
[代理可以使用的工具列表]

## 工作流程
[代理如何完成任务]

## 输出格式
[代理输出的标准格式]
```

## 技能定义规范

```
skills/skill-name/
├── SKILL.md          # 技能主文件
├── references/       # 参考文档
│   └── guide.md
└── templates/        # 模板文件
    └── template.md
```

## 贡献指南

1. Fork 仓库
2. 创建特性分支: `git checkout -b feature/my-new-agent`
3. 在 `plugins/` 下添加或修改插件
4. 更新插件的 `plugin.json` 版本
5. 如添加新插件，更新 `marketplace.json`
6. 提交 Pull Request

## Why: 标准化确保插件质量和可维护性
## How to apply: 所有新插件和代理必须遵循规范