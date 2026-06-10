---
name: seo-audit
tags: [frontend, ui]
description: SEO 审计（站点结构、metadata、Core Web Vitals）
agents:
  primary: [frontend-developer]
  fallback: [performance-engineer]
input:
  - path: design/<feature>/ia
    type: knowledge
  - path: <unit>/<feature>/slo-monitoring
    type: knowledge
output:
  - path: <unit>/<feature>/seo-audit
    type: knowledge
quality_gates:
  L1: [lighthouse-run]
  L2: [cwv_pass, metadata_complete, sitemap_present]
always_show: false
---

## SEO 审计节点

针对已上线产品做 SEO 健康检查，输出修复优先级清单（不直接修复）。

### 何时被选中

- 任务进入 08-growth 且产品面向公开搜索引擎
- 用户介入显式 `growth-seo`

### 何时跳过

- 内部工具 / 登录后产品（无 SEO 价值）
- 移动 App / Electron 客户端

### 执行步骤

1. **抓取**：crawl 站点（深度 ≤ 3），记录响应码、robots、sitemap 命中。
2. **metadata 检查**：title / description / og: / twitter: / canonical / hreflang 完整度。
3. **Core Web Vitals**：LCP / INP / CLS 字段实测 + 实验室（Lighthouse）数据。
4. **结构化数据**：JSON-LD schema 校验（Product / Article / FAQ 等）。
5. **写知识**：`seo-audit` 含 finding 列表（severity + 修复 owner）。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | lighthouse-run | Lighthouse 报告生成成功 |
| L2 | cwv_pass | LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1 |
| L2 | metadata_complete | 关键页面 metadata 覆盖率 100% |
| L2 | sitemap_present | sitemap.xml + robots.txt 存在且合规 |

### 不做的事

- 不修代码（finding → 新建 sub-pipeline 回 05-implement 修）
- 不做内容创作（归 marketing-content）
- 不替代 SEM/广告投放（属于市场预算决策）
