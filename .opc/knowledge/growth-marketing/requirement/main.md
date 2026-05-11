---
name: 需求说明
description: WHAT/WHY、功能性与非功能性需求、验收标准。
category: requirement
feature_name: growth-marketing
created_at: 2026-05-11T16:41:37.896Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [requirement]
---
# WHAT（要做什么）

growth-kit 是 OPC 市场的增长营销插件，为一人公司提供完整的增长阶段能力：
- **营销策略**：营销计划制定与渠道规划
- **内容创作**：博客、社媒、邮件、案例等多种内容形式
- **视觉内容**：封面图、信息图、漫画等多种视觉素材
- **SEO 优化**：关键词策略、内容规划、SEO 写作
- **数据分析**：BI 分析、指标体系、预测分析
- **多平台发布**：微信、微博、X/Twitter 等平台

# WHY（为什么要做）

一人公司需要高效的增长工具：
- **内容驱动增长**：内容是最好的营销投资
- **数据决策**：直觉不是策略，数据驱动增长
- **多渠道覆盖**：一次创作，多平台分发
- **SEO 长期价值**：有机流量是最可持续的增长来源

## 功能性需求

### Skills（技能）

| Skill | 功能描述 |
|-------|----------|
| `/marketing-plan` | 营销策略与渠道规划 |
| `/content-create` | 内容创作（博客/社媒/邮件/案例） |
| `/baoyu-xhs-images` | 小红书图片卡片系列 |
| `/baoyu-image-cards` | 社交媒体信息图卡片 |
| `/baoyu-comic` | 知识漫画创作 |
| `/baoyu-cover-image` | 文章封面图（11色板 x 7渲染风格） |
| `/baoyu-article-illustrator` | 文章配图（类型 x 风格 x 色板） |
| `/baoyu-infographic` | 专业信息图（21布局 x 21风格） |
| `/baoyu-youtube-transcript` | YouTube 字幕下载 |
| `/baoyu-post-to-wechat` | 发布到微信公众号 |
| `/baoyu-post-to-weibo` | 发布到微博 |
| `/baoyu-post-to-x` | 发布到 X/Twitter |

### Agents（智能体）

| Agent | 模型 | 职责 |
|-------|------|------|
| marketing-agent | sonnet | 营销策略、内容创作、渠道分发 |
| data-analyst | sonnet | BI 分析、指标体系、预测分析 |
| seo-keyword-strategist | haiku | 关键词策略、LSI 关键词 |
| seo-content-planner | haiku | 内容日历、话题集群 |
| seo-content-writer | sonnet | SEO 优化内容写作 |

## 非功能性需求

- 性能：内容生成响应时间 < 30 秒
- 安全性：发布内容需符合平台规范
- 可靠性：多平台发布失败需有重试机制
- 可用性：支持中文和英文内容创作

## 不做什么（Non-goals）

- 不提供付费广告投放功能
- 不替代专业营销团队的复杂需求
- 不提供实时社交媒体监控
- 不处理付费媒体购买

## 验收标准（Done Definition）

- [ ] 营销计划模板覆盖主流营销场景
- [ ] 内容创作支持至少 5 种内容类型
- [ ] 视觉内容生成支持多种风格和布局
- [ ] SEO 内容符合 E-E-A-T 标准
- [ ] 多平台发布功能正常工作