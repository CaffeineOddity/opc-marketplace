---
name: API 指南
description: OPC 插件管理 API 规范，包括 /opc-plugin 命令、插件安装/卸载/更新 API 和 HUD 状态栏管理。
category: api_guide
feature_name: plugin-management
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [api_guide]
---

## 概览

OPC 插件管理系统提供完整的插件生命周期管理能力。通过 `/opc-plugin` 命令，用户可以安装、更新、卸载插件，以及管理 HUD 状态栏。

### 核心能力

| 能力 | 描述 |
|------|------|
| 插件安装 | 支持单插件、插件集、全部安装 |
| 插件更新 | 更新市场源和所有已安装插件 |
| 插件卸载 | 支持单插件、全部卸载、完整卸载 |
| 项目初始化 | 配置 .gitignore、复制工作流、安装 HUD |
| HUD 管理 | 安装、卸载、查询 HUD 状态栏 |

## 认证与授权

插件管理继承 Claude Code 的认证机制。插件从注册的市场源下载，无需额外认证。

### 市场源配置

```json
// ~/.claude/settings.json
{
  "extraKnownMarketplaces": [
    "CaffeineOddity/opc-marketplace"
  ]
}
```

## API 列表

### /opc-plugin init - 项目初始化

**描述**: 初始化项目配置，包括 .gitignore、工作流和 HUD。

**调用方式**:
```
/opc-plugin init [options]
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| --force | boolean | 否 | 强制重新初始化，覆盖现有配置 |
| --dry-run | boolean | 否 | 预览模式，显示将执行的操作但不实际执行 |

**返回值**:

```markdown
## OPC Plugin Init

**Project:** /path/to/project

✅ Copied 8 workflows to .opc/workflows/
  - feature-development.json
  - bug-fix.json
  - security-fix.json
  - api-development.json
  - refactor.json
  - documentation.json
  - product-design.json
  - feature-page.json

📝 **.gitignore updated**: Added `.opc/state/` to ignore personal session data.

📁 **Marker file created**: .opc/.project-init
```

**执行逻辑**:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/init.py [--force] [--dry-run]
```

### /opc-plugin install - 插件安装

**描述**: 安装 OPC 插件到本地缓存。

**调用方式**:
```
/opc-plugin install [option]
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| option | string | 否 | 安装选项，见下表 |

**安装选项**:

| 选项 | 描述 | 包含插件 |
|------|------|----------|
| (无) | 交互式选择 | 用户选择 |
| all | 安装全部 | product-kit, design-kit, dev-kit, qa-kit, ship-kit, growth-kit, docs-kit |
| web | Web 产品 | product-kit, design-kit, dev-kit, qa-kit, ship-kit, growth-kit |
| mobile | 移动应用 | product-kit, design-kit, dev-kit, qa-kit, ship-kit |
| designer | 产品设计 | product-kit, design-kit, docs-kit |
| content | 内容营销 | product-kit, growth-kit, docs-kit |
| minimal | 最小集 | product-kit, dev-kit |
| product | 产品 | product-kit |
| design | 设计 | design-kit |
| dev | 开发 | dev-kit |
| qa | 测试 | qa-kit |
| ship | 上线 | ship-kit |
| growth | 增长 | growth-kit |
| docs | 文档 | docs-kit |
| hud | 仅 HUD | HUD 状态栏 |

**返回值**:

```markdown
## Installing OPC Plugins

**Marketplace:** CaffeineOddity/opc-marketplace
**Target:** ~/.claude/plugins/cache/opc-marketplace/

### Installing product-kit (v1.2.0)
✅ Created cache directory
✅ Copied plugin files
✅ Updated installed_plugins.json
✅ Enabled in settings.json

### Installing dev-kit (v1.2.0)
✅ Created cache directory
✅ Copied plugin files
✅ Updated installed_plugins.json
✅ Enabled in settings.json

---

**Installed:** 2 plugins
**Run `/reload-plugins` to activate.**
```

**执行逻辑**:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/install.py <option>
```

**安装流程**:

1. 检查市场源是否存在
2. 读取插件版本号
3. 创建缓存目录
4. 复制插件文件
5. 更新 installed_plugins.json
6. 更新 settings.json

### /opc-plugin update - 插件更新

**描述**: 更新市场源和已安装插件。

**调用方式**:
```
/opc-plugin update [plugin]
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| plugin | string | 否 | 指定插件名，不指定则更新全部 |

**返回值**:

```markdown
## Updating OPC Plugins

### Updating marketplace
✅ Pulled latest changes from CaffeineOddity/opc-marketplace

### Updating plugins
✅ product-kit: v1.1.0 → v1.2.0
✅ dev-kit: v1.1.0 → v1.2.0
✅ qa-kit: v1.1.0 → v1.2.0

**Updated:** 3 plugins
**Run `/reload-plugins` to activate.**
```

### /opc-plugin uninstall - 插件卸载

**描述**: 卸载已安装的插件。

**调用方式**:
```
/opc-plugin uninstall [option]
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| --all | boolean | 否 | 卸载所有插件（不删除市场源） |
| marketplace | string | 否 | 完整卸载：插件 + HUD + 市场源 |
| hud | string | 否 | 仅卸载 HUD 状态栏 |
| plugin | string | 否 | 指定插件名 |

**卸载选项对比**:

| 命令 | 删除插件 | 删除 HUD | 删除市场源 |
|------|:--------:|:--------:|:----------:|
| `/opc-plugin uninstall` | ✅ (交互式) | ✅ | ❌ |
| `/opc-plugin uninstall --all` | ✅ | ✅ | ❌ |
| `/opc-plugin uninstall marketplace` | ✅ | ✅ | ✅ |
| `/opc-plugin uninstall hud` | ❌ | ✅ | ❌ |

**返回值**:

```markdown
## Uninstalling OPC Plugins

### Removing plugin cache
✅ Removed ~/.claude/plugins/cache/opc-marketplace/product-kit/
✅ Removed ~/.claude/plugins/cache/opc-marketplace/dev-kit/

### Removing HUD
✅ Removed HUD script from cache
✅ Removed statusLine from settings.json

### Updating settings
✅ Removed from installed_plugins.json
✅ Disabled in enabledPlugins

---

**Removed:** 2 plugins + HUD
**Run `/reload-plugins` to refresh.**
```

**执行逻辑**:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/uninstall.py [--all|marketplace|hud|<plugin>]
```

### /opc-plugin list - 插件列表

**描述**: 列出已安装的插件。

**调用方式**:
```
/opc-plugin list
```

**返回值**:

```markdown
## Installed OPC Plugins

| Plugin | Version | Agents | Skills | Status |
|--------|---------|--------|--------|--------|
| product-kit | 1.2.0 | 3 | 4 | ✅ enabled |
| dev-kit | 1.2.0 | 10 | 10 | ✅ enabled |
| qa-kit | 1.2.0 | 2 | 7 | ✅ enabled |

**Total:** 3 plugins, 15 agents, 21 skills
```

### /opc-plugin status - 插件状态

**描述**: 显示市场源和插件状态。

**调用方式**:
```
/opc-plugin status
```

**返回值**:

```markdown
## OPC Plugin Status

### Marketplace
- **Name:** CaffeineOddity/opc-marketplace
- **Path:** ~/.claude/plugins/marketplaces/opc-marketplace/
- **Status:** ✅ Connected
- **Last Update:** 2026-05-12T10:00:00Z

### Installed Plugins
- product-kit (v1.2.0) — ✅ enabled
- dev-kit (v1.2.0) — ✅ enabled
- qa-kit (v1.2.0) — ✅ enabled

### HUD Statusline
- **Status:** ✅ Installed
- **Config:** [OPC#1.0] | {model} | session:{duration} | skill:{skill} | ctx:{ctx}% | 🔧{tools} ⚡{agents} 🎯{skills}
```

### /opc-plugin hud status - HUD 状态

**描述**: 显示 HUD 状态栏配置状态。

**调用方式**:
```
/opc-plugin hud status
```

**返回值**:

```markdown
## HUD Statusline Status

- **Installed:** ✅ Yes
- **Script Path:** ~/.claude/plugins/cache/opc-marketplace/hud/statusline.sh
- **Current Config:** [OPC#1.0] | Opus | session:5m | skill:opc-plugin | ctx:45% | 🔧3 ⚡1 🎯2

### HUD Elements
| Element | Description |
|---------|-------------|
| `[OPC#版本]` | OPC 市场标识 |
| `Opus/Sonnet/Haiku` | 当前模型名称 |
| `session:Xm` | 会话时长 |
| `skill:名称` | 最后激活的 skill |
| `ctx:X%` | 上下文使用率 |
| `🔧N ⚡N 🎯N` | 工具/Agent/Skill 调用次数 |
```

## 插件集定义

```javascript
const PLUGIN_SETS = {
  all: ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit', 'growth-kit', 'docs-kit'],
  web: ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit', 'growth-kit'],
  mobile: ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit'],
  designer: ['product-kit', 'design-kit', 'docs-kit'],
  content: ['product-kit', 'growth-kit', 'docs-kit'],
  minimal: ['product-kit', 'dev-kit'],
  product: ['product-kit'],
  design: ['design-kit'],
  dev: ['dev-kit'],
  qa: ['qa-kit'],
  ship: ['ship-kit'],
  growth: ['growth-kit'],
  docs: ['docs-kit']
};
```

## 可用插件

| 插件 | Agents | Skills | 描述 |
|------|--------|--------|------|
| product-kit | 3 | 4 | 需求调研、需求撰写、头脑风暴 |
| design-kit | 4 | 3 | 品牌、Web、移动端、设计评审 |
| dev-kit | 10 | 10 | 前端、后端、安全、数据库 |
| qa-kit | 2 | 7 | 测试计划、缺陷报告、E2E测试 |
| ship-kit | 3 | 7 | 部署、CI/CD、基础设施 |
| growth-kit | 5 | 12 | 营销、SEO、数据分析 |
| docs-kit | 1 | 9 | 文档、演示文稿、翻译 |

## 文件路径

| 路径 | 描述 |
|------|------|
| `~/.claude/plugins/marketplaces/opc-marketplace/` | 市场源目录 |
| `~/.claude/plugins/cache/opc-marketplace/{plugin}/` | 插件缓存目录 |
| `~/.claude/plugins/installed_plugins.json` | 已安装插件记录 |
| `~/.claude/settings.json` | Claude Code 设置 |
| `{project}/.opc/workflows/` | 工作流目录 |
| `{project}/.opc/.project-init` | 初始化标记文件 |

## 错误处理

### 常见错误

| 错误码 | 描述 | 处理建议 |
|--------|------|----------|
| MARKETPLACE_NOT_FOUND | 市场源未注册 | 先添加市场源到 settings.json |
| PLUGIN_NOT_FOUND | 插件不存在 | 检查插件名称 |
| PLUGIN_ALREADY_INSTALLED | 插件已安装 | 使用 update 更新 |
| VERSION_MISMATCH | 版本不匹配 | 读取 plugin.json 获取实际版本 |
| PERMISSION_DENIED | 权限不足 | 检查文件系统权限 |

### 错误响应格式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": "详细信息"
  }
}
```

## 最佳实践

### 安装建议

- 新项目：使用 `/opc-plugin init` 初始化
- Web 产品：使用 `web` 预设
- 移动应用：使用 `mobile` 预设
- 最小安装：使用 `minimal` 预设

### 更新建议

- 定期运行 `/opc-plugin update` 获取最新功能
- 更新后运行 `/reload-plugins` 激活

### 卸载建议

- 完整卸载：使用 `/opc-plugin uninstall marketplace`
- 保留配置：使用 `/opc-plugin uninstall --all`

## 参考链接

- [工作流规范](../workflow-specs/requirement/main.md)
- [状态持久化](../state-persistence/api_guide/main.md)
