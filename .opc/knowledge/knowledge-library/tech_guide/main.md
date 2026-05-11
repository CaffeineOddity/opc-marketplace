---
name: 知识库管理系统技术指南
description: OPC 知识库管理系统的使用指南，包括 MCP 工具使用、知识流转、文档组织和最佳实践。
category: tech_guide
feature_name: knowledge-library
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide, knowledge, documentation, usage]
---
## 技术栈

- **协议**：MCP (Model Context Protocol)
- **格式**：Markdown + YAML frontmatter
- **存储**：文件系统

## 快速开始

### 查看知识库

```shell
/opc status
```

输出包含知识特征列表：
```
## 知识库
- user-auth (用户认证)
- payment-integration (支付集成)
- ios-localization (iOS多语言)
```

### 知识流转示例

```
# Stage 1: Product
opc_knowledge_init({ title: "User Login", feature_name: "user-auth" })
→ product-agent 执行
→ opc_knowledge_write({ feature_name: "user-auth", category: "requirement", doc: "main", content })

# Stage 2: Design
opc_knowledge_read({ feature_name: "user-auth", category: "requirement" })
→ design-agent 执行（带需求上下文）
→ opc_knowledge_write({ feature_name: "user-auth", category: "design", doc: "ui", content })

# Stage 3: Dev
opc_knowledge_read({ feature_name: "user-auth", category: "requirement" })
opc_knowledge_read({ feature_name: "user-auth", category: "design" })
→ dev-agent 执行（带完整上下文）
→ opc_knowledge_write({ feature_name: "user-auth", category: "tech_guide", doc: "main", content })
```

## MCP 工具参考

### opc_knowledge_init

初始化知识域。

```typescript
opc_knowledge_init({
  title: "用户登录功能",
  feature_name: "user-auth"
})
```

返回：
```json
{
  "feature_name": "user-auth",
  "path": ".opc/knowledge/user-auth/",
  "matched": false  // 是否匹配到现有特征
}
```

### opc_knowledge_read

读取知识文档。

```typescript
// 读取单个文档
opc_knowledge_read({
  feature_name: "user-auth",
  category: "requirement",
  doc: "main"
})

// 读取多个类别（合并）
opc_knowledge_read({
  feature_name: "user-auth",
  category: ["requirement", "design"]
})
```

返回：
```json
{
  "content": "# WHAT...",
  "metadata": {
    "name": "用户认证需求说明",
    "description": "...",
    "category": "requirement",
    "feature_name": "user-auth",
    "updated_at": "2026-05-12T10:00:00Z"
  }
}
```

### opc_knowledge_write

写入知识文档。

```typescript
opc_knowledge_write({
  feature_name: "user-auth",
  category: "design",
  doc: "ui",
  content: `
## UI Design

### Login Page
- Email input
- Password input
- Submit button
  `
})
```

### opc_knowledge_exists

检查知识是否存在。

```typescript
opc_knowledge_exists({
  feature_name: "user-auth",
  category: "design",
  doc: "ui"
})
```

返回：
```json
{
  "exists": true,
  "path": ".opc/knowledge/user-auth/design/ui.md"
}
```

### opc_knowledge_list

列出所有知识特征。

```typescript
opc_knowledge_list()
```

返回：
```json
{
  "features": [
    {
      "feature_name": "user-auth",
      "title": "用户认证",
      "categories": ["requirement", "design", "tech_guide"]
    },
    {
      "feature_name": "payment-integration",
      "title": "支付集成",
      "categories": ["requirement", "architecture"]
    }
  ]
}
```

### opc_knowledge_docs

列出类别下的文档。

```typescript
opc_knowledge_docs({
  feature_name: "user-auth",
  category: "design"
})
```

返回：
```json
{
  "docs": [
    {
      "doc": "main",
      "name": "用户认证设计",
      "updated_at": "2026-05-12T10:00:00Z"
    },
    {
      "doc": "ui",
      "name": "UI 组件设计",
      "updated_at": "2026-05-12T11:00:00Z"
    }
  ]
}
```

## 实现要点

### 知识初始化

```python
def knowledge_init(title, feature_name):
    # 1. 检查特征是否存在
    feature_path = KNOWLEDGE_DIR / feature_name
    if feature_path.exists():
        return {"feature_name": feature_name, "matched": True}

    # 2. 匹配相似特征
    matches = match_similar_features(feature_name)
    if matches:
        best_match = matches[0]
        if best_match.similarity > 0.5:
            # 自动复用
            return {"feature_name": best_match.name, "matched": True}
        elif best_match.similarity > 0.3:
            # 询问用户
            return {"candidates": matches}

    # 3. 创建目录结构
    feature_path.mkdir(parents=True)
    (feature_path / "requirement").mkdir()

    # 4. 初始化主文档
    content = apply_template("requirement", title, feature_name)
    write_doc(feature_path / "requirement" / "main.md", content)

    return {"feature_name": feature_name, "matched": False}
```

### 知识写入

```python
def knowledge_write(feature_name, category, doc, content):
    # 1. 构建路径
    doc_path = KNOWLEDGE_DIR / feature_name / category / f"{doc}.md"

    # 2. 创建目录
    doc_path.parent.mkdir(parents=True, exist_ok=True)

    # 3. 生成 frontmatter
    frontmatter = {
        "name": extract_name(content) or f"{feature_name} {category}",
        "description": extract_description(content) or "",
        "category": category,
        "feature_name": feature_name,
        "updated_at": datetime.now().isoformat()
    }

    # 4. 合并内容
    full_content = f"---\n{yaml.dump(frontmatter)}---\n{content}"

    # 5. 写入文件
    doc_path.write_text(full_content)
```

### 特征匹配

```python
def match_similar_features(feature_name):
    features = list_features()
    matches = []

    for feature in features:
        # 名称相似度
        name_sim = string_similarity(feature_name, feature.name)

        # 关键词匹配
        keywords = extract_keywords(feature_name)
        keyword_sim = keyword_match(keywords, feature.keywords)

        # 综合相似度
        similarity = 0.6 * name_sim + 0.4 * keyword_sim

        if similarity > 0.3:
            matches.append({
                "name": feature.name,
                "similarity": similarity
            })

    return sorted(matches, key=lambda x: x["similarity"], reverse=True)
```

## 知识类别详解

| 类别 | 阶段 | 文档 | 描述 |
|------|------|------|------|
| `requirement` | Product | main | 需求规格、用户故事、验收标准 |
| `design` | Design | main, ui, interaction | UI/UX 设计、交互流程 |
| `architecture` | Dev | main | 系统架构、技术选型 |
| `tech_guide` | Dev | main | 技术指南、实现要点 |
| `api_guide` | Dev | main | API 文档、接口规范 |
| `core_flows` | Dev | main | 核心流程、业务逻辑 |
| `data_flows` | Dev | main | 数据流、数据模型 |
| `qa_test` | QA | main, cases | 测试计划、测试用例 |
| `issues` | Dev | main, index | 问题记录、Bug 修复 |
| `growth` | Growth | main, metrics | 增长指标、分析报告 |

## 阶段到类别映射

| 阶段 | 读取 | 写入 |
|------|------|------|
| product | - | requirement/main |
| design | requirement | design/ui |
| dev (web) | requirement, design | tech_guide/main, api_guide/main |
| dev (backend) | requirement | backend/api, architecture/main |
| qa | tech_guide, api_guide | qa_test/main |
| ship | architecture | shared/infrastructure |
| growth | requirement | growth/metrics |

## Agent 调度模板

```typescript
Agent({agent}, `
## Task: {task}

## Knowledge Context (先阅读)
${knowledgeContext}

## Instructions
1. 审阅知识上下文
2. 理解前一阶段决策
3. 执行当前阶段任务
4. 完成后总结知识更新

## Output
1. 交付物
2. 知识更新 (供下一阶段使用)
`)
```

## 最佳实践

### 知识初始化

- **特征命名**：使用语义化名称，如 `user-auth`, `payment-integration`
- **避免冲突**：不要使用类别名作为特征名
- **相似复用**：让系统自动匹配相似特征

### 知识写入

- **有意义的元数据**：
  - `name`: 人类可读的文档名
  - `description`: 文档内容和用途
  - `tags`: 有助于过滤的关键词

- **结构化内容**：
  - 使用标题组织内容
  - 使用列表和表格
  - 包含示例和代码块

### 知识流转

- **读取前置知识**：每个阶段开始前读取相关知识
- **写入当前知识**：阶段完成后写入知识
- **注入上下文**：将知识注入 Agent 调度

### Git 管理

- **提交知识**：`.opc/knowledge/` 提交到版本控制
- **团队共享**：团队成员共享知识库
- **定期同步**：定期 pull/push 保持同步

## 常见问题

### Q: 如何查看知识库内容？

```
/opc status
# 或
opc_knowledge_list()
```

### Q: 如何查看特定知识？

```
opc_knowledge_read({
  feature_name: "user-auth",
  category: "requirement",
  doc: "main"
})
```

### Q: 特征匹配错误怎么办？

```
# 可以手动指定 feature_name
opc_knowledge_init({
  title: "用户登录",
  feature_name: "user-auth"  # 显式指定
})
```

### Q: 如何添加新类别？

```
# 直接写入即可自动创建
opc_knowledge_write({
  feature_name: "user-auth",
  category: "my-custom-category",  # 新类别
  doc: "main",
  content: "..."
})
```

### Q: 知识文档格式是什么？

```markdown
---
name: 文档名称
description: 文档描述
category: 类别
feature_name: 特征名
created_at: 创建时间
updated_at: 更新时间
tags: [标签]
---

# 内容标题

内容...
```

## 文件路径参考

| 路径 | 用途 |
|------|------|
| `.opc/knowledge/{feature_name}/` | 特征根目录 |
| `.opc/knowledge/{feature_name}/{category}/` | 类别目录 |
| `.opc/knowledge/{feature_name}/{category}/{doc}.md` | 知识文档 |

## Git 提交建议

| 路径 | 提交? | 原因 |
|------|:-----:|------|
| `.opc/knowledge/` | ✅ | 团队共享的知识 |
| `.opc/knowledge/*/requirement/` | ✅ | 需求文档 |
| `.opc/knowledge/*/design/` | ✅ | 设计文档 |
| `.opc/knowledge/*/tech_guide/` | ✅ | 技术文档 |