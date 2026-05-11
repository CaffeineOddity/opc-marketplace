---
name: 需求设计
description: 交互、信息架构、边界与异常场景设计。
category: design
feature_name: design-system
created_at: 2026-05-12T00:00:00.000Z
updated_at: 2026-05-12T00:00:00.000Z
tags: [design, design-kit, design-principles, tokens, components]
---
## 设计原则

### 核心设计原则

#### 1. 一致性优先
- 视觉一致性：跨平台、跨页面保持视觉风格统一
- 交互一致性：相同功能使用相同的交互模式
- 语言一致性：文案风格、术语使用保持统一
- 品牌一致性：品牌元素在各触点一致应用

#### 2. 无障碍优先
- WCAG 2.1 AA 合规是最低标准
- 色彩对比度最小 4.5:1
- 键盘导航支持
- 屏幕阅读器兼容
- 触摸目标最小 44x44px/pt

#### 3. 用户为中心
- 设计符合用户心智模型，而非系统架构
- 减少认知负担
- 提供清晰反馈
- 支持错误恢复

#### 4. 精简高效
- 一人公司需要快速迭代
- 避免过度设计
- 保持设计系统精简可扩展
- 优先核心功能，后续扩展

### UX 设计原则（Nielsen 10 启发式）

1. **系统状态可见性**：用户始终知道正在发生什么
2. **与现实匹配**：使用用户熟悉的语言和概念
3. **用户控制与自由**：用户可以轻松撤销操作
4. **一致性与标准**：遵循平台和行业惯例
5. **错误预防**：设计防止错误发生
6. **识别而非回忆**：减少用户需要记忆的内容
7. **灵活性与效率**：支持高级用户加速操作
8. **美学与简约设计**：避免无关信息干扰
9. **帮助用户识别和恢复错误**：错误信息清晰、有帮助
10. **帮助与文档**：提供必要的帮助和文档

### 品牌设计原则

1. **简单**：品牌元素简单、易记
2. **一致**：所有触点保持一致
3. **差异化**：与竞品区分
4. **相关性**：与目标受众共鸣
5. **可扩展**：适用于各种尺寸和场景
6. **无时间限制**：超越潮流

## 设计令牌

### 令牌架构

```
设计令牌层级：
┌─────────────────────────────────────────┐
│ Primitive（原始值）                       │
│ #3B82F6, 16px, 4px                      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ Semantic（语义别名）                      │
│ color-primary, spacing-card             │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ Component（组件特定）                     │
│ button-bg-primary, input-border         │
└─────────────────────────────────────────┘
```

### 令牌命名约定

```
[category]-[property]-[variant]-[state]

示例：
- color-bg-primary
- color-text-muted
- spacing-padding-card
- border-radius-button
- shadow-elevation-2
```

### 色彩令牌

#### 色彩系统分类
| 类别 | 用途 | 示例令牌 |
|------|------|----------|
| **Primary** | 品牌色、主要操作 | color-primary, color-primary-hover |
| **Secondary** | 辅助操作、强调 | color-secondary, color-secondary-hover |
| **Semantic** | 成功、警告、错误、信息 | color-success, color-warning, color-error, color-info |
| **Neutral** | 文本、背景、边框 | color-text-primary, color-bg-primary, color-border |
| **Surface** | 卡片、模态框、覆盖层 | color-surface-card, color-surface-modal |

#### 色彩对比度要求（WCAG）
| 文本类型 | 最小对比度 |
|----------|------------|
| 普通文本（< 18px） | 4.5:1 |
| 大文本（>= 18px 或 14px 粗体） | 3:1 |
| UI 组件 | 3:1 |
| 图形对象 | 3:1 |

### 字体令牌

#### 字体层级
| 名称 | 尺寸 | 字重 | 用途 |
|------|------|------|------|
| Display | 48-72px | Bold | Hero 标题 |
| H1 | 32-40px | Bold | 页面标题 |
| H2 | 24-28px | Semibold | 章节标题 |
| H3 | 20-22px | Semibold | 子章节 |
| H4 | 18px | Medium | 卡片标题 |
| Body | 16px | Regular | 主要内容 |
| Small | 14px | Regular | 辅助文本 |
| Caption | 12px | Regular | 标签、提示 |

#### 行高指南
| 类型 | 行高 |
|------|------|
| 标题 | 1.2-1.3 |
| 正文 | 1.5-1.75 |
| 紧凑文本 | 1.4 |
| Caption | 1.4 |

### 间距令牌

#### 4px 基础间距系统
| 令牌 | 值 | 用途 |
|------|------|------|
| space-1 | 4px | 紧凑间距 |
| space-2 | 8px | 小间隙 |
| space-3 | 12px | 相关元素 |
| space-4 | 16px | 标准内边距 |
| space-5 | 20px | 章节间隙 |
| space-6 | 24px | 组件内边距 |
| space-8 | 32px | 大间隙 |
| space-10 | 40px | 章节外边距 |
| space-12 | 48px | 页面章节 |
| space-16 | 64px | 主要章节 |

### 边框与阴影令牌

#### 边框圆角
| 令牌 | 值 | 用途 |
|------|------|------|
| radius-sm | 4px | 小元素 |
| radius-md | 8px | 按钮、输入框 |
| radius-lg | 12px | 卡片 |
| radius-xl | 16px | 大卡片、模态框 |
| radius-full | 9999px | 圆形元素 |

#### 阴影层级
| 令牌 | 值 | 用途 |
|------|------|------|
| shadow-sm | 0 1px 2px rgba(0,0,0,0.05) | 轻微提升 |
| shadow-md | 0 4px 6px rgba(0,0,0,0.1) | 卡片 |
| shadow-lg | 0 10px 15px rgba(0,0,0,0.1) | 模态框 |
| shadow-xl | 0 20px 25px rgba(0,0,0,0.15) | 大模态框 |

## 组件规范

### 组件分类

| 类别 | 组件 |
|------|------|
| **Layout** | Box, Stack, Flex, Grid, Container |
| **Typography** | Heading, Text, Label, Link |
| **Forms** | Input, Select, Checkbox, Radio, Button |
| **Navigation** | Tabs, Breadcrumbs, Menu, Pagination |
| **Feedback** | Alert, Toast, Progress, Spinner |
| **Data Display** | Table, List, Card, Badge |
| **Overlay** | Modal, Popover, Tooltip, Drawer |

### 组件状态

每个交互组件需要定义以下状态：

| 状态 | 描述 |
|------|------|
| **Default** | 初始外观 |
| **Hover** | 鼠标悬停（Web） |
| **Focus** | 键盘导航焦点 |
| **Active** | 正在交互 |
| **Disabled** | 不可交互 |
| **Loading** | 等待数据 |
| **Empty** | 无数据显示 |
| **Error** | 发生错误 |
| **Success** | 操作成功 |

### Button 组件规范

```yaml
Component: Button
Description: 可点击的操作按钮

Variants:
  - primary: 主要操作
  - secondary: 辅助操作
  - destructive: 危险操作（删除等）
  - ghost: 无背景按钮
  - link: 链接样式按钮

Sizes:
  - sm: 32px 高度, 14px 字体
  - md: 40px 高度, 16px 字体（默认）
  - lg: 48px 高度, 18px 字体

States:
  - default: 正常状态
  - hover: 背景色加深 10%
  - focus: 2px focus ring
  - active: 背景色加深 20%
  - disabled: opacity 0.5, cursor not-allowed
  - loading: spinner + disabled

Tokens:
  - button-bg-primary: color-primary
  - button-text-primary: color-text-on-primary
  - button-border-radius: radius-md
  - button-padding-x: space-4
  - button-padding-y: space-2

Accessibility:
  - 最小触摸目标 44x44px
  - Focus ring 可见
  - aria-label 用于 icon-only 按钮
  - disabled 状态使用 aria-disabled
```

### Input 组件规范

```yaml
Component: Input
Description: 文本输入框

Variants:
  - default: 标准输入框
  - with-label: 带标签输入框
  - with-icon: 带图标输入框
  - with-error: 错误状态输入框

Sizes:
  - sm: 32px 高度, 14px 字体
  - md: 40px 高度, 16px 字体（默认）
  - lg: 48px 高度, 18px 字体

States:
  - default: 正常状态
  - hover: 边框色变化
  - focus: 2px focus ring, 边框色变化
  - disabled: opacity 0.5, cursor not-allowed
  - error: 边框色为 color-error
  - success: 边框色为 color-success

Tokens:
  - input-bg: color-bg-primary
  - input-border: color-border
  - input-border-radius: radius-md
  - input-padding-x: space-3
  - input-padding-y: space-2

Accessibility:
  - 必须有 label（显式或 aria-label）
  - Focus ring 可见
  - 错误消息关联 aria-describedby
  - required 使用 aria-required
```

### Card 组件规范

```yaml
Component: Card
Description: 内容容器卡片

Variants:
  - default: 标准卡片
  - interactive: 可点击卡片
  - elevated: 带阴影卡片
  - outlined: 幗框卡片

Parts:
  - header: 卡片标题区域
  - body: 卡片内容区域
  - footer: 卡片操作区域

Tokens:
  - card-bg: color-surface-card
  - card-border-radius: radius-lg
  - card-padding: space-6
  - card-shadow: shadow-md（elevated 变体）

Accessibility:
  - 交互卡片需要 cursor-pointer
  - 交互卡片需要 focus ring
  - 交互卡片需要 aria-role="button"
```

## 交互指南

### 响应式设计

#### 断点定义
| 断点 | 宽度 | 用途 |
|------|------|------|
| xs | < 375px | 超小屏 |
| sm | 375px | 小屏手机 |
| md | 768px | 平板 |
| lg | 1024px | 笔记本 |
| xl | 1440px | 桌面 |
| 2xl | > 1920px | 大屏 |

#### 响应式策略
- **Mobile First**：从小屏开始设计，逐步扩展到大屏
- **内容优先**：核心内容在所有断点可见
- **渐进增强**：大屏增加更多功能，小屏保持核心功能

### 触摸交互

#### 触摸目标要求
| 平台 | 最小尺寸 |
|------|----------|
| Web | 44x44px |
| iOS | 44x44pt |
| Android | 48x48dp |

#### 手势模式
| 手势 | 用途 |
|------|------|
| Tap | 选择、激活 |
| Long Press | 显示选项菜单 |
| Swipe | 导航、删除 |
| Pinch | 缩放 |
| Drag | 移动、排序 |

### 动画与过渡

#### 过渡时长
| 类型 | 时长 |
|------|------|
| 微交互 | 150-200ms |
| 状态变化 | 200-300ms |
| 页面过渡 | 300-500ms |
| 复杂动画 | 500-800ms |

#### 过渡属性
- 使用 `transform` 和 `opacity`（性能最佳）
- 避免过渡 `width`, `height`, `top`, `left`
- 使用 `transition-timing-function: ease-out` 或 `ease-in-out`

#### 无障碍动画
- 检查 `prefers-reduced-motion` 媒体查询
- 减少动画或完全禁用动画
- 确保动画可暂停

## 边界条件

### 文本边界
| 场景 | 处理方式 |
|------|----------|
| 长文本 | 截断 + 省略号，或换行 |
| 空文本 | 显示占位符或默认值 |
| 特殊字符 | 过滤或转义 |

### 数据边界
| 场景 | 处理方式 |
|------|----------|
| 无数据 | 显示 Empty State |
| 大量数据 | 分页或虚拟滚动 |
| 加载中 | 显示 Loading State |
| 加载失败 | 显示 Error State |

### 输入边界
| 场景 | 处理方式 |
|------|----------|
| 无效输入 | 即时验证 + 错误提示 |
| 超出范围 | Clamp 到有效范围 |
| 必填字段 | 标记 required + 验证 |

## 异常与降级

### 状态设计

#### Loading State
- Skeleton Screen（骨架屏）优先
- Spinner 用于短时加载
- Progress Bar 用于可预估进度
- 显示加载文案（如"正在加载..."）

#### Error State
- 清晰说明错误原因
- 提供解决方案或建议
- 提供恢复操作（重试、返回）
- 保留用户已输入数据

#### Empty State
- 清晰说明无数据原因
- 提供引导操作（添加数据）
- 使用友好的视觉设计
- 避免技术术语

#### Offline State
- 检测网络状态
- 显示离线提示
- 保留本地数据
- 提供重连操作

### 降级策略

| 场景 | 降级方案 |
|------|----------|
| 图片加载失败 | 显示占位图或 alt 文本 |
| 字体加载失败 | 使用系统字体 fallback |
| 动画不支持 | 禁用动画，静态过渡 |
| JavaScript 失败 | 提供 SSR 或静态版本 |

## 可访问性 / 可用性

### WCAG 2.1 AA 合规清单

#### 可感知（Perceivable）
- [ ] 所有非文本内容有替代文本
- [ ] 媒体有替代方案
- [ ] 内容可适应不同呈现方式
- [ ] 内容易于区分（前景与背景）

#### 可操作（Operable）
- [ ] 所有功能可通过键盘操作
- [ ] 用户有足够时间阅读和使用内容
- [ ] 内容不导致癫痫发作
- [ ] 提供导航和定位方式
- [ ] 支持多种输入方式

#### 可理解（Understandable）
- [ ] 文本可读可理解
- [ ] 内容以可预测方式呈现和操作
- [ ] 帮助用户避免和纠正错误

#### 坚固（Robust）
- [ ] 内容兼容各种用户代理
- [ ] 内容使用标准标记语言

### 屏幕阅读器支持

| 元素 | 要求 |
|------|------|
| 图片 | 有意义的 alt 文本，装饰性图片空 alt |
| 链接 | 链接文本描述目标 |
| 按钮 | 按钮文本描述操作，icon 按钮用 aria-label |
| 表单 | label 关联 input，错误消息用 aria-describedby |
| 表格 | 使用正确的 table 标记 |
| 列表 | 使用正确的 list 标记 |

### 键盘导航支持

| 操作 | 键盘快捷键 |
|------|------------|
| 导航 | Tab / Shift+Tab |
| 激活 | Enter / Space |
| 关闭 | Esc |
| 选择 | Arrow keys |
| 搜索 | Ctrl+F / Cmd+F |

### Focus 管理

- Focus 顺序匹配视觉顺序
- Focus 指示器清晰可见
- Modal 打开时 Focus 移入
- Modal 关闭时 Focus 返回触发元素
- 无 Focus 陷阱