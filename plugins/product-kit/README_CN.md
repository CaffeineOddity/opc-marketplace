# product-kit

产品阶段插件 —— 一人公司的调研、需求、头脑风暴和规范定义。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/research` | 市场和用户调研 |
| `/requirement` | 产品需求文档 (PRD) |
| `/brainstorm` | 结构化头脑风暴 (SCAMPER / 第一性原理 / 逆向思维) |
| `/spec-driven-development` | 实现前先定义规范 (SDD + TDD 集成) |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| product-agent | sonnet | 产品经理代理 —— 调研、需求、头脑风暴 |
| startup-analyst | inherit | TAM/SAM/SOM、财务模型、竞争分析 |
| business-analyst | sonnet | 业务流程分析、需求获取、干系人管理 |

## 快速开始

### 调研

```shell
/research <主题>
```

执行市场调研、用户访谈、竞争分析。

### 需求

```shell
/requirement <功能>
```

生成结构化 PRD：
- 问题陈述
- 用户故事
- 验收标准
- 成功指标

### 头脑风暴

```shell
/brainstorm <挑战>
```

结构化创意生成：
- **SCAMPER**: 替代、组合、调整、修改、其他用途、消除、逆向
- **第一性原理**: 拆解到基础，重新构建
- **逆向思维**: 什么会导致失败？反转它

### 规范驱动开发

```shell
/spec-driven-development
```

实现前定义规范：
1. 接口契约 (API、请求/响应)
2. 数据模型 (实体、约束)
3. 行为规则 (业务逻辑)
4. 边界条件 (验证、边缘情况)

## 工作流集成

```
/research → /requirement → /spec-driven-development → /architect (dev-kit)
```

### SDD → TDD 流程

```
规范定义 → 规范评审 → 测试推导 → 实现 → 验证
```

## 交接协议

### 交接给 design-kit
- 需求文档 → web-agent 进行 Web 设计
- 需求文档 → mobile-agent 进行移动端设计
- 品牌需求 → brand-agent 进行品牌设计

### 交接给 dev-kit
- 规格说明 → /architect 进行架构设计
- API 契约 → backend-agent 进行实现
