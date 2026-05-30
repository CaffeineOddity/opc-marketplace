# Scenario（场景配方）

Scenario 参与节点加权，但优先级低于信号匹配。Task-classifier 输出的 `scenario_hints` 对匹配到的候选节点做权重加成：

```
节点匹配得分 = 语义相似度 × 0.7 + scenario 加权 × 0.3

scenario "add-feature" 的推荐节点:
  - api-design:        +0.3 weight
  - database-schema:   +0.3 weight
  - tdd-implementation: +0.3 weight
```

Scenario 也可以作为**快速启动模板**：用户可以直接声明 "用 add-feature 模板"，跳过信号匹配阶段，直接使用 scenario 推荐的节点。

## Scenario 示例

```markdown
# Scenario: add-feature

## 推荐
- 02-planning: api-design, database-schema
- 04-implementation: tdd-implementation
- 05-testing: integration-test (+ security-scan 如涉及安全)

## 常见变化
- 只需后端 → 跳过前端节点
- 涉及认证 → 增加 auth-integration
- 新项目 → 增加 scaffold
```

## 可用 Scenarios

```
scenarios/
├── build-saas.md
├── build-mobile-app.md
├── add-feature.md
├── fix-bug.md
├── security-audit.md
├── redesign-product.md
├── performance-optimize.md
├── launch-product.md
└── incident-response.md
```
