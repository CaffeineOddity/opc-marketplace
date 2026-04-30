# growth-kit

> [中文](#中文) | **English**

Growth stage plugin — marketing, data analytics, SEO, social media content, and multi-platform publishing for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/marketing-plan` | Marketing strategy and channel planning |
| `/content-create` | Content creation (blog / social / email / case study) |
| `/baoyu-xhs-images` | Xiaohongshu (Little Red Book) image card series |
| `/baoyu-image-cards` | Infographic image card series for social media |
| `/baoyu-comic` | Knowledge comic creator with multiple art styles |
| `/baoyu-post-to-wechat` | Post to WeChat Official Account (微信公众号) |
| `/baoyu-post-to-weibo` | Post to Weibo (微博) |
| `/baoyu-post-to-x` | Post to X/Twitter |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| marketing-agent | sonnet | Marketing agent — strategy, content, distribution |
| data-analyst | sonnet | BI data analysis, metrics, forecasting |
| seo-keyword-strategist | haiku | Keyword strategy, LSI keywords |
| seo-content-writer | sonnet | SEO-optimized content writing |
| seo-content-planner | haiku | Content calendar, topic clusters |

## Quick Start

### Social Media Content

```shell
# Xiaohongshu image cards
/baoyu-xhs-images <content> --style cute --layout dense

# General image cards
/baoyu-image-cards <content> --style notion --palette macaron

# Knowledge comic
/baoyu-comic <topic>
```

**XHS Styles:** cute, fresh, warm, bold, minimal, retro, pop, notion, chalkboard, study-notes, screen-print, sketch-notes

**XHS Layouts:** sparse, balanced, dense, list, comparison, flow

### Multi-Platform Publishing

```shell
# WeChat Official Account
/baoyu-post-to-wechat <article.md>

# Weibo
/baoyu-post-to-weibo <content>

# X/Twitter
/baoyu-post-to-x <content>
```

### Marketing Plan

```shell
/marketing-plan <product or feature>
```

### Content Creation

```shell
/content-create <type> <topic>
```

Types: `blog`, `social`, `email`, `case-study`

## Agent Usage

### marketing-agent

Use for:
- Marketing strategy
- Campaign planning
- Channel selection
- Brand messaging
- Launch coordination

### data-analyst

Use for:
- KPI definition
- Dashboard creation
- Trend analysis
- Forecasting
- A/B test analysis

## Workflow Integration

```
ship-kit (launch) → growth-kit (marketing) → data-analyst (measure)
```

### Social Media Content Workflow

```
seo-keyword-strategist → topic research
    ↓
/baoyu-image-cards → create image cards
    ↓
/baoyu-post-to-wechat → publish to WeChat
/baoyu-post-to-weibo → publish to Weibo
/baoyu-post-to-x → publish to X
    ↓
data-analyst → measure engagement
```

### Xiaohongshu Workflow

```
/baoyu-xhs-images <article> --style cute --layout dense
    ↓
Review and adjust
    ↓
Post to XHS manually or via integration
```

### SEO Sprint

```
seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent
```

### Launch Campaign

```
marketing-agent → /content-create (multiple types)
    ↓
/baoyu-image-cards → visual content
    ↓
/baoyu-post-to-wechat / baoyu-post-to-weibo / baoyu-post-to-x
    ↓
data-analyst → track metrics
```

## Platform-Specific Notes

### WeChat (微信公众号)
- Supports HTML, Markdown, or plain text
- External links converted to bottom citations
- Image-text posting (贴图) supported

### Weibo (微博)
- Regular posts with text, images, videos
- Headline articles (头条文章) with Markdown

### X/Twitter
- Regular posts with images/videos
- X Articles (long-form Markdown)

---

## 中文

增长阶段插件 —— 一人公司的营销、数据分析、SEO、社交媒体内容和多平台发布。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/marketing-plan` | 营销策略和渠道规划 |
| `/content-create` | 内容创作 (博客 / 社交 / 邮件 / 案例研究) |
| `/baoyu-xhs-images` | 小红书图片卡片系列 |
| `/baoyu-image-cards` | 社交媒体信息图卡片系列 |
| `/baoyu-comic` | 知识漫画创作，多种艺术风格 |
| `/baoyu-post-to-wechat` | 发布到微信公众号 |
| `/baoyu-post-to-weibo` | 发布到微博 |
| `/baoyu-post-to-x` | 发布到 X/Twitter |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| marketing-agent | sonnet | 营销代理 —— 策略、内容、分发 |
| data-analyst | sonnet | BI 数据分析、指标、预测 |
| seo-keyword-strategist | haiku | 关键词策略、LSI 关键词 |
| seo-content-writer | sonnet | SEO 优化内容写作 |
| seo-content-planner | haiku | 内容日历、话题集群 |

## 快速开始

### 社交媒体内容

```shell
# 小红书图片卡片
/baoyu-xhs-images <内容> --style cute --layout dense

# 通用图片卡片
/baoyu-image-cards <内容> --style notion --palette macaron

# 知识漫画
/baoyu-comic <主题>
```

**小红书风格：** cute, fresh, warm, bold, minimal, retro, pop, notion, chalkboard, study-notes, screen-print, sketch-notes

**小红书布局：** sparse, balanced, dense, list, comparison, flow

### 多平台发布

```shell
# 微信公众号
/baoyu-post-to-wechat <文章.md>

# 微博
/baoyu-post-to-weibo <内容>

# X/Twitter
/baoyu-post-to-x <内容>
```

## 工作流集成

```
ship-kit (发布) → growth-kit (营销) → data-analyst (衡量)
```

### 社交媒体内容工作流

```
seo-keyword-strategist → 话题研究
    ↓
/baoyu-image-cards → 创建图片卡片
    ↓
/baoyu-post-to-wechat → 发布到微信
/baoyu-post-to-weibo → 发布到微博
/baoyu-post-to-x → 发布到 X
    ↓
data-analyst → 衡量互动数据
```

### 小红书工作流

```
/baoyu-xhs-images <文章> --style cute --layout dense
    ↓
审核和调整
    ↓
手动发布到小红书或通过集成
```

### 发布活动

```
marketing-agent → /content-create (多种类型)
    ↓
/baoyu-image-cards → 视觉内容
    ↓
/baoyu-post-to-wechat / baoyu-post-to-weibo / baoyu-post-to-x
    ↓
data-analyst → 追踪指标
```

## 平台特定说明

### 微信公众号
- 支持 HTML、Markdown 或纯文本
- 外链自动转为底部引用
- 支持图文发布（贴图）

### 微博
- 普通帖子支持文字、图片、视频
- 头条文章支持 Markdown

### X/Twitter
- 普通帖子支持图片/视频
- X Articles 支持长文 Markdown
