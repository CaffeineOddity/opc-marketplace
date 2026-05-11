---
name: 插件管理系统技术指南
description: OPC 插件管理系统的使用指南，包括命令参考、安装预设、HUD 配置、最佳实践和常见问题。
category: tech_guide
feature_name: plugin-management
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide, plugin, installation, usage]
---
## 技术栈

- **语言**：Python 3.x (脚本), Markdown (Skill 定义)
- **框架**：Claude Code Plugin 系统
- **依赖**：
  - 标准库：`json`, `pathlib`, `shutil`, `subprocess`
  - 无第三方依赖

## 快速开始

### 安装市场

```shell
# 1. 添加市场
/plugin marketplace add CaffeineOddity/opc-marketplace

# 2. 安装 opc-founder（必需）
/plugin install opc-founder@opc-marketplace
```

### 初始化项目

```shell
# 初始化项目配置
/opc-plugin init
```

这会：
- 配置 .gitignore（排除 .opc/state/）
- 复制内置工作流到 .opc/workflows/
- 安装 HUD 状态栏
- 创建 .opc/.project-init 标记文件

### 安装插件

```shell
# 安装全部插件
/opc-plugin install all

# 安装 Web 产品预设
/opc-plugin install web

# 安装单个插件
/opc-plugin install design-kit
```

### 更新插件

```shell
# 更新所有插件
/opc-plugin update

# 更新指定插件
/opc-plugin update dev-kit
```

### 卸载

```shell
# 交互式卸载
/opc-plugin uninstall

# 卸载全部（无需确认）
/opc-plugin uninstall --all

# 完整卸载（插件 + HUD + 市场）
/opc-plugin uninstall marketplace

# 仅卸载 HUD
/opc-plugin uninstall hud
```

## 命令参考

### 完整命令列表

| 命令 | 描述 |
|------|------|
| `init` | 初始化项目配置 |
| `init --force` | 强制重新初始化 |
| `init --dry-run` | 预览操作（不执行） |
| `install [option]` | 安装插件 |
| `install hud` | 仅安装 HUD |
| `update` | 更新市场 + 所有插件 |
| `update <plugin>` | 更新指定插件 |
| `uninstall` | 交互式卸载 |
| `uninstall --all` | 卸载全部插件 |
| `uninstall <plugin>` | 卸载指定插件 |
| `uninstall marketplace` | 完整卸载 |
| `uninstall hud` | 仅卸载 HUD |
| `list` | 列出已安装插件 |
| `status` | 显示市场状态 |
| `hud status` | 显示 HUD 状态 |

### 安装预设

| 预设 | 包含插件 | 适用场景 |
|------|----------|----------|
| `all` | 全部 7 个 | 完整产品开发 |
| `web` | product + design + dev + qa + ship + growth | Web 产品 |
| `mobile` | product + design + dev + qa + ship | 移动应用 |
| `designer` | product + design + docs | 产品设计 |
| `content` | product + growth + docs | 内容营销 |
| `minimal` | product + dev | 最小开发 |
| `product` | product-kit | 仅产品 |
| `design` | design-kit | 仅设计 |
| `dev` | dev-kit | 仅开发 |
| `qa` | qa-kit | 仅测试 |
| `ship` | ship-kit | 仅运维 |
| `growth` | growth-kit | 仅增长 |
| `docs` | docs-kit | 仅文档 |

## 实现要点

### 路径检测逻辑

```python
def get_marketplace_path():
    # 1. 检查官方市场目录
    marketplaces_dir = get_claude_dir() / "plugins" / "marketplaces" / "opc-marketplace"
    if marketplaces_dir.exists():
        return marketplaces_dir

    # 2. 检查开发模式（从脚本位置推断）
    script_dir = Path(__file__).parent.parent.resolve()
    if script_dir matches opc-marketplace structure:
        return marketplace_root

    return None
```

### 插件安装流程

```python
def install_plugin(plugin_name, marketplace_path):
    # 1. 获取版本
    version = get_plugin_version(plugin_path)

    # 2. 创建缓存目录
    cache_path = get_cache_dir() / plugin_name / version
    cache_path.mkdir(parents=True, exist_ok=True)

    # 3. 复制必需目录
    for dir_name in [".claude-plugin", "agents", "skills", "references"]:
        shutil.copytree(source / dir_name, cache_path / dir_name)

    # 4. 复制可选目录
    for dir_name in ["hooks", "workflows"]:
        if (source / dir_name).exists():
            shutil.copytree(source / dir_name, cache_path / dir_name)

    # 5. 更新配置
    update_installed_plugins(plugin_name, version)
    update_settings_enabled_plugins(plugin_name)
```

### 项目初始化流程

```python
def init_project():
    # 1. 检查标记文件
    if marker_exists and not force:
        print("Already initialized. Use --force to re-run.")
        return

    # 2. 配置 .gitignore
    gitignore_path = git_root / ".gitignore"
    add_entry(gitignore_path, ".opc/state/")

    # 3. 复制工作流
    workflows_source = marketplace / "build-in" / "workflows"
    workflows_target = git_root / ".opc" / "workflows"
    copy_workflows(workflows_source, workflows_target)

    # 4. 创建标记文件
    write_json(git_root / ".opc" / ".project-init", {
        "version": "1.0.0",
        "initialized_at": datetime.now().isoformat(),
        "workflows_count": 8
    })

    # 5. 安装 HUD
    install_hud()
```

### HUD 管理

```python
def install_hud():
    # 1. 复制 HUD 脚本
    hud_source = marketplace / ".claude" / "hud" / "statusline.sh"
    hud_target = cache_dir / "hud" / "statusline.sh"
    shutil.copy(hud_source, hud_target)

    # 2. 更新 settings.json
    settings = read_json(settings_path)
    settings["statusLine"] = str(hud_target)
    write_json(settings_path, settings)

def uninstall_hud():
    # 1. 移除 HUD 目录
    hud_dir = cache_dir / "hud"
    if hud_dir.exists():
        shutil.rmtree(hud_dir)

    # 2. 更新 settings.json
    settings = read_json(settings_path)
    if "statusLine" in settings:
        del settings["statusLine"]
    write_json(settings_path, settings)
```

## 关键决策

### 1. 为什么缓存按版本组织？

```
cache/opc-marketplace/
├── product-kit/
│   └── 1.0.0/
│   └── 1.1.0/    # 多版本共存
```

好处：
- 支持版本回退
- 避免版本冲突
- 清晰的版本管理

### 2. 为什么需要标记文件？

`.opc/.project-init` 防止：
- 重复配置 .gitignore
- 覆盖自定义工作流
- 每次安装都运行初始化

### 3. 为什么 HUD 单独管理？

- HUD 是可选功能
- 用户可能只想用插件，不要状态栏
- 支持独立安装/卸载

### 4. 为什么完整卸载需要一条命令？

`uninstall marketplace` 一步到位：
- 移除所有插件缓存
- 移除 HUD 配置
- 移除市场目录
- 清理 settings.json

## 最佳实践

### 项目初始化

```shell
# 首次使用
/opc-plugin init

# 强制重新初始化（覆盖工作流）
/opc-plugin init --force

# 预览操作
/opc-plugin init --dry-run
```

### 插件选择

| 项目类型 | 推荐预设 | 原因 |
|----------|----------|------|
| Web SaaS | `web` | 完整产品流程 |
| 移动 App | `mobile` | 无需增长阶段 |
| 内部工具 | `minimal` | 简化流程 |
| 设计稿 | `designer` | 专注设计输出 |
| 博客/内容 | `content` | 专注内容创作 |

### 更新策略

```shell
# 定期更新（每周）
/opc-plugin update

# 更新前查看状态
/opc-plugin status

# 更新后重新加载
/reload-plugins
```

### 卸载清理

```shell
# 完全卸载 OPC
/opc-plugin uninstall marketplace
/reload-plugins

# 仅卸载插件，保留市场
/opc-plugin uninstall --all
```

## 常见问题

### Q: 初始化提示已存在？

```
A: 项目已初始化。使用 --force 强制重新初始化：
/opc-plugin init --force
```

### Q: 插件安装失败？

```
检查：
1. 市场是否正确添加：/plugin marketplace list
2. opc-founder 是否已安装
3. 网络连接是否正常
```

### Q: HUD 不显示？

```
检查：
1. HUD 是否安装：/opc-plugin hud status
2. settings.json 中 statusLine 是否配置
3. 运行 /reload-plugins
```

### Q: 如何查看已安装插件？

```shell
/opc-plugin list
# 或
/opc-plugin status
```

### Q: 如何恢复工作流？

```shell
# 重新初始化（保留自定义工作流）
/opc-plugin init --force
```

### Q: 插件目录结构是什么？

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json    # 必需
├── agents/             # Agent 定义
├── skills/             # Skill 定义
├── references/         # 参考文档
└── hooks/              # Hook 定义（可选）
```

## 文件路径参考

| 路径 | 用途 |
|------|------|
| `~/.claude/plugins/marketplaces/opc-marketplace/` | 市场源码 |
| `~/.claude/plugins/cache/opc-marketplace/` | 插件缓存 |
| `~/.claude/plugins/installed_plugins.json` | 已安装列表 |
| `~/.claude/settings.json` | Claude 配置 |
| `.opc/.project-init` | 初始化标记 |
| `.opc/workflows/` | 工作流目录 |