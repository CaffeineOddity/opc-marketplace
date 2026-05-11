---
name: 插件管理系统需求说明
description: 定义 OPC 插件管理系统的核心功能需求，包括插件安装、更新、卸载、状态管理和 HUD 配置等能力。
category: requirement
feature_name: plugin-management
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [requirement, plugin, installation, management]
---
# WHAT（要做什么）

OPC 插件管理系统 (`/opc-plugin`) 提供完整的插件生命周期管理能力，覆盖安装、更新、卸载、状态查看等全流程操作。系统管理 8 个专业插件：

1. **opc-founder** - 统帅插件，提供 `/opc` 入口和 founder-agent
2. **product-kit** - 产品阶段插件，需求调研和规划
3. **design-kit** - 设计阶段插件，品牌和 UI/UX
4. **dev-kit** - 开发阶段插件，架构和实现
5. **qa-kit** - 测试阶段插件，测试和质量
6. **ship-kit** - 上线阶段插件，部署和运维
7. **growth-kit** - 增长阶段插件，营销和 SEO
8. **docs-kit** - 文档阶段插件，文档生成

核心功能包括：

1. **项目初始化** - 配置 .gitignore、复制工作流、安装 HUD
2. **插件安装** - 支持单插件、预设组合、全部安装
3. **插件更新** - 更新市场源和已安装插件
4. **插件卸载** - 支持部分卸载和完整卸载
5. **HUD 管理** - 安装、卸载、查看状态栏
6. **状态查看** - 显示已安装插件和市场状态

# WHY（为什么要做）

一人公司需要覆盖完整产品生命周期，但不同项目可能只需要部分能力：

| 项目类型 | 需要的插件 |
|----------|-----------|
| Web 产品 | product + design + dev + qa + ship + growth |
| 移动应用 | product + design + dev + qa + ship |
| 纯后端服务 | product + dev + qa + ship |
| 内容营销 | product + growth + docs |
| 设计原型 | product + design + docs |

插件管理系统解决：

| 痛点 | 解决方案 |
|------|----------|
| 安装繁琐 | 一键安装预设组合 |
| 版本混乱 | 自动检测和管理版本 |
| 更新困难 | 一键更新所有插件 |
| 卸载不干净 | 完整卸载包括 HUD 和市场 |

## 功能性需求

### 核心功能

1. **项目初始化 (`/opc-plugin init`)**
   - 配置 `.gitignore`：添加 `.opc/state/` 排除个人数据
   - 复制内置工作流：从 `build-in/workflows/` 到 `.opc/workflows/`
   - 创建标记文件：`.opc/.project-init` 防止重复执行
   - 安装 HUD 状态栏：配置 Claude Code statusLine

2. **插件安装 (`/opc-plugin install`)**
   - 单插件安装：`install product-kit`
   - 预设组合安装：
     - `all` - 全部 7 个插件
     - `web` - Web 产品预设
     - `mobile` - 移动应用预设
     - `designer` - 产品设计预设
     - `content` - 内容营销预设
     - `minimal` - 最小预设
   - HUD 单独安装：`install hud`

3. **插件更新 (`/opc-plugin update`)**
   - 更新市场源：拉取最新 marketplace
   - 更新所有插件：检测版本并更新
   - 更新指定插件：`update design-kit`

4. **插件卸载 (`/opc-plugin uninstall`)**
   - 交互式卸载：询问确认
   - 全部卸载：`uninstall --all` 无需确认
   - 单插件卸载：`uninstall dev-kit`
   - HUD 单独卸载：`uninstall hud`
   - 完整卸载：`uninstall marketplace` 包括插件 + HUD + 市场

5. **HUD 管理**
   - 安装 HUD：配置 statusLine 命令
   - 卸载 HUD：移除 statusLine 配置
   - 查看状态：显示 HUD 配置信息

6. **状态查看 (`/opc-plugin list/status`)**
   - 列出已安装插件
   - 显示市场状态
   - 显示 HUD 状态

### 辅助功能

1. **版本管理**
   - 自动检测插件版本（从 plugin.json）
   - 缓存目录按版本组织
   - 版本冲突检测

2. **路径管理**
   - 自动检测市场路径
   - 支持 git toplevel 定位
   - 开发模式路径检测

3. **交互模式**
   - 无参数时显示菜单
   - AskUserQuestion 选择操作

## 非功能性需求

- **性能**：
  - 单插件安装 < 5秒
  - 全部安装 < 30秒
  - 更新检测 < 3秒

- **安全性**：
  - 插件缓存存储在用户本地
  - 不修改系统级配置
  - 卸载时完整清理

- **可靠性**：
  - 安装失败时显示错误原因
  - 支持强制重新初始化
  - 卸载前验证状态

- **可用性**：
  - 一键命令，无需复杂参数
  - 预设组合，适应不同场景
  - 状态可视化，了解安装情况

## 不做什么（Non-goals）

1. **不支持远程插件源** - 仅支持 opc-marketplace
2. **不支持插件开发** - 开发者直接编辑源码
3. **不支持插件依赖** - 插件独立，无依赖关系
4. **不支持版本锁定** - 始终使用最新版本

## 验收标准（Done Definition）

- [ ] `/opc-plugin init` 正确配置项目
- [ ] `/opc-plugin install all` 安装全部插件
- [ ] `/opc-plugin install web` 安装 Web 预设
- [ ] `/opc-plugin update` 更新所有插件
- [ ] `/opc-plugin uninstall` 交互式卸载
- [ ] `/opc-plugin uninstall marketplace` 完整卸载
- [ ] `/opc-plugin list` 显示已安装插件
- [ ] `/opc-plugin install hud` 安装 HUD
- [ ] `/opc-plugin uninstall hud` 卸载 HUD
- [ ] 版本自动检测和管理
- [ ] 缓存目录正确组织
- [ ] .gitignore 正确配置
- [ ] 工作流正确复制