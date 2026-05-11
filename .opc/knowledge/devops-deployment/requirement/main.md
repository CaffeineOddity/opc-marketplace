---
name: 需求说明
description: WHAT/WHY、功能性与非功能性需求、验收标准。
category: requirement
feature_name: devops-deployment
created_at: 2026-05-11T16:41:35.760Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [requirement]
---
# WHAT（要做什么）

ship-kit 是 OPC 市场的部署运维插件，为一人公司提供完整的上线阶段能力：
- **部署自动化**：结构化部署流程与回滚安全机制
- **CI/CD 流水线**：GitHub Actions 模板与自动化构建
- **基础设施即代码**：Terraform 模块库，支持 AWS/Azure/GCP/OCI
- **成本优化**：多云成本分析与资源调优
- **事故响应**：SRE 事故处理手册与事后复盘

# WHY（为什么要做）

一人公司无法承担 24/7 运维压力，需要：
- **自动化优先**：减少人工干预，降低人为错误
- **快速回滚**：部署失败时能快速恢复服务
- **成本可控**：云资源成本直接影响利润
- **快速响应**：生产事故需要系统化处理流程

## 功能性需求

### Skills（技能）

| Skill | 功能描述 |
|-------|----------|
| `/deploy` | 结构化部署与回滚安全机制 |
| `/ci-pipeline` | GitHub Actions CI/CD 模板生成 |
| `/changelog` | 自动变更日志生成（Conventional Commits） |
| `/cost-opt` | 云成本优化（AWS/Azure/GCP/OCI） |
| `/incident-runbook` | 事故响应手册模板 |
| `/terraform` | Terraform IaC 模块库 |

### Agents（智能体）

| Agent | 模型 | 职责 |
|-------|------|------|
| devops-agent | sonnet | 部署、基础设施、运维 |
| cloud-architect | inherit | 多云架构、IaC、FinOps |
| incident-responder | sonnet | SRE 事故响应、故障排查、事后复盘 |

### Hooks（钩子）

| Hook | 功能 |
|------|------|
| pre-deploy-check | 部署命令安全检查 |

## 非功能性需求

- 性能：部署流程应在 15 分钟内完成（不含镜像构建）
- 安全性：基础设施默认最小权限、加密存储
- 可靠性：所有基础设施变更需有回滚计划
- 可用性：支持多区域部署与灾难恢复

## 不做什么（Non-goals）

- 不替代专业 DevOps 团队的复杂需求
- 不提供实时监控告警系统（需配合外部工具）
- 不处理物理服务器运维
- 不提供安全审计功能（由 security-auditor 负责）

## 验收标准（Done Definition）

- [ ] 部署流程文档完整，包含回滚步骤
- [ ] CI/CD 流水线模板覆盖主流技术栈
- [ ] Terraform 模块支持至少 2 个云平台
- [ ] 成本优化建议可量化验证
- [ ] 事故响应手册覆盖常见故障场景
