# 安装与使用指南

## 快速安装

```shell
# 1. 添加市场
/plugin marketplace add CaffeineOddity/opc-marketplace

# 2. 安装 opc-founder (必需)
/plugin install opc-founder@opc-marketplace

# 3. 初始化项目
/opc-plugin init

# 4. 安装其他插件
/opc-plugin install all       # 安装全部
/opc-plugin install web       # Web 产品
/opc-plugin install designer  # 产品设计
```

## 常用命令

| 命令 | 功能 |
|------|------|
| `/opc <task>` | 创建新任务，自动编排 |
| `/opc status` | 显示当前任务进度 |
| `/opc resume` | 恢复上次会话 |
| `/opc-plugin list` | 列出已安装插件 |
| `/opc-plugin update` | 更新所有插件 |
| `/opc-plugin uninstall marketplace` | 完全卸载 |

## HUD 状态栏

安装后自动显示:

```
[OPC#1.0] | Opus | session:5m | skill:opc-plugin | ctx:45% | 🔧3 ⚡1 🎯2
```

| 元素 | 描述 |
|------|------|
| `[OPC#version]` | OPC 市场标识 |
| `Opus/Sonnet/Haiku` | 当前模型 |
| `session:Xm` | 会话时长 |
| `skill:name` | 最后激活的技能 |
| `ctx:X%` | 上下文使用率 |
| `🔧N ⚡N 🎯N` | 工具/代理/技能调用次数 |

## Why: 简化安装流程降低使用门槛
## How to apply: 新用户按快速安装步骤操作