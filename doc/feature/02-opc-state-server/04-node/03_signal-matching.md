# 03 信号匹配

两层筛选，由 node-resolver 执行：

```
① tag 交集过滤
  任务 tags ∩ 节点 tags，交集为 0 的排除

② 语义匹配排序
  任务 description 与节点 description 语义相似度降序

③ Scenario 加权
  命中 scenario 推荐的节点 +0.3
```

---

## 示例

```
任务: "搞一下登录功能"
Claude 分析: { description: "实现用户登录认证功能", tags: [backend, auth] }

tag 过滤:
  tdd-implementation:  tags [backend, database]  → 交集 [backend]  → 候选
  frontend-component:  tags [frontend]           → 交集 []        → 跳过

语义匹配:
  "实现用户登录认证功能" vs "TDD 驱动的后端功能实现" → 相似度 0.78
  "实现用户登录认证功能" vs "构建前端 UI 组件"       → 相似度 0.18
```

---

## 职责分工

- **tag 过滤** — state-server 纯规则执行，零 LLM
- **语义匹配 + Scenario 加权** — Claude 在主循环执行，详见 [../03-phase/02_node-selection.md](../03-phase/02_node-selection.md)

---

## 相关文档

- [02_field-spec.md](02_field-spec.md) — `tags` / `description` 字段定义
- [../03-phase/02_node-selection.md](../03-phase/02_node-selection.md) — Claude 匹配排序与置信度
- [../03-phase/03_scenarios.md](../03-phase/03_scenarios.md) — Scenario 配方
