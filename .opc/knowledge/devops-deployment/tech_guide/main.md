---
name: 技术指南
description: 开发语言/框架确认、实现要点、关键决策与注意事项。
category: tech_guide
feature_name: devops-deployment
created_at: 2026-05-11T16:41:35.874Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide]
---
## 技术栈

- 语言：Shell、HCL (Terraform)、YAML (GitHub Actions)
- 框架：Terraform、GitHub Actions、Docker
- 依赖：kubectl、aws-cli、azure-cli、gcloud、oci-cli

## 实现要点

### 部署流程（/deploy）

```markdown
## Pre-Flight Check
- [ ] 所有测试通过
- [ ] 无未解决的高优先级 Bug
- [ ] 数据库迁移已审查
- [ ] 配置变更已记录
- [ ] 回滚计划已定义
- [ ] 监控告警已配置

## Deployment Plan
- 目标环境：staging / production
- 部署策略：rolling update / blue-green / canary
- 步骤：编号步骤，每步后验证
- 预估停机时间：零 / 短暂 / 计划窗口
- 回滚触发条件：什么条件触发回滚
- 回滚步骤：恢复命令

## Execute
- 按计划逐步部署
- 每步验证后再继续
- 监控错误率和性能指标

## Post-Deploy Verification
- 冒烟测试关键路径
- 检查监控仪表板
- 验证关键业务流程
- 确认错误率无异常

## Document
- 部署日志（内容、时间、执行人）
- 遇到的问题及解决方案
- 经验教训
```

### CI/CD 流水线（/ci-pipeline）

**测试工作流模板**：
```yaml
name: Test
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - uses: codecov/codecov-action@v3
```

**构建推送镜像模板**：
```yaml
name: Build and Push
on:
  push:
    branches: [main]
    tags: ['v*']

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Terraform 模块（/terraform）

**标准模块结构**：
```
module-name/
├── main.tf          # 主资源定义
├── variables.tf     # 输入变量
├── outputs.tf       # 输出值
├── versions.tf      # Provider 版本
├── README.md        # 文档
├── examples/        # 使用示例
└── tests/           # Terratest 测试
```

**VPC 模块示例**：
```hcl
resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = var.enable_dns_hostnames
  enable_dns_support   = var.enable_dns_support

  tags = merge({ Name = var.name }, var.tags)
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
}
```

### 成本优化（/cost-opt）

**优化框架**：
1. **可见性**：成本分配标签、预算告警、成本仪表板
2. **资源调优**：利用率分析、自动伸缩、清理闲置资源
3. **定价模型**：预留实例、Spot 实例、承诺折扣
4. **架构优化**：托管服务、缓存策略、存储分层

**AWS 成本优化检查清单**：
- [ ] 实施成本分配标签
- [ ] 删除未使用资源（EBS、EIP、快照）
- [ ] 基于利用率调优实例规格
- [ ] 稳定工作负载使用预留容量
- [ ] 实施自动伸缩
- [ ] 优化存储类别
- [ ] 使用生命周期策略
- [ ] 启用成本异常检测
- [ ] 设置预算告警
- [ ] 每周审查成本

### 事故响应（/incident-runbook）

**严重等级分类**：
| 等级 | 影响 | 响应时间 | 示例 |
|------|------|----------|------|
| SEV1 | 完全中断、数据丢失 | 15 分钟 | 生产环境宕机 |
| SEV2 | 主要功能降级 | 30 分钟 | 关键功能异常 |
| SEV3 | 轻微影响 | 2 小时 | 非关键 Bug |
| SEV4 | 最小影响 | 下个工作日 | 显示问题 |

**事故响应流程**：
1. **评估严重程度**：用户影响、业务影响、系统范围
2. **建立事故指挥**：指挥官、沟通负责人、技术负责人
3. **立即稳定**：快速止血、回滚评估、资源扩容
4. **调查诊断**：分布式追踪、指标关联、日志分析
5. **修复实施**：最小可行修复、风险评估、分阶段部署
6. **恢复验证**：健康检查、用户体验验证、容量验证
7. **事后复盘**：时间线分析、根因分析、改进建议

## 关键决策

1. **部署策略选择**
   - 常规发布：Rolling Update（零停机、资源效率高）
   - 重要发布：Blue-Green（快速回滚、资源翻倍）
   - 风险发布：Canary（渐进验证、复杂度高）

2. **IaC 工具选择**
   - 多云场景：Terraform（统一语法、生态丰富）
   - 单云深度：云原生工具（CDK/Bicep/CloudFormation）
   - 团队技能：选择团队熟悉的工具

3. **成本优化优先级**
   - 立即见效：清理闲置资源、调优实例规格
   - 中期收益：预留实例、承诺折扣
   - 长期优化：架构重构、多云策略

## 最佳实践

- 永远不要在周五部署（除非是紧急修复）
- 每次部署都要有回滚计划
- 小批量频繁部署优于大批量风险发布
- 一人公司需要可靠的自动化——自动化是你的朋友
