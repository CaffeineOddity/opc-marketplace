# docs-kit

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
