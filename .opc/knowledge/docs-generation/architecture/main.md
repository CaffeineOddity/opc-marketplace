---
name: 系统架构
description: 系统整体结构、关键组件与依赖关系（含架构图）。
category: architecture
feature_name: docs-generation
created_at: 2026-05-11T16:41:39.354Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [architecture]
---
## 架构图

```mermaid
flowchart TB
    subgraph Input["输入源"]
        MD[Markdown]
        URL[URL 内容]
        Text[文本内容]
        Template[模板文件]
    end

    subgraph Processing["处理层"]
        Format[格式化处理]
        Translate[翻译处理]
        Convert[格式转换]
    end

    subgraph Output["输出格式"]
        DOCX[Word 文档]
        PDF[PDF 文档]
        PPTX[PPT 演示]
        HTML[HTML 页面]
        Image[图片文件]
    end

    subgraph Tools["工具链"]
        Pandoc[Pandoc]
        DocxJS[docx-js]
        PptxGen[pptxgenjs]
        ReportLab[ReportLab]
    end

    MD --> Format
    URL --> Format
    Text --> Translate
    Template --> Convert
    
    Format --> DOCX
    Format --> HTML
    Translate --> DOCX
    Translate --> HTML
    Convert --> PPTX
    Convert --> PDF
    
    DocxJS --> DOCX
    PptxGen --> PPTX
    ReportLab --> PDF
    Pandoc --> HTML
```

## 关键模块与职责

### docs-agent
- **文档生成**：创建专业报告、提案、演示文稿
- **格式转换**：Markdown <-> HTML <-> DOCX <-> PDF
- **翻译服务**：多模式翻译与术语管理
- **内容处理**：格式化、美化、压缩优化

### /docx Skill
- **创建文档**：使用 docx-js 生成 Word 文档
- **编辑文档**：解包 -> 编辑 XML -> 打包
- **格式控制**：样式、表格、图片、页眉页脚
- **追踪变更**：支持修订模式和批注

### /pdf Skill
- **PDF 操作**：合并、拆分、旋转、加水印
- **内容提取**：文本、表格、图片提取
- **OCR 支持**：扫描件文字识别
- **表单填写**：PDF 表单数据填充

### /pptx Skill
- **演示创建**：使用 pptxgenjs 生成 PPT
- **模板编辑**：基于模板修改内容
- **设计指南**：配色、排版、视觉元素
- **质量检查**：视觉 QA 和内容验证

### /baoyu-translate Skill
- **三种模式**：
  - Quick：直接翻译
  - Normal：分析 -> 翻译
  - Refined：分析 -> 翻译 -> 审查 -> 润色
- **术语管理**：自定义术语表、一致性保证
- **分块处理**：长文档智能分块翻译

## 技术选型与约束

### 文档格式支持

| 格式 | 创建 | 编辑 | 转换 | 工具 |
|------|------|------|------|------|
| DOCX | docx-js | XML 编辑 | Pandoc | docx-js |
| PDF | ReportLab | pypdf | 多格式 | pypdf, pdfplumber |
| PPTX | pptxgenjs | XML 编辑 | PDF | pptxgenjs |
| HTML | 原生 | 原生 | Markdown | markdown-it |
| Markdown | 原生 | 原生 | HTML/DOCX | Pandoc |

### 翻译模式对比

| 模式 | 步骤 | 适用场景 | 输出质量 |
|------|------|----------|----------|
| Quick | 翻译 | 短文本、非正式内容 | 基础 |
| Normal | 分析 -> 翻译 | 文章、博客 | 良好 |
| Refined | 分析 -> 翻译 -> 审查 -> 润色 | 出版级文档 | 优秀 |

### 约束条件
- DOCX 创建需使用 docx-js 库
- PDF 处理依赖 pypdf 和 pdfplumber
- PPTX 创建使用 pptxgenjs
- 翻译需配置目标语言和术语表
- 大文档需分块处理避免超时