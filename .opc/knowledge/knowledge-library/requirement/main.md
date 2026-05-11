---
name: 知识库管理系统需求说明
description: 定义 OPC 知识库管理系统的核心功能需求，包括知识初始化、读写操作、特征匹配和文档组织等能力。
category: requirement
feature_name: knowledge-library
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [requirement, knowledge, documentation, management]
---
# WHAT（要做什么）

OPC 知识库管理系统提供自进化的知识积累能力，确保项目知识在完整生命周期中持续积累和传递。系统基于 MCP 工具实现，提供以下核心能力：

1. **知识初始化** - 为每个功能创建知识域
2. **知识读写** - 按类别读写知识文档
3. **特征匹配** - 相似任务自动复用知识
4. **文档组织** - 结构化的知识目录和元数据

**MCP 工具列表：**

| 工具 | 用途 |
|------|------|
| `opc_knowledge_init` | 初始化知识域 |
| `opc_knowledge_read` | 读取知识文档 |
| `opc_knowledge_write` | 写入知识文档 |
| `opc_knowledge_exists` | 检查知识是否存在 |
| `opc_knowledge_list` | 列出所有知识特征 |
| `opc_knowledge_docs` | 列出类别下的文档 |

**知识类别：**

| 类别 | 阶段 | 描述 |
|------|------|------|
| `requirement` | Product | 需求规格、用户故事 |
| `design` | Design | UI/UX 设计、交互流程 |
| `architecture` | Dev | 系统架构、技术选型 |
| `tech_guide` | Dev | 技术指南、实现要点 |
| `api_guide` | Dev | API 文档、接口规范 |
| `qa_test` | QA | 测试计划、测试用例 |
| `issues` | Dev | 问题记录、Bug 修复 |
| `growth` | Growth | 增长指标、分析报告 |

# WHY（为什么要做）

多阶段开发中，上下文传递是关键挑战：

| 阶段 | 没有知识库 | 有知识库 |
|------|-----------|----------|
| Design | 从零开始设计 | 基于需求设计 |
| Dev | 可能实现错误 API | 遵循设计决策 |
| QA | 可能测试错误场景 | 测试需求和边界 |
| Ship | 可能部署错误配置 | 使用验证的架构 |

知识库系统解决：

| 痛点 | 解决方案 |
|------|----------|
| 上下文丢失 | 阶段间自动传递知识 |
| 决策遗忘 | 持久化存储决策和约束 |
| 重复工作 | 相似任务复用知识 |
| 文档分散 | 统一的知识组织结构 |

## 功能性需求

### 核心功能

1. **知识初始化**
   - 创建知识域目录结构
   - 设置元数据（name, description, feature_name）
   - 初始化主文档模板

2. **知识读写**
   - 按类别读取知识文档
   - 写入或更新知识文档
   - 支持追加模式
   - 自动添加 YAML frontmatter

3. **特征匹配**
   - 相似度计算（>50% 自动复用）
   - 候选列表（30-50% 询问确认）
   - 无匹配时创建新特征

4. **文档组织**
   - 目录结构：`.opc/knowledge/{feature_name}/{category}/`
   - 文档命名：`main.md`, `tech.md`, `test.md`
   - 子目录支持：`design/ui/`, `backend/api/`

5. **元数据管理**
   - YAML frontmatter 自描述
   - 渐进加载支持
   - 列表视图友好

### 辅助功能

1. **知识存在检查**
   - 检查文档是否存在
   - 检查类别是否存在

2. **知识列表**
   - 列出所有知识特征
   - 列出类别下的文档

3. **知识模板**
   - 预定义内容模板
   - 支持自定义模板

## 非功能性需求

- **性能**：
  - 知识读写 < 200ms
  - 特征匹配 < 500ms
  - 列表查询 < 100ms

- **安全性**：
  - 知识文件存储在项目目录
  - 可提交到 Git，团队共享
  - 不包含敏感信息

- **可靠性**：
  - 原子写入，避免损坏
  - 元数据验证
  - 文档格式检查

- **可用性**：
  - 自动管理，无需手动干预
  - 清晰的目录结构
  - 人类可读的文档格式

## 不做什么（Non-goals）

1. **不支持知识搜索** - 按类别和特征名访问
2. **不支持知识版本** - 始终使用最新版本
3. **不支持知识加密** - 明文存储
4. **不支持知识同步** - 依赖 Git 同步

## 验收标准（Done Definition）

- [ ] `opc_knowledge_init` 正确创建知识域
- [ ] `opc_knowledge_read` 正确读取知识
- [ ] `opc_knowledge_write` 正确写入知识
- [ ] `opc_knowledge_exists` 正确检查存在
- [ ] `opc_knowledge_list` 正确列出特征
- [ ] `opc_knowledge_docs` 正确列出文档
- [ ] 特征匹配正确工作
- [ ] 目录结构正确创建
- [ ] YAML frontmatter 正确添加
- [ ] 知识模板正确应用
- [ ] Git 提交时知识正确共享