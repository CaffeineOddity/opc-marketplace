---
name: 技术指南
description: 开发语言/框架确认、实现要点、关键决策与注意事项。
category: tech_guide
feature_name: design-system
created_at: 2026-05-12T00:00:00.000Z
updated_at: 2026-05-12T00:00:00.000Z
tags: [tech_guide, design-kit, skills, agents]
---
## 技术栈

- **语言**：Markdown（文档输出）、JSON（设计令牌）、YAML（配置）
- **框架**：Claude Code Plugin System
- **依赖**：
  - opc-founder（核心调度）
  - product-kit（上游需求）
  - dev-kit（下游开发）
- **工具**：Python 3（ui-ux-pro-max 脚本）

## 快速开始

### 1. 安装 design-kit

```shell
# 方式一：通过 opc-plugin 安装
/opc-plugin install design-kit

# 方式二：手动安装
/plugin install design-kit@opc-marketplace
```

### 2. 使用 Agents

#### 品牌设计
```shell
# 调用 brand-agent
Agent(subagent_type="design-kit:brand-agent", prompt="为 SaaS 产品设计品牌")

# 通过 /opc 命令自动调度
/opc 设计一个 SaaS 产品的品牌
```

#### Web 设计
```shell
# 调用 web-agent
Agent(subagent_type="design-kit:web-agent", prompt="设计 Dashboard 页面")

# 通过 /opc 命令自动调度
/opc 设计一个数据 Dashboard
```

#### Mobile 设计
```shell
# 调用 mobile-agent
Agent(subagent_type="design-kit:mobile-agent", prompt="设计 iOS 端个人中心页面")

# 通过 /opc 命令自动调度
/opc 设计一个 iOS 个人中心
```

#### 设计评审
```shell
# 调用 design-reviewer
Agent(subagent_type="design-kit:design-reviewer", prompt="评审 Landing Page 设计")

# 通过 /opc 命令自动调度
/opc 评审这个设计
```

### 3. 使用 Skills

#### UI/UX 设计规范
```shell
/ui-design

# 根据产品需求生成设计规范
```

#### 设计系统生成
```shell
# 生成完整设计系统
python3 skills/ui-ux-pro-max/scripts/search.py "SaaS dashboard elegant" --design-system -p "MyProject"

# 持久化设计系统（跨会话使用）
python3 skills/ui-ux-pro-max/scripts/search.py "SaaS dashboard" --design-system --persist -p "MyProject"

# 带页面特定覆盖
python3 skills/ui-ux-pro-max/scripts/search.py "checkout page" --design-system --persist -p "MyProject" --page "checkout"
```

#### AI 图像生成
```shell
# 生成 Logo 概念
/baoyu-imagine

# 配置 API 密钥后使用
```

## 实现要点

### brand-agent 实现要点

**设计流程**：

1. **Discovery（发现阶段）**
   - 理解产品/服务本质
   - 识别目标受众
   - 分析竞品
   - 定义品牌目标

2. **Strategy（策略阶段）**
   - 品牌定位声明
   - 品牌个性（3-5 个特质）
   - 品牌语调和调性
   - 关键信息

3. **Visual Identity（视觉识别阶段）**
   - 生成色彩系统选项
   - 选择字体配对
   - 创建 Logo 概念（使用 baoyu-imagine）
   - 定义视觉风格

4. **Guidelines（规范阶段）**
   - 编译品牌规范
   - 包含使用示例
   - 提供资产文件
   - 文档正确/错误用法

**品牌定位声明模板**：
```
对于 [目标受众]，
[品牌名] 是 [类别]
提供 [关键利益]
因为 [信任理由]。
```

**品牌个性维度**：
| 维度 | 特质 |
|------|------|
| 真诚 | 诚实、健康、友好 |
| 刺激 | 大胆、活泼、有想象力 |
| 能力 | 可靠、聪明、成功 |
| 精致 | 优雅、尊贵、精致 |
| 强健 | 户外、坚韧、运动 |

**色彩心理学**：
| 颜色 | 联想 |
|------|------|
| 蓝 | 信任、稳定、专业 |
| 绿 | 成长、健康、自然 |
| 红 | 能量、激情、紧迫 |
| 黄 | 乐观、创意、温暖 |
| 橙 | 友好、自信、活泼 |
| 紫 | 奢华、创意、智慧 |
| 黑 | 精致、力量、优雅 |
| 白 | 纯洁、简约、干净 |

### web-agent 实现要点

**响应式断点**：
| 断点 | 宽度 | 用途 |
|------|------|------|
| Mobile | 375px | 小屏手机 |
| Tablet | 768px | 平板 |
| Laptop | 1024px | 笔记本 |
| Desktop | 1440px | 桌面 |

**Web 性能考量**：
- 图片优化（WebP, srcset, lazy loading）
- 字体加载策略
- 关键 CSS
- Core Web Vitals

**无障碍要求（WCAG 2.1）**：
- 色彩对比度（最小 4.5:1）
- 键盘导航
- 屏幕阅读器支持
- Focus 管理
- 语义 HTML

**SEO 设计考量**：
- 语义结构
- Meta 标签放置
- Open Graph 和 Twitter Cards
- 结构化数据考量

**Web 设计检查清单**：
```markdown
### 视觉质量
- [ ] 无 emoji 作为图标（使用 SVG）
- [ ] 一致的图标集（Heroicons/Lucide）
- [ ] Hover 状态不导致布局偏移
- [ ] 平滑过渡（150-300ms）

### 交互
- [ ] 所有可点击元素有 cursor-pointer
- [ ] 清晰的 Hover 反馈
- [ ] 可见的 Focus 状态
- [ ] 定义加载状态

### 响应式
- [ ] 在 375px, 768px, 1024px, 1440px 正常工作
- [ ] 移动端无水平滚动
- [ ] 触摸目标最小 44x44px
- [ ] 移动端可读字体（最小 16px）

### 无障碍
- [ ] 色彩对比度最小 4.5:1
- [ ] 所有图片有 alt 文本
- [ ] 表单输入有标签
- [ ] 键盘可导航
- [ ] prefers-reduced-motion 支持
```

### mobile-agent 实现要点

**iOS (HIG) 指南**：

**导航**：
- Tab Bar 用于主导航（3-5 项）
- Navigation Bar 用于层级内容
- Modal 展示用于专注任务
- 滑动手势用于返回导航

**组件**：
- SF Symbols 用于图标
- SwiftUI 原生组件
- Dynamic Type 用于无障碍
- Context menus 和 swipe actions

**视觉**：
- San Francisco 字体家族
- iOS 色彩系统
- 模糊效果和半透明
- 圆角（continuous corners）

**Android (Material Design 3) 指南**：

**导航**：
- Bottom Navigation 用于主导航（3-5 项）
- Navigation Drawer 用于复杂层级
- Top App Bar 用于上下文
- Floating Action Button (FAB) 用于主要操作

**组件**：
- Material Icons
- Material 组件（Compose）
- Material You 动态色彩
- Cards 和 elevation

**视觉**：
- Roboto 字体家族
- Material 色彩系统
- Elevation 和阴影
- 圆角形状

**触摸目标要求**：
- 最小 44x44pt
- 交互元素之间足够间距
- 触摸反馈清晰
- 手势模式可发现

**设备覆盖**：
- 小屏手机（iPhone SE, 375px）
- 大屏手机（iPhone Pro Max, 428px）
- 平板（iPad, 768px+）
- 横屏方向

### design-reviewer 实现要点

**评审类别**：

#### 1. 无障碍（WCAG 2.1 AA）— CRITICAL

**色彩对比度**：
- [ ] 普通文本（< 18px）对比度 >= 4.5:1
- [ ] 大文本（>= 18px 或 14px 粗体）对比度 >= 3:1
- [ ] UI 组件对比度 >= 3:1
- [ ] 图形对象对比度 >= 3:1
- [ ] Focus 指示器对比度 >= 3:1

**键盘导航**：
- [ ] 所有交互元素可聚焦
- [ ] Focus 顺序匹配视觉顺序
- [ ] Focus 指示器可见
- [ ] 无键盘陷阱
- [ ] 提供跳过链接（如需要）

**屏幕阅读器**：
- [ ] 所有图片有有意义的 alt 文本
- [ ] 装饰性图片有空 alt
- [ ] 表单输入有关联标签
- [ ] 复杂元素有 aria 标签
- [ ] 标题遵循逻辑层级
- [ ] Landmarks 正确使用

**触摸目标**：
- [ ] 触摸目标最小 44x44px（Web）
- [ ] 触摸目标最小 44x44pt（Mobile）
- [ ] 目标之间足够间距
- [ ] 无意外触摸触发

#### 2. 视觉质量 — HIGH

**图标**：
- [ ] 无 emoji 作为 UI 图标
- [ ] 使用 SVG 图标（非 PNG/JPG）
- [ ] 一致的图标集（Heroicons, Lucide 等）
- [ ] 图标尺寸一致
- [ ] 品牌 Logo 正确（从 Simple Icons 验证）

**Hover 状态**：
- [ ] Hover 提供清晰视觉反馈
- [ ] Hover 不导致布局偏移
- [ ] 过渡平滑（150-300ms）
- [ ] 可点击元素光标变为 pointer

**Light/Dark 模式**：
- [ ] Light 模式文本有足够对比度
- [ ] Dark 模式文本有足够对比度
- [ ] Glass/透明元素在两种模式下可见
- [ ] 边框在两种模式下可见
- [ ] 图片在两种模式下正常

#### 3. 品牌合规 — HIGH

**Logo 使用**：
- [ ] Logo 位置正确
- [ ] Logo 颜色正确
- [ ] Logo 最小尺寸符合要求
- [ ] Logo 周围保持清晰空间
- [ ] 无未批准的 Logo 修改

**色彩**：
- [ ] 主品牌色使用正确
- [ ] 辅助色匹配指南
- [ ] 语义色适当
- [ ] 无偏离品牌的色彩使用

**字体**：
- [ ] 标题使用品牌字体
- [ ] 正文使用品牌字体
- [ ] 字重匹配指南
- [ ] 无未批准的字体使用

#### 4. UX 完整性 — HIGH

**状态覆盖**：
- [ ] Default 状态定义
- [ ] Hover 状态定义（Web）
- [ ] Focus 状态定义
- [ ] Active 状态定义
- [ ] Disabled 状态定义
- [ ] Loading 状态定义
- [ ] Empty 状态定义
- [ ] Error 状态定义
- [ ] Success 状态定义

**边缘情况**：
- [ ] 长文本处理
- [ ] 短文本处理
- [ ] 缺失数据处理
- [ ] 零值处理
- [ ] RTL 支持（如需要）
- [ ] 国际化考量

**问题严重级别**：
| 级别 | 定义 | 响应 |
|------|------|------|
| **Critical** | 阻塞用户或法律违规 | 必须在发布前修复 |
| **High** | 显著影响 UX/品牌 | 应在发布前修复 |
| **Medium** | 明显但不阻塞 | 在下次迭代修复 |
| **Low** | 小的优化 | 方便时修复 |

**评审报告模板**：
```markdown
# 设计评审报告

## 摘要
- 总问题数：[count]
- Critical：[count]
- High：[count]
- Medium：[count]
- Low：[count]

## Critical 问题
| ID | 类别 | 位置 | 问题 | 建议 |
|----|------|------|------|------|
| C1 | 无障碍 | [位置] | [问题] | [修复] |

## High 问题
| ID | 类别 | 位置 | 问题 | 建议 |
|----|------|------|------|------|
| H1 | 品牌 | [位置] | [问题] | [修复] |

## Medium 问题
...

## Low 问题
...

## 建议
1. [优先建议]
2. [次要建议]

## 批准实现
- [ ] 是，修复 Critical 问题后
- [ ] 是，修复 Critical + High 问题后
- [ ] 否，需要重大修订
```

### /ui-ux-pro-max Skill 实现要点

**使用流程**：

```bash
# Step 1: 分析用户需求
# 提取：产品类型、风格关键词、行业、技术栈

# Step 2: 生成设计系统（必需）
python3 skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system -p "ProjectName"

# Step 2b: 持久化设计系统（可选）
python3 skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "ProjectName"

# Step 3: 补充详细搜索（按需）
python3 skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>

# Step 4: 技术栈指南
python3 skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack <stack>
```

**可用域**：
| 域 | 用途 | 示例关键词 |
|------|------|------|
| `product` | 产品类型推荐 | SaaS, e-commerce, portfolio, healthcare |
| `style` | UI 风格、色彩、效果 | glassmorphism, minimalism, dark mode |
| `typography` | 字体配对、Google Fonts | elegant, playful, professional |
| `color` | 按产品类型的色彩系统 | saas, ecommerce, healthcare, fintech |
| `landing` | 页面结构、CTA 策略 | hero, testimonial, pricing, social-proof |
| `chart` | 图表类型、库推荐 | trend, comparison, timeline, funnel |
| `ux` | 最佳实践、反模式 | animation, accessibility, z-index |
| `react` | React/Next.js 性能 | waterfall, bundle, suspense, memo |
| `web` | Web 界面指南 | aria, focus, keyboard, semantic |

**可用技术栈**：
| 栈 | 焦点 |
|------|------|
| `html-tailwind` | Tailwind 工具类、响应式、无障碍（默认） |
| `react` | 状态、hooks、性能、模式 |
| `nextjs` | SSR、路由、图片、API 路由 |
| `vue` | Composition API、Pinia、Vue Router |
| `svelte` | Runes、stores、SvelteKit |
| `swiftui` | Views、State、Navigation、Animation |
| `react-native` | 组件、Navigation、Lists |
| `flutter` | Widgets、State、Layout、Theming |
| `shadcn` | shadcn/ui 组件、主题、表单、模式 |

## 关键决策

### 1. 为什么使用 4 个独立 Agent？
- 品牌设计、Web 设计、Mobile 设计、设计评审是不同的专业领域
- 每个 Agent 可以专注于特定领域的设计指南和最佳实践
- 支持并行工作流（Web + Mobile 同时设计）

### 2. 为什么将原 5 个 Agent 转换为 Reference？
- 原 agent（ui-agent, ux-agent, ui-ux-designer, design-system-architect, ux-researcher）提供的是设计知识
- Reference 文档更适合作为知识参考，而非交互式 agent
- 新架构更清晰：4 个执行 Agent + 6 个参考文档

### 3. 为什么所有 Agent 使用 sonnet 模型？
- 设计任务需要平衡性能与成本
- sonnet 提供足够的推理能力处理复杂设计决策
- 对于简单任务，可以通过 founder-agent 调度更经济的模型

### 4. 为什么设计评审是独立 Agent？
- 设计评审需要客观、独立的视角
- 避免设计者自我评审的盲点
- 提供结构化的问题报告和修复建议

## 最佳实践

### 品牌设计
1. 从品牌策略开始，再进行视觉设计
2. 品牌个性要一致，3-5 个特质
3. Logo 设计要简单、可缩放、无时间限制
4. 品牌规范要包含正确/错误用法示例

### Web 设计
1. 移动优先的响应式设计
2. 参考品牌指南进行视觉设计
3. 确保无障碍合规（WCAG 2.1 AA）
4. 定义所有状态（加载、错误、空、成功）

### Mobile 设计
1. 遵循平台特定设计指南（HIG/Material）
2. 触摸目标最小 44x44pt
3. 考虑安全区域和刘海
4. 设计离线体验

### 设计评审
1. 系统化评审，不遗漏任何类别
2. 问题要量化（严重级别、类别、位置）
3. 提供可操作的修复建议
4. 引用相关设计指南

## 常见问题

### Q: brand-agent 和 web-agent 如何协作？
A: brand-agent 先定义品牌规范，web-agent 引用品牌规范进行 Web 设计。品牌规范包括色彩、字体、视觉风格等。

### Q: 什么时候使用 /ui-ux-pro-max vs /ui-design？
A: `/ui-ux-pro-max` 用于生成完整设计系统，包含风格、色彩、字体等。`/ui-design` 用于从需求生成设计规范文档。

### Q: 如何确保设计满足无障碍要求？
A: 使用 design-reviewer 进行无障碍评审，检查 WCAG 2.1 AA 合规性，包括色彩对比度、键盘导航、屏幕阅读器支持等。

### Q: Mobile 设计如何处理多平台？
A: mobile-agent 支持原生（iOS/Android）和跨平台（React Native/Flutter/uni-app）。设计时遵循平台特定指南，同时保持品牌一致性。

### Q: 如何与 dev-kit 交接？
A: 设计完成后，输出结构化设计规范文档，包括：
- 设计令牌（JSON 格式）
- 组件规格（Markdown 格式）
- 响应式行为说明
- 无障碍要求
- 资产文件（SVG、图片等）