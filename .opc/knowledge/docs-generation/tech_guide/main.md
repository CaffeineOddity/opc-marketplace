---
name: 技术指南
description: 开发语言/框架确认、实现要点、关键决策与注意事项。
category: tech_guide
feature_name: docs-generation
created_at: 2026-05-11T16:41:39.410Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide]
---
## 技术栈

- 语言：JavaScript/TypeScript、Python
- 框架：docx-js、pptxgenjs、pypdf、ReportLab
- 依赖：Pandoc、LibreOffice、Poppler

## 实现要点

### Word 文档（/docx）

**创建文档**：
```javascript
const { Document, Packer, Paragraph, TextRun, Table } = require('docx');

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", 
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 } } }
    ]
  },
  sections: [{
    children: [
      new Paragraph({ 
        heading: HeadingLevel.HEADING_1, 
        children: [new TextRun("标题")] 
      }),
      new Paragraph({ 
        children: [new TextRun("正文内容")] 
      })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("document.docx", buffer);
});
```

**关键规则**：
- 设置页面尺寸（默认 A4，US Letter 需显式设置）
- 不使用 `\n`，使用独立 Paragraph
- 不使用 Unicode 项目符号，使用 LevelFormat.BULLET
- PageBreak 必须在 Paragraph 内
- ImageRun 必须指定 type 参数
- 表格需同时设置 columnWidths 和 cell width

**编辑文档**：
```bash
# 解包
python scripts/office/unpack.py document.docx unpacked/

# 编辑 XML 文件
# 使用 Edit 工具直接替换字符串

# 打包
python scripts/office/pack.py unpacked/ output.docx --original document.docx
```

### PDF 处理（/pdf）

**合并 PDF**：
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

**提取文本**：
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        tables = page.extract_tables()
```

**OCR 扫描件**：
```python
import pytesseract
from pdf2image import convert_from_path

images = convert_from_path('scanned.pdf')
for image in images:
    text = pytesseract.image_to_string(image)
```

### PPT 演示（/pptx）

**创建演示**：
```javascript
const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_16x9';

let slide = pptx.addSlide();
slide.addText('标题', { 
  x: 0.5, y: 0.5, w: 9, h: 1,
  fontSize: 36, bold: true, color: '1E2761'
});
slide.addText('内容', { 
  x: 0.5, y: 1.5, w: 9, h: 4,
  fontSize: 18
});

pptx.writeFile({ fileName: 'presentation.pptx' });
```

**设计指南**：
- 选择与主题相关的配色方案
- 每张幻灯片需要视觉元素
- 标题 36-44pt，正文 14-16pt
- 最小边距 0.5 英寸
- 避免纯文本幻灯片

### 翻译服务（/baoyu-translate）

**模式选择**：
| 模式 | 触发词 | 步骤 |
|------|--------|------|
| Quick | "快翻"、"quick" | 直接翻译 |
| Normal | 默认 | 分析 -> 翻译 |
| Refined | "精翻"、"refined" | 分析 -> 翻译 -> 审查 -> 润色 |

**术语表配置**：
```markdown
# EXTEND.md
target_language: zh-CN
default_mode: normal
glossary:
  - term: API
    translation: API
  - term: SaaS
    translation: SaaS
glossary_files:
  - ./custom-glossary.md
```

**翻译原则**：
- 重写而非翻译：以目标语言自然表达
- 准确性优先：事实、数据、逻辑必须一致
- 自然流畅：使用地道表达
- 术语一致：首次出现标注原文

### Markdown 处理

**格式化**（/baoyu-format-markdown）：
- 标题规范化
- 列表格式化
- 引用处理
- 代码块美化

**转 HTML**（/baoyu-markdown-to-html）：
- 微信兼容样式
- 图片处理
- 链接转换

**URL 抓取**（/baoyu-url-to-markdown）：
- 支持多种 URL 类型
- 内容提取和转换
- 质量检查

## 关键决策

1. **文档格式选择**
   - 报告/提案：DOCX（可编辑）
   - 最终交付：PDF（不可修改）
   - 演示展示：PPTX（视觉效果）
   - 在线发布：HTML（可访问）

2. **翻译模式选择**
   - 快速了解：Quick 模式
   - 常规内容：Normal 模式
   - 正式发布：Refined 模式

3. **图片格式选择**
   - 照片：WebP（高压缩率）
   - 图标/截图：PNG（无损）
   - 打印：高质量 JPEG

## 最佳实践

- 文档类型匹配受众需求
- 使用模板保持一致性
- 确保可访问性（alt 文本、对比度）
- 优化文件大小便于分发