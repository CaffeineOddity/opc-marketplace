# design-kit

设计阶段插件 —— 一人公司的品牌设计、Web 设计、Mobile 设计和设计评审。

## 版本 2.0.0

重构为 4 个核心 Agent + 6 个 Reference 规范文档。

## Agents

| Agent | 描述 | 调用时机 |
|-------|------|----------|
| **brand-agent** | 品牌设计 — 品牌策略、视觉识别、Logo、品牌规范 | 新产品品牌建立 |
| **web-agent** | Web 设计 — 响应式设计、Dashboard、Landing Page | Web 平台设计 |
| **mobile-agent** | Mobile 设计 — iOS、Android、React Native、Flutter | 移动端设计 |
| **design-reviewer** | 设计评审 — 一致性检查、无障碍合规、品牌合规 | 设计完成后验收 |

## Skills

| 技能 | 描述 |
|------|------|
| `/ui-design` | UI/UX 设计规范生成 |
| `/ui-ux-pro-max` | 设计系统生成器，50+ 风格、97 色板、57 字体配对 |
| `/baoyu-imagine` | AI 图像生成（OpenAI、Azure、Google、DashScope、Replicate 等） |

## References（设计规范文档）

| 规范文档 | 描述 |
|----------|------|
| `ux-design-guide.md` | UX 设计原则、用户流程、线框图、可用性启发式 |
| `ui-design-guide.md` | UI 设计原则、设计令牌、色彩系统、字体排版 |
| `design-system-guide.md` | 设计系统架构、令牌分类、组件库、主题系统 |
| `ux-research-guide.md` | 用户研究方法、可用性测试、访谈、旅程地图 |
| `brand-design-guide.md` | 品牌设计流程、视觉识别、品牌规范 |
| `design-review-checklist.md` | 设计评审清单、无障碍检查、品牌合规 |

## 工作流

### 新产品完整设计
```
brand-agent → web-agent / mobile-agent → design-reviewer → dev-kit
    │              │              │
  品牌定义      平台设计        评审验收
```

### 仅 Web 设计
```
web-agent → design-reviewer → dev-kit
```

### 仅 Mobile 设计
```
mobile-agent → design-reviewer → dev-kit
```

### 多平台并行设计
```
brand-agent → web-agent + mobile-agent (并行) → design-reviewer → dev-kit
```

## 快速开始

### 品牌设计
```shell
# 调用 brand-agent
Agent(subagent_type="design-kit:brand-agent", prompt="为 SaaS 产品设计品牌")
```

### Web 设计
```shell
# 调用 web-agent
Agent(subagent_type="design-kit:web-agent", prompt="设计 Dashboard 页面")

# 或使用技能
/ui-ux-pro-max
python3 scripts/search.py "SaaS dashboard elegant" --design-system -p "MyProject"
```

### Mobile 设计
```shell
# 调用 mobile-agent
Agent(subagent_type="design-kit:mobile-agent", prompt="设计 iOS 端个人中心页面")
```

### 设计评审
```shell
# 调用 design-reviewer
Agent(subagent_type="design-kit:design-reviewer", prompt="评审 Landing Page 设计")
```

## Agent 协同

### 与 opc-founder 集成

opc-founder 可以调度 design-kit 的 agents：

```
opc-founder
    │
    ├── 品牌阶段 → brand-agent
    │
    ├── Web 设计 → web-agent
    │
    ├── Mobile 设计 → mobile-agent
    │
    └── 设计验收 → design-reviewer
```

### 调用示例

**新产品完整流程**：
```
1. brand-agent: "为 [产品名] 设计品牌"
2. web-agent: "设计 [产品名] 的 Web 端，引用品牌规范"
3. design-reviewer: "评审设计，检查品牌合规和无障碍"
4. dev-kit: "实现设计"
```

## 路由规则

| 关键词 | 路由到 |
|--------|--------|
| 品牌、brand、logo、VI | brand-agent |
| web、网页、网站、dashboard、landing | web-agent |
| mobile、app、iOS、Android、SwiftUI、Flutter | mobile-agent |
| 评审、review、验收、检查 | design-reviewer |

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

## 文件结构

```
plugins/design-kit/
├── plugin.json
├── README.md
├── README_CN.md
├── agents/
│   ├── brand-agent.md
│   ├── web-agent.md
│   ├── mobile-agent.md
│   └── design-reviewer.md
├── references/
│   ├── ux-design-guide.md
│   ├── ui-design-guide.md
│   ├── design-system-guide.md
│   ├── ux-research-guide.md
│   ├── brand-design-guide.md
│   └── design-review-checklist.md
└── skills/
    ├── ui-design/
    ├── ui-ux-pro-max/
    └── baoyu-imagine/
```

## 更新日志

### v2.0.0
- 重构为 4 个核心 Agent：brand-agent、web-agent、mobile-agent、design-reviewer
- 原 5 个 agent 转换为 reference 规范文档
- 新增 brand-design-guide.md 和 design-review-checklist.md
- 定义清晰的工作流和协同模式
- 支持 opc-founder 调度集成

### v1.x
- ui-agent、ux-agent、ui-ux-designer、design-system-architect、ux-researcher
- ui-design、ui-ux-pro-max、baoyu-imagine skills