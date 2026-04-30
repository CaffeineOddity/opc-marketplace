# design-kit

设计阶段插件 —— 一人公司的 UX 设计、UI 设计、设计系统和用户研究。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/ui-design` | UI/UX 设计规范 |
| `/ui-ux-pro-max` | 设计系统生成器，50+ 风格、97 色板、57 字体配对 |
| `/baoyu-imagine` | AI 图像生成（OpenAI、Azure、Google、OpenRouter、DashScope、Replicate） |

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

### AI 图像生成

```shell
/baoyu-imagine <提示词>
```

多后端 AI 图像生成：
- OpenAI GPT Image
- Azure OpenAI
- Google (Gemini)
- OpenRouter
- DashScope (阿里云)
- Z.AI GLM-Image
- MiniMax
- Jimeng (即梦)
- Seedream
- Replicate

选项：
- `--aspect <比例>` — 宽高比（1:1、16:9、9:16 等）
- `--ref <文件>` — 参考图片用于风格引导
- `--batch` — 批量并行生成

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

## 设计系统结构

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
