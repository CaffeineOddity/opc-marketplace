# OPC 市场

OPC（Opinionated Pipeline Compiler）—— 基于状态机的管线编译器，集成反思循环、知识图谱和质量门禁。

> **English** | [中文文档](README.md)

## 插件

| 插件 | 描述 |
|------|------|
| `opc` | 管线编排器，包含 UserPromptSubmit 钩子、`/opc-status` 命令和 3 个 MCP 服务器（状态、知识、反思） |
| `opc/official-kits` | 27 个子智能体，覆盖完整产品生命周期：产品、设计、开发、测试、交付、增长 |

### MCP 服务器（随 opc 安装）

| 服务器 | 工具 |
|--------|------|
| `opc-state-server` | `opc_flow_query`、`opc_flow_lifecycle`、`opc_flow_correct`、`opc_flow_step_complete`、`opc_pipeline_lifecycle`、`opc_phase_*`、`opc_node_*` |
| `opc-knowledge-server` | `opc_knowledge_open`、`opc_knowledge_read`、`opc_knowledge_write`、`opc_knowledge_delete`、`opc_knowledge_index` |
| `opc-reflection-server` | `opc_reflect_plan`、`opc_reflect_execute`、`opc_reflect_complete`、`opc_reflect_admin`、`opc_corrections` |

### 智能体（opc/official-kits 中的 27 个）

product-manager、business-analyst、startup-advisor、ux-researcher、ux-designer、ui-designer、design-bridge、backend-architect、backend-engineer、frontend-developer、fullstack-engineer、cloud-architect、database-administrator、devops-engineer、deployment-engineer、security-engineer、penetration-tester、sre-engineer、performance-engineer、test-automator、qa-expert、cove-verifier、critic、debater、tot-explorer、meta-synthesizer、opc-distiller

## 快速安装

### 1. 添加市场

```shell
claude plugin marketplace add CaffeineOddity/opc-marketplace
```

### 2. 安装插件

```shell
# 核心编排器（必需）
claude plugin install opc

# 官方智能体套件
claude plugin install opc/official-kits
```

### 3. 重启 Claude Code

智能体文件和 MCP 服务器在重启时加载。

## 验证安装

```shell
# 查看已安装插件
claude plugin list

# 查看市场状态
claude plugin marketplace list
```

## 开发

### 环境要求

- Node.js >= 20
- pnpm >= 10

### 项目结构

```
src/                 源代码
  plugins/           插件源码（opc、official-kits）
  mcp/               MCP server 源码（state、knowledge、reflection）
  shared/            内部 workspace 包（memory-store、tool-aliases）
scripts/
  build-release.mjs  将 src/ 打包到 dist/
dist/                构建产物（gitignore，由 `pnpm build` 生成）
  plugins/<name>/    插件元数据 + 打包后的 CLI
  mcp/<name>/        零依赖的 MCP server bundle + 运行时资源
.claude-plugin/
  marketplace.json   指向 dist/plugins/* —— 用户安装的是构建产物
```

### 构建

一条命令即可把所有 MCP server、orchestrator CLI、kit markdown 打包进 `dist/`，
并把 workspace 依赖与 `@modelcontextprotocol/sdk` 全部 inline。
产出的 `dist/mcp/<name>/` 是自包含的，消费端不再需要 `pnpm install`。

```shell
pnpm install
pnpm build
```

### 运行测试

```shell
pnpm --filter @opc/state-server test
pnpm --filter @opc/knowledge-server test
pnpm --filter @opc/reflection-server test
pnpm --filter @opc/plugin test
```

## 许可证

MIT
