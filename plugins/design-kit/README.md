# design-kit

> [中文](#中文) | **English**

Design stage plugin — UX design, UI design, design systems, and user research for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/ui-design` | UI/UX design specification |
| `/ui-ux-pro-max` | Design system generator with 50+ styles, 97 color palettes, 57 font pairings |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| ux-agent | sonnet | Information architecture, user flows, wireframes, interaction logic |
| ui-agent | sonnet | Visual design, design systems, component specs, design tokens |
| ui-ux-designer | sonnet | Full-stack UI/UX designer reference |
| design-system-architect | inherit | Design system architecture, token systems, component libraries |
| ux-researcher | inherit | User research, interviews, usability testing, persona development |

## Quick Start

### UI Design

```shell
/ui-design <component or feature>
```

Generates:
- Component structure
- Visual hierarchy
- Interaction patterns
- Responsive behavior

### UI-UX-Pro-Max

```shell
/ui-ux-pro-max
```

Generates complete design system:
- 50+ visual styles
- 97 color palettes
- 57 font pairings
- Design tokens
- Component specifications

## Agent Usage

### ux-agent

Use for:
- Information architecture
- User flow diagrams
- Wireframe creation
- Interaction design
- Navigation structure

**Delivers to:** ui-agent (visual specs), frontend-agent (interaction logic)

### ui-agent

Use for:
- Visual design
- Component specifications
- Design tokens
- Style guides
- Responsive layouts

**Delivers to:** frontend-agent (implementation specs)

### design-system-architect

Use for:
- Design token architecture
- Component library structure
- Theming system
- Multi-brand support

### ux-researcher

Use for:
- User interviews
- Usability testing
- Persona development
- Journey mapping
- A/B test design

## Workflow Integration

```
product-kit (requirements) → design-kit (design) → dev-kit (implementation)
```

### Design Handoff

```
ux-agent → ui-agent → frontend-agent
    │          │           │
    │          │           └── Implement components
    │          └── Visual specs, tokens
    └── User flows, wireframes
```

## Design System Structure

```
design-system/
├── tokens/
│   ├── colors.json
│   ├── typography.json
│   ├── spacing.json
│   └── shadows.json
├── components/
│   ├── button.json
│   ├── input.json
│   └── card.json
└── themes/
    ├── light.json
    └── dark.json
```

---

## 中文

设计阶段插件 —— 一人公司的 UX 设计、UI 设计、设计系统和用户研究。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/ui-design` | UI/UX 设计规范 |
| `/ui-ux-pro-max` | 设计系统生成器，50+ 风格、97 色板、57 字体配对 |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| ux-agent | sonnet | 信息架构、用户流程、线框图、交互逻辑 |
| ui-agent | sonnet | 视觉设计、设计系统、组件规范、设计令牌 |
| ui-ux-designer | sonnet | 全栈 UI/UX 设计参考 |
| design-system-architect | inherit | 设计系统架构、令牌系统、组件库 |
| ux-researcher | inherit | 用户研究、访谈、可用性测试、人物画像 |

## 快速开始

### UI 设计

```shell
/ui-design <组件或功能>
```

生成：
- 组件结构
- 视觉层次
- 交互模式
- 响应式行为

### UI-UX-Pro-Max

```shell
/ui-ux-pro-max
```

生成完整设计系统：
- 50+ 视觉风格
- 97 色彩方案
- 57 字体配对
- 设计令牌
- 组件规范

## 工作流集成

```
product-kit (需求) → design-kit (设计) → dev-kit (实现)
```

### 设计交接

```
ux-agent → ui-agent → frontend-agent
    │          │           │
    │          │           └── 实现组件
    │          └── 视觉规范、令牌
    └── 用户流程、线框图
```
