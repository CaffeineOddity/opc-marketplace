# ship-kit

发布阶段插件 —— 一人公司的部署、CI/CD、基础设施、成本优化和事故响应。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/deploy` | 结构化部署（含回滚） |
| `/ci-pipeline` | GitHub Actions CI/CD 模板 |
| `/changelog` | 自动化变更日志生成 |
| `/cost-opt` | 云成本优化 (AWS / Azure / GCP / OCI) |
| `/incident-runbook` | 事故响应运行手册模板 |
| `/terraform` | Terraform IaC 模块库 |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| devops-agent | sonnet | 部署、基础设施、运维 |
| cloud-architect | inherit | 多云架构、IaC、FinOps |
| incident-responder | sonnet | SRE 事故响应、故障排查、事后复盘 |

### 钩子

| 钩子 | 描述 |
|------|------|
| pre-deploy-check | 部署命令安全检查 |

## 快速开始

### 部署

```shell
/deploy <服务或应用>
```

结构化部署：
- 部署前检查清单
- 部署步骤
- 验证
- 回滚计划

### CI 流水线

```shell
/ci-pipeline <项目类型>
```

生成 GitHub Actions 工作流：
- 构建阶段
- 测试阶段
- 部署阶段
- 环境矩阵

### 成本优化

```shell
/cost-opt <云服务商>
```

分析和优化：
- 计算成本
- 存储成本
- 网络成本
- 未使用资源

### 事故运行手册

```shell
/incident-runbook <事故类型>
```

生成运行手册：
- 检测信号
- 诊断步骤
- 缓解措施
- 沟通模板
- 事后复盘大纲

## 工作流集成

```
qa-kit (批准) → ship-kit (部署) → growth-kit (发布)
```

### 部署流程

```
/deploy → devops-agent → /verification-before-completion
    │
    ├── 部署前检查清单
    ├── 执行部署
    ├── 健康检查
    └── 需要时回滚
```

### 事故响应流程

```
incident-responder → 分类 + 诊断
    │
    ├── devops-agent → 缓解措施
    │
    ├── cloud-architect → 基础设施变更
    │
    └── /incident-runbook → 文档记录
```
