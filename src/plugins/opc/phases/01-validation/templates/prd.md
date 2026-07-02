# PRD — <feature-name>

> Phase: 01-validation • Node: prd-draft
> 模板：MoSCoW 必填；每条 must 必有可度量验收。

## 1. 背景（≤ 2 段）

<从 problem-statement 抽取，简明。>

## 2. 目标与非目标

### 2.1 目标（goals）

- <具体、可被验收度量的目标>

### 2.2 非目标（non-goals）

- <显式声明不做什么，防止后续范围漂移>

## 3. 用户画像（来自 personas 知识）

- **<persona 名>**: <一句话刻画 + 主要行为特征>

## 4. 需求清单（MoSCoW）

| ID | 描述 | 优先级 | 验收线（measurable） |
|---|---|---|---|
| R1 | <需求> | **MUST** | <如：成功率 ≥ 99% / p95 < 200ms / 错误率 < 0.1%> |
| R2 | <需求> | SHOULD | <度量> |
| R3 | <需求> | COULD | <度量> |
| R4 | <需求> | WONT (本期) | <为什么不做> |

## 5. 用户流程（来自 ux-flow，引用即可）

- <如：注册 → 邮箱验证 → 资料完善 → 首次操作；详情见 [ux-flow](../03-design/ux-flow.md)>

## 6. 风险与依赖

| 风险 | 严重度 | 缓解 | owner |
|---|---|---|---|
| <如：第三方支付接口 SLA 99.5%> | high | <降级方案> | <人名> |

## 7. 验收 Sign-off

- [ ] 产品 PM
- [ ] 工程 Tech Lead
- [ ] 设计 Designer

---
*下游节点：03-design 全部节点；04-implement-design 的 api-design / database-schema 作为输入。*
