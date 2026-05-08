# 知识库文档元数据增强 - 测试验证

## 单元测试

### parseFrontmatter

```typescript
describe('parseFrontmatter', () => {
  it('should parse valid frontmatter', () => {
    const content = `---
name: test-doc
description: Test description
category: requirement
topic: test
created_at: 2026-05-08T00:00:00.000Z
updated_at: 2026-05-08T00:00:00.000Z
---
# Content
Body text here`;

    const { meta, content: body } = parseFrontmatter(content);
    
    expect(meta.name).toBe('test-doc');
    expect(meta.description).toBe('Test description');
    expect(meta.category).toBe('requirement');
    expect(meta.topic).toBe('test');
    expect(body.trim()).toBe('# Content\nBody text here');
  });

  it('should handle missing frontmatter', () => {
    const content = '# Just content\nNo frontmatter here';
    const { meta, content: body } = parseFrontmatter(content);
    
    expect(meta).toEqual({});
    expect(body).toBe(content);
  });

  it('should parse array tags', () => {
    const content = `---
name: doc
description: desc
category: backend
topic: api
tags: [rest, graphql, async]
---
Content`;

    const { meta } = parseFrontmatter(content);
    expect(meta.tags).toEqual(['rest', 'graphql', 'async']);
  });
});
```

### generateFrontmatter

```typescript
describe('generateFrontmatter', () => {
  it('should generate valid frontmatter', () => {
    const meta: KnowledgeDocMeta = {
      name: 'test',
      description: 'Test doc',
      category: 'backend',
      topic: 'api',
      created_at: '2026-05-08T00:00:00.000Z',
      updated_at: '2026-05-08T00:00:00.000Z',
    };

    const frontmatter = generateFrontmatter(meta);
    
    expect(frontmatter).toContain('name: test');
    expect(frontmatter).toContain('description: Test doc');
    expect(frontmatter).toContain('category: backend');
    expect(frontmatter).toContain('topic: api');
    expect(frontmatter).toMatch(/^---\n/);
    expect(frontmatter).toMatch(/\n---$/);
  });
});
```

### writeKnowledgeDoc with frontmatter

```typescript
describe('writeKnowledgeDoc', () => {
  it('should add frontmatter to new documents', () => {
    writeKnowledgeDoc('test-topic', 'backend', 'test-doc', '# Content', 'overwrite');
    
    const doc = readKnowledgeDocWithMeta('test-topic', 'backend', 'test-doc');
    expect(doc?.meta.name).toBe('test-doc');
    expect(doc?.meta.category).toBe('backend');
    expect(doc?.meta.topic).toBe('test-topic');
    expect(doc?.content.trim()).toBe('# Content');
  });

  it('should preserve existing frontmatter on append', () => {
    writeKnowledgeDoc('test-topic', 'backend', 'test-doc', 'Initial content', 'overwrite', undefined, undefined, {
      name: 'Custom Name',
      description: 'Custom description',
    });
    
    writeKnowledgeDoc('test-topic', 'backend', 'test-doc', 'Appended content', 'append');
    
    const doc = readKnowledgeDocWithMeta('test-topic', 'backend', 'test-doc');
    expect(doc?.meta.name).toBe('Custom Name');
    expect(doc?.meta.description).toBe('Custom description');
    expect(doc?.content).toContain('Initial content');
    expect(doc?.content).toContain('Appended content');
  });
});
```

### listKnowledgeDocsBrief

```typescript
describe('listKnowledgeDocsBrief', () => {
  it('should return brief metadata for all documents', () => {
    const brief = listKnowledgeDocsBrief();
    
    expect(Array.isArray(brief)).toBe(true);
    for (const doc of brief) {
      expect(doc.name).toBeDefined();
      expect(doc.description).toBeDefined();
      expect(doc.category).toBeDefined();
      expect(doc.topic).toBeDefined();
    }
  });

  it('should filter by topic', () => {
    const brief = listKnowledgeDocsBrief('hud');
    expect(brief.every(d => d.topic === 'hud')).toBe(true);
  });

  it('should filter by category', () => {
    const brief = listKnowledgeDocsBrief(undefined, 'backend');
    expect(brief.every(d => d.category === 'backend')).toBe(true);
  });
});
```

## 集成测试

### MCP Tool: opc_knowledge_list_brief

```bash
# 测试命令
opc_knowledge_list_brief

# 预期输出
| Topic | Category | Name | Description |
|-------|----------|------|-------------|
| hud | backend | architecture | ... |
| hud | backend | knowledge | ... |
| hud | design | ui | ... |
| hud | requirement | main | ... |
```

### 迁移脚本验证

```bash
# 运行迁移
node scripts/migrate-knowledge-frontmatter.js

# 验证所有文档都有 frontmatter
for f in $(find .opc/knowledge -name "*.md"); do
  if ! head -1 "$f" | grep -q "^---$"; then
    echo "Missing frontmatter: $f"
  fi
done
```

## 验收标准检查

| AC | 状态 | 说明 |
|----|------|------|
| AC-1: 写入时自动添加 frontmatter | ✅ | writeKnowledgeDoc 已更新 |
| AC-2: 读取时解析 frontmatter | ✅ | readKnowledgeDocWithMeta 新增 |
| AC-3: 渐进式加载支持 | ✅ | listKnowledgeDocsBrief 新增 |
| AC-4: 迁移现有文档 | ✅ | migrate-knowledge-frontmatter.js |
