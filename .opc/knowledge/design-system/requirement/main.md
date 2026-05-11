---
name: 需求说明
description: WHAT/WHY、功能性与非功能性需求、验收标准。
category: requirement
feature_name: design-system
created_at: 2026-05-12T00:00:00.000Z
updated_at: 2026-05-12T00:00:00.000Z
tags: [requirement, design-kit, brand, web, mobile, design-review]
---
# WHAT（要做什么）

设计系统（design-system）是一套完整的设计阶段工具集，为一人公司提供从品牌设计到平台设计再到设计评审的完整能力。

核心功能包括：
- **品牌设计**：通过 brand-agent 进行品牌策略、视觉识别、Logo 设计、品牌规范制定
- **Web 设计**：通过 web-agent 进行响应式设计、Dashboard、Landing Page 设计
- **Mobile 设计**：通过 mobile-agent 进行 iOS/Android/跨平台应用设计
- **设计评审**：通过 design-reviewer 进行一致性检查、无障碍合规、品牌合规检查

# WHY（为什么要做）

一人公司模式下，设计阶段面临独特挑战：
- **品牌一致性**：缺乏专业设计团队，需要确保品牌在各平台一致应用
- **平台多样性**：需要同时支持 Web、iOS、Android 等多平台设计
- **质量保障**：设计需要满足无障碍标准、品牌规范，避免返工
- **效率优先**：需要快速产出高质量设计，支持敏捷迭代

design-system 解决这些痛点：
- 提供 4 个专业设计 Agent，覆盖品牌、Web、Mobile、评审全流程
- 提供 6 个 Reference 规范文档，作为设计标准参考
- 支持 3 个 Skills 快速生成设计系统和视觉素材
- 定义清晰的工作流和交接协议，确保设计质量

## 功能性需求

### 1. 品牌设计能力（brand-agent）

**品牌策略**：
- 品牌定位与差异化
- 品牌个性与语调
- 目标受众定义
- 竞品品牌分析
- 品牌故事与信息

**视觉识别**：
- Logo 设计概念（通过 baoyu-imagine 生成）
- 色彩系统（主色、辅色、强调色）
- 字体系统（标题、正文、UI）
- 视觉风格与氛围
- 图标与插画风格

**品牌规范**：
- Logo 使用规则
- 色彩规格（HEX、RGB、CMYK）
- 字体规则
- 间距与布局原则
- 正确与错误用法
- 应用示例

**输出产物**：
```
brand/
├── strategy.md          # 品牌策略文档
├── visual-identity.md   # 视觉识别规格
├── guidelines.md        # 品牌规范
├── assets/
│   ├── logo.svg         # 主 Logo
│   ├── logo-dark.svg    # 深色模式变体
│   ├── logo-icon.svg    # 图标/字母标
│   └── colors.json      # 色彩令牌
└── templates/
    ├── social-media.md  # 社交媒体模板
    └── email-signature.md
```

### 2. Web 设计能力（web-agent）

**信息架构**：
- 网站/页面结构与导航
- 内容层级与分组
- 用户路径分析
- 站点地图设计

**用户体验设计**：
- 用户流程图
- 交互模式
- 状态管理（加载、错误、空、成功）
- 微交互与动画

**视觉设计**：
- 布局与构图
- 响应式网格系统
- 色彩与字体应用
- 图标与图片选择

**组件规格**：
- 组件结构与变体
- 设计令牌（色彩、间距、字体）
- 响应式行为
- 无障碍要求

**技术栈支持**：
- 框架：React, Vue, Next.js, Svelte
- 样式：Tailwind CSS, CSS Modules, Styled Components
- 模式：Server Components, SSR, SSG

**Web 设计检查清单**：
- [ ] 无 emoji 作为图标（使用 SVG）
- [ ] 一致的图标集（Heroicons, Lucide）
- [ ] Hover 状态不导致布局偏移
- [ ] 平滑过渡（150-300ms）
- [ ] 所有可点击元素有 cursor-pointer
- [ ] 清晰的 Hover 反馈
- [ ] 可见的 Focus 状态
- [ ] 定义加载状态

**响应式要求**：
- [ ] 在 375px, 768px, 1024px, 1440px 正常工作
- [ ] 移动端无水平滚动
- [ ] 触摸目标最小 44x44px
- [ ] 移动端可读字体（最小 16px）

**无障碍要求（WCAG 2.1）**：
- [ ] 色彩对比度最小 4.5:1
- [ ] 所有图片有 alt 文本
- [ ] 表单输入有标签
- [ ] 键盘可导航
- [ ] prefers-reduced-motion 支持

### 3. Mobile 设计能力（mobile-agent）

**平台设计指南**：

| 平台 | 框架 | 设计指南 |
|------|------|----------|
| iOS | SwiftUI | Human Interface Guidelines (HIG) |
| Android | Jetpack Compose | Material Design 3 |

**跨平台框架支持**：
| 框架 | 用途 |
|------|------|
| React Native | JavaScript/React 跨平台 |
| Flutter | Dart 跨平台 |
| uni-app | Vue 跨平台（中国市场） |

**触摸与手势设计**：
- 触摸目标尺寸（最小 44x44pt）
- 手势模式（滑动、捏合、长按）
- 触觉反馈集成
- 触摸友好间距

**Mobile UX 模式**：
- 导航模式（Tab Bar、Drawer、Stack）
- 输入模式（键盘、选择器）
- 下拉刷新
- 无限滚动
- 底部弹窗和模态框

**响应式 Mobile 设计**：
- 多设备尺寸（iPhone SE 到 Pro Max）
- iPad/平板布局
- 横屏方向
- 分屏支持

**Mobile 特定考量**：
- 安全区域和刘海
- 状态栏处理
- 键盘避让
- 离线体验
- 推送通知设计
- App 图标和启动屏幕

### 4. 设计评审能力（design-reviewer）

**设计一致性评审**：
- 跨屏幕/页面视觉一致性
- 组件使用一致性
- 间距与对齐一致性
- 字体一致性
- 色彩使用一致性

**无障碍合规检查**：
- WCAG 2.1 AA 合规
- 色彩对比度验证（最小 4.5:1）
- 键盘导航支持
- 屏幕阅读器兼容性
- Focus 管理
- 触摸目标尺寸（最小 44x44px）

**品牌合规检查**：
- Logo 使用正确性
- 品牌色彩准确性
- 字体遵循度
- 文案品牌语调
- 视觉风格一致性

**UX 质量评审**：
- 用户流程完整性
- 错误状态覆盖
- 空状态覆盖
- 加载状态覆盖
- 反馈与可见性
- 导航清晰度

**设计系统合规**：
- 设计令牌使用
- 组件库遵循度
- 命名约定一致性
- 文档完整性

**问题严重级别**：
| 级别 | 定义 | 示例 |
|------|------|------|
| **Critical** | 阻塞用户或违反法律要求 | WCAG 失败、导航损坏、缺失状态 |
| **High** | 显著影响用户体验 | 品牌违规、核心组件不一致 |
| **Medium** | 明显但不阻塞 | 轻微不一致、次优 UX 模式 |
| **Low** | 小的优化项 | 间距调整、轻微对齐问题 |

### 5. Skills 能力

#### /ui-design skill
- **用途**：从产品需求生成 UI/UX 设计规范
- **输入**：产品需求或功能描述
- **输出**：结构化设计规范文档
- **流程**：
  1. 理解上下文（需求、用户故事）
  2. 信息架构设计
  3. 交互设计
  4. 组件规格
  5. 设计令牌定义

#### /ui-ux-pro-max skill
- **用途**：设计系统生成器
- **能力**：
  - 50+ 设计风格
  - 97 色彩系统
  - 57 字体配对
  - 25 图表类型
  - 9 技术栈支持
- **使用方式**：
  ```bash
  python3 scripts/search.py "<query>" --design-system -p "ProjectName"
  ```

#### /baoyu-imagine skill
- **用途**：AI 图像生成
- **支持提供商**：OpenAI, Azure, Google, DashScope, Replicate, OpenRouter, Minimax, Zai
- **用途场景**：
  - Logo 概念生成
  - 品牌视觉素材
  - 设计 Mockup
  - 插画风格探索

### 6. Reference 规范文档

| 文档 | 描述 |
|------|------|
| `ux-design-guide.md` | UX 设计原则、用户流程、线框图、可用性启发式 |
| `ui-design-guide.md` | UI 设计原则、设计令牌、色彩系统、字体排版 |
| `design-system-guide.md` | 设计系统架构、令牌分类、组件库、主题系统 |
| `ux-research-guide.md` | 用户研究方法、可用性测试、访谈、旅程地图 |
| `brand-design-guide.md` | 品牌设计流程、视觉识别、品牌规范 |
| `design-review-checklist.md` | 设计评审清单、无障碍检查、品牌合规 |

## 非功能性需求

- **性能**：
  - 设计系统生成：< 30秒
  - 图像生成：依赖 AI 提供商，通常 10-60秒
  - 设计评审报告：< 2分钟

- **安全性**：
  - AI 图像生成 API 密钥安全存储
  - 设计资产版本控制
  - 品牌资产访问控制

- **可靠性**：
  - 设计令牌格式标准化（JSON）
  - 组件规格无歧义
  - 评审报告可追溯

- **可用性**：
  - Agent 命名清晰：brand-agent, web-agent, mobile-agent, design-reviewer
  - 输出格式结构化
  - 支持中英文双语

## 不做什么（Non-goals）

- **不做前端实现**：不生成前端代码，交接给 dev-kit
- **不做用户测试执行**：提供方法论但不执行实际测试
- **不做项目管理**：不替代设计项目管理工具
- **不做过度设计**：一人公司需要快速迭代，保持设计精简

## 验收标准（Done Definition）

- [ ] brand-agent 可输出完整品牌策略和视觉识别
- [ ] web-agent 可输出响应式 Web 设计规范
- [ ] mobile-agent 可输出符合平台指南的 Mobile 设计
- [ ] design-reviewer 可输出结构化评审报告
- [ ] /ui-design skill 可生成结构化设计规范
- [ ] /ui-ux-pro-max skill 可生成完整设计系统
- [ ] /baoyu-imagine skill 可通过多提供商生成图像
- [ ] 所有 Reference 规范文档完整可用
- [ ] 与 product-kit 和 dev-kit 交接协议完整定义