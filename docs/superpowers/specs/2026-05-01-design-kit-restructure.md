# design-kit 重构设计文档

## 概述

将 design-kit 重构为 4 个核心 Agent，支持 Web、Mobile、品牌设计全流程，并提供独立的设计评审能力。

---

## 架构设计

### Agent 架构

```
design-kit/
├── agents/                        # 4 个核心 Agent
│   ├── brand-agent.md             # 品牌设计
│   ├── web-agent.md               # Web 平台设计
│   ├── mobile-agent.md            # Mobile 平台设计
│   └── design-reviewer.md         # 设计评审
│
├── references/                    # 设计规范文档（原 agent 转换）
│   ├── ux-design-guide.md         # UX 设计规范
│   ├── ui-design-guide.md         # UI 设计规范
│   ├── design-system-guide.md     # 设计系统规范
│   ├── ux-research-guide.md       # 用户研究规范
│   ├── brand-design-guide.md      # 品牌设计规范
│   ├── design-review-checklist.md # 设计评审清单
│   ├── wcag-guidelines.md         # 无障碍标准
│   ├── web-design-patterns.md     # Web 设计模式
│   └── mobile-design-patterns.md  # Mobile 设计模式
│
└── skills/
    ├── ui-design/
    ├── ui-ux-pro-max/
    └── baoyu-imagine/
```

### 原 Agent 处理

| 原 Agent | 处理方式 |
|----------|----------|
| ux-agent | 转为 `references/ux-design-guide.md` |
| ui-agent | 转为 `references/ui-design-guide.md` |
| design-system-architect | 转为 `references/design-system-guide.md` |
| ux-researcher | 转为 `references/ux-research-guide.md` |
| ui-ux-designer | 内容分散到 web-agent 和 mobile-agent |

---

## Agent 定义

### 1. brand-agent

**职责**：品牌视觉系统设计

**核心能力**：
- 品牌策略（定位、调性、差异化）
- 视觉识别（Logo、色彩、字体）
- 品牌规范文档
- 多产品品牌一致性管理

**输出**：
- 品牌策略文档
- 视觉识别系统
- 品牌规范（Brand Guidelines）
- Logo 概念图（调用 baoyu-imagine）

**调用时机**：
- 新产品/项目品牌建立
- 品牌重塑/升级
- 多产品品牌一致性检查

---

### 2. web-agent

**职责**：Web 平台设计全流程

**核心能力**：
- 响应式设计（375px → 1440px+）
- 信息架构、用户流程
- 视觉设计、组件规范
- 前端技术栈：React、Vue、Next.js、Svelte、Tailwind
- 无障碍设计（WCAG）
- SEO 友好设计

**输出**：
- 设计规范文档
- 组件设计规范
- 设计令牌
- 前端实现建议

**调用时机**：
- Web 页面设计
- Landing Page 设计
- Dashboard 设计
- 响应式 Web 应用

---

### 3. mobile-agent

**职责**：Mobile 平台设计全流程

**核心能力**：
- **原生平台**：iOS (SwiftUI)、Android (Jetpack Compose)
- **跨平台**：React Native、Flutter
- 触摸交互、手势设计
- 平台设计规范（HIG、Material Design）
- 安全区域、状态栏处理
- 移动端性能优化设计
- 离线体验设计

**输出**：
- 移动端设计规范
- 平台适配组件规范
- 手势交互规范
- 平台特定实现建议

**调用时机**：
- iOS/Android 原生 App 设计
- React Native / Flutter 跨平台设计
- 移动端交互设计

---

### 4. design-reviewer

**职责**：设计评审与验收

**核心能力**：
- 设计一致性检查
- 无障碍合规检查（WCAG）
- 品牌合规检查
- 用户体验评估
- 设计系统一致性
- 输出评审报告和修复建议

**输出**：
- 评审报告
- 问题清单（按严重程度分级）
- 修复建议
- 合规性认证

**调用时机**：
- 设计完成后验收
- 设计迭代后检查
- 上线前设计审计

---

## 协同工作流

### 工作流 1：新产品完整设计

```
┌─────────────────┐
│   brand-agent   │  Step 1: 品牌定义
│   (品牌设计)     │  - 品牌策略
└─────────────────┘  - 视觉识别
        │            - 品牌规范
        ▼
┌─────────────────┐
│   web-agent     │  Step 2a: Web 设计
│   (Web 设计)    │  - 引用品牌规范
└─────────────────┘  - 输出 Web 设计
        │
        ▼
┌─────────────────┐
│ design-reviewer │  Step 3: 设计评审
│   (设计评审)     │  - 检查一致性、合规性
└─────────────────┘  - 输出评审报告
        │
        ▼
┌─────────────────┐
│    dev-kit      │  Step 4: 开发实现
│   (开发实现)     │
└─────────────────┘
```

### 工作流 2：仅 Web 设计（品牌已存在）

```
┌─────────────────┐
│   web-agent     │  Step 1: Web 设计
│   (Web 设计)    │  - 引用现有品牌规范
└─────────────────┘  - 输出设计
        │
        ▼
┌─────────────────┐
│ design-reviewer │  Step 2: 设计评审
│   (设计评审)     │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│    dev-kit      │  Step 3: 开发实现
└─────────────────┘
```

### 工作流 3：Mobile 设计

```
┌─────────────────┐
│  mobile-agent   │  Step 1: Mobile 设计
│  (Mobile 设计)  │  - 引用品牌规范
└─────────────────┘  - 平台适配
        │
        ▼
┌─────────────────┐
│ design-reviewer │  Step 2: 设计评审
│   (设计评审)     │  - 平台规范检查
└─────────────────┘
        │
        ▼
┌─────────────────┐
│    dev-kit      │  Step 3: 开发实现
└─────────────────┘
```

### 工作流 4：多平台并行设计

```
        ┌─────────────────┐
        │   brand-agent   │  Step 1: 品牌定义
        └─────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│   web-agent   │ │ mobile-agent  │  Step 2: 并行设计
└───────────────┘ └───────────────┘
        │               │
        └───────┬───────┘
                ▼
        ┌───────────────┐
        │design-reviewer│  Step 3: 统一评审
        └───────────────┘  - 检查跨平台一致性
                │
                ▼
        ┌───────────────┐
        │    dev-kit    │  Step 4: 开发实现
        └───────────────┘
```

---

## Agent 路由规则

### 自动路由关键词

| Agent | 触发关键词 |
|-------|-----------|
| **brand-agent** | 品牌、brand、logo、品牌设计、视觉识别、VI |
| **web-agent** | web、网页、网站、dashboard、landing page、响应式、前端 |
| **mobile-agent** | mobile、app、iOS、Android、SwiftUI、Flutter、React Native、移动端 |
| **design-reviewer** | 评审、review、验收、检查、audit、合规 |

### 未明确平台时的处理

```
用户请求未明确平台
    │
    ▼
询问用户：
  "请问是为哪个平台设计？"
  1. Web 网页
  2. Mobile App (iOS/Android)
  3. 两者都需要
```

---

## 与 opc-founder 的集成

### opc-founder 协同调用

```markdown
## design-kit 集成

### 可用 Agent

| Agent | 职责 | 调用时机 |
|-------|------|----------|
| brand-agent | 品牌设计 | 产品初期品牌建立 |
| web-agent | Web 设计 | Web 平台设计需求 |
| mobile-agent | Mobile 设计 | 移动端设计需求 |
| design-reviewer | 设计评审 | 设计完成后验收 |

### 调用示例

**品牌设计**：
```
Agent(subagent_type="design-kit:brand-agent", prompt="为 SaaS 产品设计品牌")
```

**Web 设计**：
```
Agent(subagent_type="design-kit:web-agent", prompt="设计 Dashboard 页面")
```

**Mobile 设计**：
```
Agent(subagent_type="design-kit:mobile-agent", prompt="设计 iOS 端个人中心页面")
```

**设计评审**：
```
Agent(subagent_type="design-kit:design-reviewer", prompt="评审 Landing Page 设计")
```

### 工作流编排

1. **新产品**：brand-agent → web-agent/mobile-agent → design-reviewer → dev-kit
2. **仅 Web**：web-agent → design-reviewer → dev-kit
3. **仅 Mobile**：mobile-agent → design-reviewer → dev-kit
4. **多平台**：brand-agent → web-agent + mobile-agent (并行) → design-reviewer → dev-kit
```

---

## plugin.json 更新

```json
{
  "name": "design-kit",
  "description": "Design stage — brand-agent, web-agent, mobile-agent, design-reviewer + ui-design, ui-ux-pro-max, baoyu-imagine skills",
  "version": "2.0.0",
  "agents": [
    "brand-agent",
    "web-agent",
    "mobile-agent",
    "design-reviewer"
  ],
  "skills": [
    "ui-design",
    "ui-ux-pro-max",
    "baoyu-imagine"
  ]
}
```

---

## 实施计划

### Phase 1: 创建新 Agent
1. 创建 `brand-agent.md`
2. 创建 `web-agent.md`
3. 创建 `mobile-agent.md`
4. 创建 `design-reviewer.md`

### Phase 2: 转换原 Agent 为 Reference
1. `ux-agent.md` → `references/ux-design-guide.md`
2. `ui-agent.md` → `references/ui-design-guide.md`
3. `design-system-architect.md` → `references/design-system-guide.md`
4. `ux-researcher.md` → `references/ux-research-guide.md`
5. `ui-ux-designer.md` → 内容分散到 web-agent 和 mobile-agent

### Phase 3: 创建新 Reference
1. `brand-design-guide.md`
2. `design-review-checklist.md`
3. `wcag-guidelines.md`
4. `web-design-patterns.md`
5. `mobile-design-patterns.md`

### Phase 4: 更新配置
1. 更新 `plugin.json`
2. 更新 `README.md`
3. 更新 `opc-founder` 集成文档

---

## 验收标准

- [ ] 4 个 Agent 可独立调用
- [ ] Agent 能正确引用 Reference 规范
- [ ] 协同工作流正常运作
- [ ] opc-founder 能正确调度 design-kit agents
- [ ] 原 agent 文件已转换为 reference
- [ ] 文档更新完成
