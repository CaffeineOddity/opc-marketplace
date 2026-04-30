# growth-kit

> [中文](#中文) | **English**

Growth stage plugin — marketing, data analytics, and SEO for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/marketing-plan` | Marketing strategy and channel planning |
| `/content-create` | Content creation (blog / social / email / case study) |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| marketing-agent | sonnet | Marketing agent — strategy, content, distribution |
| data-analyst | sonnet | BI data analysis, metrics, forecasting |
| seo-keyword-strategist | haiku | Keyword strategy, LSI keywords |
| seo-content-writer | sonnet | SEO-optimized content writing |
| seo-content-planner | haiku | Content calendar, topic clusters |

## Quick Start

### Marketing Plan

```shell
/marketing-plan <product or feature>
```

Generates:
- Target audience
- Value proposition
- Channel strategy
- Content calendar
- Success metrics

### Content Creation

```shell
/content-create <type> <topic>
```

Types:
- `blog` — Blog post
- `social` — Social media post
- `email` — Email campaign
- `case-study` — Customer case study

## Agent Usage

### marketing-agent

Use for:
- Marketing strategy
- Campaign planning
- Channel selection
- Brand messaging
- Launch coordination

**Receives from:** product-agent (product info), devops-agent (launch timing)
**Delivers to:** data-analyst (metrics tracking)

### data-analyst

Use for:
- KPI definition
- Dashboard creation
- Trend analysis
- Forecasting
- A/B test analysis

### seo-keyword-strategist (haiku)

Use for:
- Keyword research
- LSI keyword identification
- Search intent analysis
- Competitor keyword gaps

### seo-content-writer

Use for:
- SEO-optimized articles
- Meta descriptions
- Header optimization
- Internal linking

### seo-content-planner (haiku)

Use for:
- Content calendar
- Topic clusters
- Pillar page planning
- Content gap analysis

## Workflow Integration

```
ship-kit (launch) → growth-kit (marketing) → data-analyst (measure)
```

### SEO Sprint

```
seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent
```

### Launch Campaign

```
marketing-agent → /content-create (multiple types) → data-analyst (track)
```

## SEO Workflow

```
1. Keyword Research (seo-keyword-strategist)
   └── Primary + LSI keywords

2. Content Planning (seo-content-planner)
   └── Calendar, clusters, pillars

3. Content Writing (seo-content-writer)
   └── Optimized articles

4. Distribution (marketing-agent)
   └── Channels, promotion

5. Measurement (data-analyst)
   └── Rankings, traffic, conversions
```

---

## 中文

增长阶段插件 —— 一人公司的营销、数据分析和 SEO。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/marketing-plan` | 营销策略和渠道规划 |
| `/content-create` | 内容创作 (博客 / 社交 / 邮件 / 案例研究) |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| marketing-agent | sonnet | 营销代理 —— 策略、内容、分发 |
| data-analyst | sonnet | BI 数据分析、指标、预测 |
| seo-keyword-strategist | haiku | 关键词策略、LSI 关键词 |
| seo-content-writer | sonnet | SEO 优化内容写作 |
| seo-content-planner | haiku | 内容日历、话题集群 |

## 快速开始

### 营销计划

```shell
/marketing-plan <产品或功能>
```

生成：
- 目标受众
- 价值主张
- 渠道策略
- 内容日历
- 成功指标

### 内容创作

```shell
/content-create <类型> <主题>
```

类型：
- `blog` — 博客文章
- `social` — 社交媒体帖子
- `email` — 邮件营销
- `case-study` — 客户案例研究

## 工作流集成

```
ship-kit (发布) → growth-kit (营销) → data-analyst (衡量)
```

### SEO 冲刺

```
seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent
```

### 发布活动

```
marketing-agent → /content-create (多种类型) → data-analyst (追踪)
```

## SEO 工作流

```
1. 关键词研究 (seo-keyword-strategist)
   └── 主关键词 + LSI 关键词

2. 内容规划 (seo-content-planner)
   └── 日历、集群、支柱页面

3. 内容写作 (seo-content-writer)
   └── 优化文章

4. 分发 (marketing-agent)
   └── 渠道、推广

5. 衡量 (data-analyst)
   └── 排名、流量、转化
```
