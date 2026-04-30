# docs-kit

> [中文](#中文) | **English**

Document generation plugin — Word docs, PDFs, presentations, translation, and content processing for professional deliverables.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/docx` | Word document creation and editing |
| `/pdf` | PDF processing, merging, splitting, OCR |
| `/pptx` | PowerPoint presentation generation |
| `/baoyu-translate` | Three-mode translation (quick/normal/refined) with glossary support |
| `/baoyu-slide-deck` | Slide deck image generation from content |
| `/baoyu-format-markdown` | Markdown formatting and beautification |
| `/baoyu-markdown-to-html` | Markdown to styled HTML (WeChat-compatible) |
| `/baoyu-url-to-markdown` | Fetch URL and convert to markdown |
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

### Slide Deck

```shell
/baoyu-slide-deck <content>
```

Generates slide images from content with optional PDF/PPTX merge.

### Content Processing

```shell
/baoyu-url-to-markdown <URL>      # Fetch and convert webpage
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

### Document Workflow

```
product-agent (content) → /docx → professional report
    ↓
/pdf → final deliverable
```

## Use Cases

| Document Type | Source | Skill |
|---------------|--------|-------|
| Business Report | data-analyst | `/docx` |
| Investor Deck | product-agent | `/pptx` |
| Translated Article | any URL | `/baoyu-translate` |
| Formatted Markdown | any content | `/baoyu-format-markdown` |

---

## 中文

文档生成插件 —— Word 文档、PDF、演示文稿、翻译和内容处理，用于专业交付物。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/docx` | Word 文档创建和编辑 |
| `/pdf` | PDF 处理、合并、拆分、OCR |
| `/pptx` | PowerPoint 演示文稿生成 |
| `/baoyu-translate` | 三模式翻译（快翻/普通/精翻），支持术语表 |
| `/baoyu-slide-deck` | 幻灯片图片生成 |
| `/baoyu-format-markdown` | Markdown 格式化和美化 |
| `/baoyu-markdown-to-html` | Markdown 转样式 HTML（微信兼容） |
| `/baoyu-url-to-markdown` | 抓取 URL 转换为 Markdown |
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

### 幻灯片

```shell
/baoyu-slide-deck <内容>
```

从内容生成幻灯片图片，可选合并为 PDF/PPTX。

### 内容处理

```shell
/baoyu-url-to-markdown <URL>      # 抓取并转换网页
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

### 文档工作流

```
product-agent (内容) → /docx → 专业报告
    ↓
/pdf → 最终交付物
```