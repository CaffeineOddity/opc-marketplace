# docs-kit

> [中文](#中文) | **English**

Document generation plugin — Word docs, PDFs, presentations for professional deliverables.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/docx` | Word document creation and editing |
| `/pdf` | PDF processing, merging, splitting, OCR |
| `/pptx` | PowerPoint presentation generation |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| docs-agent | sonnet | Document generation agent |

## Quick Start

### Word Document

```shell
/docx <document description>
```

Creates Word documents with:
- Formatting and styles
- Tables and images
- Headers and footers
- Table of contents

### PDF Processing

```shell
/pdf <operation> <files>
```

Operations:
- `create` — Create PDF from content
- `merge` — Merge multiple PDFs
- `split` — Split PDF into pages
- `ocr` — Extract text from scanned PDF

### PowerPoint

```shell
/pptx <presentation description>
```

Creates presentations with:
- Slide layouts
- Charts and diagrams
- Animations
- Speaker notes

## Agent Usage

### docs-agent

Use for:
- Report generation
- Proposal documents
- Technical documentation
- Presentation creation
- Document templates

## Workflow Integration

```
Any stage → docs-kit (document output)
```

### Report Generation

```
data-analyst (analysis) → docs-agent → /docx (report)
```

### Presentation

```
product-agent (pitch) → docs-agent → /pptx (presentation)
```

### Documentation

```
technical-writer (content) → docs-agent → /pdf (documentation)
```

## Use Cases

| Document Type | Source | Skill |
|---------------|--------|-------|
| Business Report | data-analyst | `/docx` |
| Investor Pitch | product-agent | `/pptx` |
| Technical Manual | technical-writer | `/pdf` |
| Proposal | business-analyst | `/docx` |
| Case Study | marketing-agent | `/docx` |

---

## 中文

文档生成插件 —— Word 文档、PDF、演示文稿，用于专业交付物。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/docx` | Word 文档创建和编辑 |
| `/pdf` | PDF 处理、合并、拆分、OCR |
| `/pptx` | PowerPoint 演示文稿生成 |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| docs-agent | sonnet | 文档生成代理 |

## 快速开始

### Word 文档

```shell
/docx <文档描述>
```

创建 Word 文档：
- 格式和样式
- 表格和图片
- 页眉页脚
- 目录

### PDF 处理

```shell
/pdf <操作> <文件>
```

操作：
- `create` — 从内容创建 PDF
- `merge` — 合并多个 PDF
- `split` — 拆分 PDF 为页面
- `ocr` — 从扫描 PDF 提取文本

### PowerPoint

```shell
/pptx <演示文稿描述>
```

创建演示文稿：
- 幻灯片布局
- 图表和图示
- 动画
- 演讲者备注

## 工作流集成

```
任何阶段 → docs-kit (文档输出)
```

### 报告生成

```
data-analyst (分析) → docs-agent → /docx (报告)
```

### 演示文稿

```
product-agent (推介) → docs-agent → /pptx (演示文稿)
```

### 文档

```
technical-writer (内容) → docs-agent → /pdf (文档)
```

## 使用场景

| 文档类型 | 来源 | 技能 |
|----------|------|------|
| 商业报告 | data-analyst | `/docx` |
| 投资人推介 | product-agent | `/pptx` |
| 技术手册 | technical-writer | `/pdf` |
| 提案 | business-analyst | `/docx` |
| 案例研究 | marketing-agent | `/docx` |