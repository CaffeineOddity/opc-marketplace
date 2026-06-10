# Analytics — <feature-name>

> Phase: 08-growth • Node: analytics-integration
> 模板：事件 schema 版本化；漏斗分母分子明确；归因模型选型有书面理由。

## 1. 归因模型

- **选型**：<last-touch / first-touch / linear / time-decay>
- **理由**：<为什么这个模型适合本产品；引用业务特性>
- **回归窗口**：<如 30 天>

## 2. 事件字典

| 事件名 | schema 版本 | 触发时机 | 属性 | owner |
|---|---|---|---|---|
| `signup_started` | v1 | 用户点击注册按钮 | `source: string` / `referrer: string` | <人名> |
| `signup_submitted` | v1 | 表单提交 | `method: email|oauth` | <人名> |
| `signup_completed` | v1 | 邮件验证 / 首次登录 | `time_to_complete_s: number` | <人名> |

### 2.1 Schema 演进规则

- 加字段：可，版本号不变；
- 改语义 / 删字段：必须 v+1，旧 schema 并行 ≥ 30 天。

## 3. 漏斗定义

### 3.1 注册漏斗

- **分母**：`signup_started` 事件数
- **分子**：`signup_completed` 事件数
- **目标转化率**：<x%>
- **当前**：<动态 dashboard>

### 3.2 激活漏斗

- ...

## 4. 留存定义

- **D1 / D7 / D30 留存**：基准事件 `signup_completed` → 后续登录事件
- **可视化**：<dashboard URL>

## 5. SDK 与接入

- **前端**：<选型 + 版本>
- **后端校验**：<是否开启；过滤策略>
- **PII 处理**：<匿名化 / hash 字段列表>

## 6. CTA 映射（与 marketing-content 联动）

| Marketing CTA | 对应事件 | dashboard |
|---|---|---|
| <如：landing-page hero button> | `signup_started` (source=hero) | <URL> |

---
*下游联动：09-scale performance-profiling 可消费本节点数据反哺优化方向。*
