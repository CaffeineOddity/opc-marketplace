# docs-kit

> [中文](#中文) | **English**

Document generation plugin — Word docs, PDFs, presentations, translation, infographics, and content processing for professional deliverables.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/docx` | Word document creation and editing |
| `/pdf` | PDF processing, merging, splitting, OCR |
| `/pptx` | PowerPoint presentation generation |
| `/baoyu-translate` | Three-mode translation (quick/normal/refined) with glossary support |
| `/baoyu-infographic` | Professional infographics with 21 layouts × 21 styles |
| `/baoyu-slide-deck` | Slide deck image generation from content |
| `/baoyu-cover-image` | Article cover images with 11 palettes × 7 rendering styles |
| `/baoyu-article-illustrator` | Article illustration with Type × Style × Palette system |
| `/baoyu-format-markdown` | Markdown formatting and beautification |
| `/baoyu-markdown-to-html` | Markdown to styled HTML (WeChat-compatible) |
| `/baoyu-url-to-markdown` | Fetch URL and convert to markdown |
| `/baoyu-youtube-transcript` | Download YouTube transcripts and cover images |
| `/baoyu-compress-image` | Image compression to WebP/PNG |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| docs-agent | sonnet | Document generation agent |

## Quick Start

### Translation

```shell
/baoyu-translate <file or URL>
```

Three modes:
- **quick** — Direct translation
- **normal** — Analyze then translate
- **refined** — Analyze, translate, review, polish

### Infographic

```shell
/baoyu-infographic <content>
```

Options:
- `--layout <name>` — 21 layout types (pyramid, funnel, bridge, etc.)
- `--style <name>` — 21 visual styles (craft-handmade, technical-schematic, etc.)
- `--aspect <ratio>` — landscape, portrait, square, or custom W:H

### Diagram

```shell
/baoyu-diagram <description>
```

Creates SVG diagrams:
- Architecture diagrams
- Flowcharts
- Sequence diagrams
- Mind maps
- Timelines

### Slide Deck

```shell
/baoyu-slide-deck <content>
```

Generates slide images from content with optional PDF/PPTX merge.

### Cover Image

```shell
/baoyu-cover-image <article>
```

Options:
- `--aspect` — cinematic (2.35:1), widescreen (16:9), square (1:1)
- `--palette` — 11 color palettes
- `--rendering` — 7 rendering styles

### Content Processing

```shell
/baoyu-url-to-markdown <URL>      # Fetch and convert webpage
/baoyu-youtube-transcript <URL>   # Get YouTube transcript
/baoyu-format-markdown <file>      # Format markdown
/baoyu-markdown-to-html <file>     # Convert to HTML
/baoyu-compress-image <file>       # Compress image
```

## Workflow Integration

```
Any stage → docs-kit (document output)
```

### Translation Workflow

```
/baoyu-url-to-markdown <URL>
    ↓
/baoyu-translate --mode refined
    ↓
/baoyu-format-markdown
    ↓
/baoyu-markdown-to-html
```

### Infographic Workflow

```
data-analyst (analysis) → /baoyu-infographic → visual summary
```

### Article Workflow

```
/baoyu-translate <article>
    ↓
/baoyu-article-illustrator
    ↓
/baoyu-cover-image
    ↓
/baoyu-post-to-wechat (growth-kit)
```

## Use Cases

| Document Type | Source | Skill |
|---------------|--------|-------|
| Business Report | data-analyst | `/docx` |
| Infographic | any content | `/baoyu-infographic` |
| Translated Article | any URL | `/baoyu-translate` |
| Architecture Diagram | backend-architect | `/baoyu-diagram` |
| Slide Deck | product-agent | `/baoyu-slide-deck` |
| Cover Image | marketing-agent | `/baoyu-cover-image` |

---

## 中文

文档生成插件 —— Word 文档、PDF、演示文稿、翻译、信息图和内容处理，用于专业交付物。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/docx` | Word 文档创建和编辑 |
| `/pdf` | PDF 处理、合并、拆分、OCR |
| `/pptx` | PowerPoint 演示文稿生成 |
| `/baoyu-translate` | 三模式翻译（快翻/普通/精翻），支持术语表 |
| `/baoyu-infographic` | 专业信息图，21 布局 × 21 风格 |
| `/baoyu-slide-deck` | 幻灯片图片生成 |
| `/baoyu-cover-image` | 文章封面图，11 色板 × 7 渲染风格 |
| `/baoyu-article-illustrator` | 文章配图，类型 × 风格 × 色板系统 |
| `/baoyu-format-markdown` | Markdown 格式化和美化 |
| `/baoyu-markdown-to-html` | Markdown 转样式 HTML（微信兼容） |
| `/baoyu-url-to-markdown` | 抓取 URL 转换为 Markdown |
| `/baoyu-youtube-transcript` | 下载 YouTube 字幕和封面 |
| `/baoyu-compress-image` | 图片压缩为 WebP/PNG |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| docs-agent | sonnet | 文档生成代理 |

## 快速开始

### 翻译

```shell
/baoyu-translate <文件或URL>
```

三种模式：
- **quick** — 直接翻译
- **normal** — 分析后翻译
- **refined** — 分析、翻译、审校、润色

### 信息图

```shell
/baoyu-infographic <内容>
```

选项：
- `--layout <名称>` — 21 种布局（金字塔、漏斗、桥梁等）
- `--style <名称>` — 21 种视觉风格
- `--aspect <比例>` — 横版、竖版、方形或自定义

### 图表

```shell
/baoyu-diagram <描述>
```

创建 SVG 图表：
- 架构图
- 流程图
- 时序图
- 思维导图
- 时间线

### 幻灯片

```shell
/baoyu-slide-deck <内容>
```

从内容生成幻灯片图片，可选合并为 PDF/PPTX。

### 封面图

```shell
/baoyu-cover-image <文章>
```

选项：
- `--aspect` — 电影 (2.35:1)、宽屏 (16:9)、方形 (1:1)
- `--palette` — 11 种色板
- `--rendering` — 7 种渲染风格

### 内容处理

```shell
/baoyu-url-to-markdown <URL>      # 抓取并转换网页
/baoyu-youtube-transcript <URL>   # 获取 YouTube 字幕
/baoyu-format-markdown <文件>      # 格式化 Markdown
/baoyu-markdown-to-html <文件>     # 转换为 HTML
/baoyu-compress-image <文件>       # 压缩图片
```

## 工作流集成

```
任何阶段 → docs-kit (文档输出)
```

### 翻译工作流

```
/baoyu-url-to-markdown <URL>
    ↓
/baoyu-translate --mode refined
    ↓
/baoyu-format-markdown
    ↓
/baoyu-markdown-to-html
```

### 信息图工作流

```
data-analyst (分析) → /baoyu-infographic → 可视化摘要
```

### 文章工作流

```
/baoyu-translate <文章>
    ↓
/baoyu-article-illustrator
    ↓
/baoyu-cover-image
    ↓
/baoyu-post-to-wechat (growth-kit)
```
