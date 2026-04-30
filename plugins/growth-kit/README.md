# growth-kit

Growth stage plugin — marketing, data analytics, SEO, social media content, content creation, and multi-platform publishing for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/marketing-plan` | Marketing strategy and channel planning |
| `/content-create` | Content creation (blog / social / email / case study) |
| `/baoyu-xhs-images` | Xiaohongshu (Little Red Book) image card series |
| `/baoyu-image-cards` | Infographic image card series for social media |
| `/baoyu-comic` | Knowledge comic creator with multiple art styles |
| `/baoyu-cover-image` | Article cover images with 11 palettes × 7 rendering styles |
| `/baoyu-article-illustrator` | Article illustration with Type × Style × Palette system |
| `/baoyu-infographic` | Professional infographics with 21 layouts × 21 styles |
| `/baoyu-youtube-transcript` | Download YouTube transcripts and cover images |
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

### Content Creation

```shell
# Article cover image
/baoyu-cover-image <article>

# Article illustrations
/baoyu-article-illustrator <article>

# Infographics
/baoyu-infographic <content> --layout pyramid --style technical-schematic

# YouTube transcript (for content research)
/baoyu-youtube-transcript <URL>
```

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

### Content Creation Workflow

```
/baoyu-youtube-transcript <URL>  # Research
    ↓
/content-create blog <topic>
    ↓
/baoyu-cover-image <article>
/baoyu-article-illustrator <article>
    ↓
/baoyu-post-to-wechat → publish to WeChat
/baoyu-post-to-weibo → publish to Weibo
/baoyu-post-to-x → publish to X
    ↓
data-analyst → measure engagement
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
/baoyu-cover-image → cover images
/baoyu-infographic → infographics
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
