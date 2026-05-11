---
name: 技术指南
description: 开发语言/框架确认、实现要点、关键决策与注意事项。
category: tech_guide
feature_name: product-research
created_at: 2026-05-12T00:00:00.000Z
updated_at: 2026-05-12T00:00:00.000Z
tags: [tech_guide, product-kit, skills, agents]
---
## 技术栈

- **语言**：Markdown（文档输出）、YAML（规范定义）
- **框架**：Claude Code Plugin System
- **依赖**：
  - opc-founder（核心调度）
  - design-kit（下游设计）
  - dev-kit（下游开发）

## 快速开始

### 1. 安装 product-kit

```shell
# 方式一：通过 opc-plugin 安装
/opc-plugin install product-kit

# 方式二：手动安装
/plugin install product-kit@opc-marketplace
```

### 2. 使用 Skills

#### 市场调研
```shell
/research <主题>

# 示例
/research AI 编程助手市场
/research 在线教育平台用户需求
```

#### 需求撰写
```shell
/requirement <功能描述>

# 示例
/requirement 用户认证功能
/requirement 购物车系统
```

#### 头脑风暴
```shell
/brainstorm <挑战>

# 示例
/brainstorm 如何提高用户留存率
/brainstorm 降低获客成本的方法
```

#### 规范驱动开发
```shell
/spec-driven-development

# 在需求文档完成后执行，生成实现规范
```

### 3. 使用 Agents

#### product-agent
```shell
# 通过 Agent tool 调用
Agent(subagent_type="product-kit:product-agent", prompt="分析竞品市场")

# 通过 /opc 命令自动调度
/opc 研究一下竞品市场
```

#### startup-analyst
```shell
Agent(subagent_type="product-kit:startup-analyst", prompt="计算 TAM/SAM/SOM")
```

#### business-analyst
```shell
Agent(subagent_type="product-kit:business-analyst", prompt="分析业务流程")
```

## 实现要点

### /research Skill 实现要点

**调研框架**：
1. **定义调研问题**
   - 需要学习什么？
   - 目标用户是谁？
   - 需要验证哪些假设？

2. **市场格局分析**
   - 现有解决方案和竞争对手
   - 市场规模和趋势
   - 差距和机会

3. **用户洞察**
   - 目标用户画像
   - 痛点和未满足需求
   - 用户行为模式

4. **综合输出**
   - 关键发现摘要
   - 已验证 vs 未验证假设
   - 下一步建议

**输出格式**：
```markdown
# 调研简报：[主题]

## 调研问题
- [问题1]
- [问题2]

## 市场格局
### 竞争对手
| 产品 | 定位 | 优势 | 劣势 |
|------|------|------|------|

### 市场规模
- TAM: [总潜在市场]
- SAM: [可服务市场]
- SOM: [可获得市场]

## 用户洞察
### 目标用户画像
- [画像描述]

### 核心痛点
1. [痛点1]
2. [痛点2]

## 关键发现
- [发现1]
- [发现2]

## 假设验证状态
| 假设 | 状态 | 证据 |
|------|------|------|

## 下一步建议
1. [建议1]
2. [建议2]
```

### /requirement Skill 实现要点

**需求模板**：
```markdown
# 产品需求文档：[功能名称]

## 概述
### 问题陈述
[描述要解决的问题]

### 目标用户
[描述目标用户]

### 成功指标
- [指标1]
- [指标2]

## 用户故事

### US-001: [故事标题]
**作为** [用户角色]
**我想要** [目标]
**以便** [收益]

**优先级**：Must-have / Should-have / Nice-to-have

**验收标准**：
- [ ] [标准1]
- [ ] [标准2]

## 功能需求

### FR-001: [功能名称]
**描述**：[功能描述]
**行为**：
- 正常流程：[描述]
- 边缘情况：[描述]
- 错误处理：[描述]

**数据模型**：
```yaml
Entity: [实体名]
Attributes:
  - name: [属性名]
    type: [类型]
    required: [是/否]
```

## 非功能需求

### 性能
- [性能要求]

### 安全性
- [安全要求]

### 兼容性
- [兼容性要求]

## 范围与优先级

### MVP 范围（Must-have）
- [功能1]
- [功能2]

### Phase 2（Should-have）
- [功能3]

### 明确排除
- [不做的功能]
```

### /brainstorm Skill 实现要点

**方法库**：

#### SCAMPER 方法
| 字母 | 含义 | 问题示例 |
|------|------|----------|
| S | Substitute（替代） | 可以用什么替代？ |
| C | Combine（组合） | 可以与什么组合？ |
| A | Adapt（调整） | 可以借鉴什么？ |
| M | Modify（修改） | 可以放大/缩小什么？ |
| P | Put to other use（其他用途） | 还能用于什么？ |
| E | Eliminate（消除） | 可以去掉什么？ |
| R | Reverse（逆向） | 可以反过来做吗？ |

#### 第一性原理方法
1. 拆解问题到最基本的事实
2. 从基本事实重新构建解决方案
3. 质疑所有假设

#### 逆向思维方法
1. 列出所有会导致失败的因素
2. 反转每个因素
3. 形成正向行动清单

**输出格式**：
```markdown
# 头脑风暴：[挑战]

## 挑战定义
[清晰陈述问题或机会]

## 约束与边界
- [约束1]
- [约束2]

## 发散阶段（创意清单）

### SCAMPER 方法
1. [创意1] - 来源：Substitute
2. [创意2] - 来源：Combine
...

### 第一性原理方法
1. [创意1]
2. [创意2]
...

## 收敛阶段（评估）

| 创意 | Impact | Feasibility | Alignment | 总分 |
|------|--------|-------------|-----------|------|
| [创意1] | 8 | 7 | 9 | 24 |
| [创意2] | 6 | 9 | 8 | 23 |

## Top 3 创意
1. **[创意1]** - 验证行动：[具体行动]
2. **[创意2]** - 验证行动：[具体行动]
3. **[创意3]** - 验证行动：[具体行动]

## 下一步
- [下一步1]
- [下一步2]
```

### /spec-driven-development Skill 实现要点

**规范结构**：

```yaml
# 接口契约
endpoint: /api/users/{id}/orders
method: GET
description: 获取用户订单列表

path_parameters:
  - name: id
    type: string
    required: true
    description: 用户ID

query_parameters:
  - name: status
    type: string
    enum: [pending, completed, cancelled]
    required: false
  - name: page
    type: integer
    default: 1
    min: 1
  - name: limit
    type: integer
    default: 20
    min: 1
    max: 100

responses:
  200:
    description: 订单列表
    schema:
      type: object
      properties:
        items:
          type: array
          items: Order
        total:
          type: integer
        page:
          type: integer
        has_more:
          type: boolean
  404:
    description: 用户不存在
  401:
    description: 未授权

errors:
  - code: INVALID_PAGE
    message: 页码必须 >= 1
  - code: USER_NOT_FOUND
    message: 用户 {id} 不存在
```

```yaml
# 数据模型
entity: Order
description: 用户订单

attributes:
  id:
    type: string
    format: uuid
    description: 订单唯一标识
  user_id:
    type: string
    format: uuid
    required: true
  status:
    type: enum
    values: [pending, confirmed, shipped, delivered, cancelled]
    default: pending
  items:
    type: array
    items: OrderItem
    required: true
    min_items: 1
  total:
    type: decimal
    precision: 10
    scale: 2
    description: 订单总金额
  created_at:
    type: datetime
    auto: true
  updated_at:
    type: datetime
    auto: true

constraints:
  - total 必须等于 items.price * items.quantity 之和
  - status 只能按顺序转换：pending → confirmed → shipped → delivered
  - cancelled 是从任何非 delivered 状态的终态

indexes:
  - [user_id, created_at]
  - [status]
```

```yaml
# 行为规则
feature: 订单处理

rules:
  - name: 订单创建
    given: 用户存在且有有效支付方式
    when: 用户提交包含商品的订单
    then:
      - 订单创建，状态为 "pending"
      - 为每个商品预留库存
      - 支付授权（未扣款）
      - 用户收到确认邮件

  - name: 订单确认
    given: 订单存在，状态为 "pending"
    when: 支付成功扣款
    then:
      - 订单状态变为 "confirmed"
      - 库存提交（不仅是预留）
      - 生成运单

  - name: 订单取消
    given: 订单存在，状态为 [pending, confirmed]
    when: 用户或管理员取消订单
    then:
      - 订单状态变为 "cancelled"
      - 释放库存
      - 如已扣款则退款
      - 用户收到取消邮件

edge_cases:
  - name: 部分库存不足
    given: 订单有 3 个商品
    when: 只有 2 个商品有足够库存
    then:
      - 订单整体拒绝
      - 不预留任何库存
      - 通知用户库存不足
```

**规范评审检查清单**：
- [ ] **完整性**：所有场景都覆盖了吗？
- [ ] **无歧义**：只有一种解释可能吗？
- [ ] **可测试**：每个项目都可以验证吗？
- [ ] **可行性**：在约束内可以实现吗？
- [ ] **一致性**：规则之间没有矛盾吗？
- [ ] **边界情况**：边界条件定义了吗？
- [ ] **错误处理**：所有失败模式都处理了吗？

## 关键决策

### 1. 为什么使用 sonnet 模型？
- product-agent 和 business-analyst 需要平衡性能与成本
- sonnet 提供足够的推理能力处理复杂需求
- 对于简单任务，inherit 模型更经济

### 2. 为什么 startup-analyst 使用 inherit 模型？
- 财务建模和竞争分析需要更强的推理能力
- inherit 允许根据任务复杂度选择模型
- 对于复杂分析，可使用 opus 模型

### 3. 为什么 Skills 独立于 Agents？
- Skills 提供轻量级、快速访问的能力
- Agents 提供更全面、可编排的能力
- 用户可根据需求选择合适的粒度

### 4. 为什么 SDD 与 TDD 集成？
- 规范驱动测试，测试驱动实现
- 确保需求可追溯、可验证
- 减少实现阶段的歧义和返工

## 最佳实践

### 调研阶段
1. 明确调研问题，避免范围蔓延
2. 使用多数据源交叉验证
3. 区分假设与已验证发现
4. 标注数据来源和时间

### 需求阶段
1. 从用户故事开始，而非功能列表
2. 每个 Must-have 需求必须有验收标准
3. 明确排除项，避免范围蔓延
4. 保持需求精简，一人公司需要交付

### 头脑风暴阶段
1. 发散阶段禁止评判
2. 使用多种方法激发创意
3. 收敛阶段使用量化评分
4. 为 Top 创意定义验证行动

### 规范阶段
1. 无实现先定义规范
2. 规范必须通过评审检查清单
3. 每个规范项推导至少一个测试
4. 边界条件必须明确定义

## 常见问题

### Q: /research 和 startup-analyst 有什么区别？
A: `/research` 是轻量级调研 skill，快速获取市场洞察。startup-analyst 是专业分析师 agent，提供深度财务建模和竞争分析。

### Q: 什么时候使用 /brainstorm？
A: 当需要创意生成时使用，特别是在：
- 产品功能设计
- 问题解决方案探索
- 增长策略制定

### Q: SDD 和 TDD 如何配合？
A: SDD 定义规范 → 从规范推导测试 → TDD 实现测试 → 实现代码 → 验证实现满足规范。

### Q: 如何与下游系统集成？
A: 
- 需求文档 → design-kit 的 brand-agent/web-agent/mobile-agent
- 规范文档 → dev-kit 的 architect/backend-agent
- 定位文档 → growth-kit 的 marketing-agent