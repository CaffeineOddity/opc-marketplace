# 知识库文档元数据增强

## 背景

当前知识库文档是纯 Markdown 文件，元数据存储在 `index.json` 中与文档分离。这导致：

1. **渐进式加载困难**：需要先读取 index.json 才能了解文档内容
2. **文档不自描述**：单独读取文档时缺少上下文
3. **迁移和同步风险**：文档与 index.json 可能不一致

## 需求

为每个知识库文档添加 YAML frontmatter，包含以下字段：

```yaml
---
name: 文档名称
description: 简短描述（用于列表展示和渐进加载）
category: requirement | design | backend | ios | android | harmony | web | miniprogram | qa | ship | growth
topic: 主题标识（如 "hud", "state-management"）
created_at: 创建时间
updated_at: 更新时间
tags: [可选标签]
---
```

## 验收标准

### AC-1: 写入时自动添加 frontmatter

- `writeKnowledgeDoc` 函数在写入文档时自动添加 frontmatter
- frontmatter 包含所有必要元数据字段
- 不影响现有 append/update/overwrite 模式

### AC-2: 读取时解析 frontmatter

- `readKnowledgeDoc` 返回解析后的元数据和内容
- 新增 `readKnowledgeDocWithMeta` 函数返回结构化数据
- 向后兼容：无 frontmatter 的文档也能正常读取

### AC-3: 渐进式加载支持

- 新增 `listKnowledgeDocsBrief` 返回所有文档的简要信息
- 返回格式：`{ name, description, topic, category }[]`
- 无需读取完整文档内容

### AC-4: 迁移现有文档

- 提供迁移脚本为现有文档添加 frontmatter
- 从 index.json 提取元数据填充 frontmatter
- 保持向后兼容

## 技术设计

### 数据结构

```typescript
interface KnowledgeDocMeta {
  name: string;
  description: string;
  category: KnowledgeCategory;
  topic: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

interface KnowledgeDocWithMeta {
  meta: KnowledgeDocMeta;
  content: string;  // 不包含 frontmatter 的纯内容
}
```

### API 变更

```typescript
// 新增函数
export function parseFrontmatter(content: string): KnowledgeDocWithMeta;
export function generateFrontmatter(meta: KnowledgeDocMeta): string;
export function readKnowledgeDocWithMeta(topic, category, doc): KnowledgeDocWithMeta | null;
export function listKnowledgeDocsBrief(topic?, category?): KnowledgeDocMeta[];
```

## 影响范围

- `src/mcp/knowledge.ts` - 核心读写逻辑
- `src/mcp/types.ts` - 新增类型定义
- 现有知识库文档需要迁移
