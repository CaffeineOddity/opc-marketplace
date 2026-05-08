# 知识库文档元数据增强

## 实现概述

为知识库文档添加 YAML frontmatter，实现文档自描述和渐进式加载支持。

## 新增类型

```typescript
// src/mcp/types.ts

interface KnowledgeDocMeta {
  name: string;           // 文档名称
  description: string;    // 简短描述
  category: KnowledgeCategory;
  topic: string;          // 主题标识
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

interface KnowledgeDocWithMeta {
  meta: KnowledgeDocMeta;
  content: string;  // 不含 frontmatter 的纯内容
}
```

## 新增函数

### Frontmatter 处理

```typescript
// src/mcp/knowledge.ts

// 解析 frontmatter
parseFrontmatter(content: string): { meta: Partial<KnowledgeDocMeta>; content: string }

// 生成 frontmatter
generateFrontmatter(meta: KnowledgeDocMeta): string

// 读取文档（含元数据）
readKnowledgeDocWithMeta(topic, category, doc): KnowledgeDocWithMeta | null

// 列出所有文档简要信息（渐进式加载）
listKnowledgeDocsBrief(topic?, category?): KnowledgeDocMeta[]
```

### 修改的函数

```typescript
// writeKnowledgeDoc 现在自动添加 frontmatter
writeKnowledgeDoc(topic, category, doc, content, mode, section, cwd, meta?)
```

## 新增 MCP Tool

```typescript
opc_knowledge_list_brief: {
  topic?: string;
  category?: KnowledgeCategory;
}
// 返回所有文档的 name, description, topic, category
```

## Frontmatter 格式

```yaml
---
name: 文档名称
description: 简短描述
category: requirement | design | backend | ...
topic: hud | state-management | ...
created_at: 2026-05-08T06:43:10.614Z
updated_at: 2026-05-08T06:43:10.614Z
tags: [可选标签]
---
```

## 迁移

运行 `scripts/migrate-knowledge-frontmatter.js` 为现有文档添加 frontmatter。

## 使用示例

### 渐进式加载

```typescript
// 获取所有文档简要信息（无需读取完整内容）
const brief = listKnowledgeDocsBrief();
// [{ name: "main", description: "...", topic: "hud", category: "requirement" }, ...]

// 按需读取完整文档
const doc = readKnowledgeDocWithMeta("hud", "requirement", "main");
```

### 写入时自动添加元数据

```typescript
writeKnowledgeDoc("hud", "requirement", "main", content, "overwrite", undefined, undefined, {
  name: "需求规格",
  description: "HUD 功能需求文档"
});
```
