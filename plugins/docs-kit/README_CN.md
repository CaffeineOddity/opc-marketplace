# docs-kit

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

## 使用场景

| 文档类型 | 来源 | 技能 |
|----------|------|------|
| 商业报告 | data-analyst | `/docx` |
| 投资者演示 | product-agent | `/pptx` |
| 翻译文章 | 任意 URL | `/baoyu-translate` |
| 格式化 Markdown | 任意内容 | `/baoyu-format-markdown` |
