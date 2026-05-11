---
name: 核心流程
description: 业务核心流程图与关键分支。
category: core_flows
feature_name: design-system
created_at: 2026-05-12T00:00:00.000Z
updated_at: 2026-05-12T00:00:00.000Z
tags: [core_flows, design-kit, workflow]
---
## 流程图

### 完整设计流程

```mermaid
flowchart TD
    Start([开始设计]) --> Input{设计类型?}
    
    Input -->|新产品| FullFlow[完整设计流程]
    Input -->|仅 Web| WebFlow[Web 设计流程]
    Input -->|仅 Mobile| MobileFlow[Mobile 设计流程]
    Input -->|多平台| ParallelFlow[并行设计流程]
    
    FullFlow --> Brand[brand-agent]
    Brand --> BrandStrategy[品牌策略]
    Brand --> VisualIdentity[视觉识别]
    Brand --> BrandGuidelines[品牌规范]
    
    BrandStrategy --> PlatformSelect{平台选择?}
    VisualIdentity --> PlatformSelect
    BrandGuidelines --> PlatformSelect
    
    PlatformSelect -->|Web| Web[web-agent]
    PlatformSelect -->|Mobile| Mobile[mobile-agent]
    PlatformSelect -->|两者| Both[Web + Mobile 并行]
    
    Web --> WebDesign[Web 设计]
    Mobile --> MobileDesign[Mobile 设计]
    Both --> WebDesign
    Both --> MobileDesign
    
    WebDesign --> Review[design-reviewer]
    MobileDesign --> Review
    
    Review --> ReviewResult{评审结果?}
    
    ReviewResult -->|通过| Handoff[交接 dev-kit]
    ReviewResult -->|需修改| WebDesign
    ReviewResult -->|需修改| MobileDesign
    
    Handoff --> End([完成])
    
    WebFlow --> WebDirect[web-agent]
    WebDirect --> WebDesignDirect[Web 设计]
    WebDesignDirect --> Review
    
    MobileFlow --> MobileDirect[mobile-agent]
    MobileDirect --> MobileDesignDirect[Mobile 设计]
    MobileDesignDirect --> Review
    
    ParallelFlow --> BrandParallel[brand-agent]
    BrandParallel --> WebParallel[web-agent]
    BrandParallel --> MobileParallel[mobile-agent]
    WebParallel --> WebDesignP[Web 设计]
    MobileParallel --> MobileDesignP[Mobile 设计]
    WebDesignP --> Review
    MobileDesignP --> Review
```

### brand-agent 设计流程

```mermaid
flowchart TD
    Start([开始品牌设计]) --> Discovery[Discovery 发现阶段]
    
    Discovery --> Understand[理解产品/服务本质]
    Discovery --> Audience[识别目标受众]
    Discovery --> Competitors[分析竞品]
    Discovery --> Goals[定义品牌目标]
    
    Understand --> Strategy[Strategy 策略阶段]
    Audience --> Strategy
    Competitors --> Strategy
    Goals --> Strategy
    
    Strategy --> Positioning[品牌定位声明]
    Strategy --> Personality[品牌个性 3-5 特质]
    Strategy --> Voice[品牌语调和调性]
    Strategy --> Messages[关键信息]
    
    Positioning --> Visual[Visual Identity 视觉识别]
    Personality --> Visual
    Voice --> Visual
    Messages --> Visual
    
    Visual --> Colors[色彩系统选项]
    Visual --> Typography[字体配对]
    Visual --> Logo[Logo 概念]
    Visual --> Style[视觉风格]
    
    Colors --> Guidelines[Guidelines 规范阶段]
    Typography --> Guidelines
    Logo --> Guidelines
    Style --> Guidelines
    
    Guidelines --> Usage[使用规则]
    Guidelines --> Specs[规格文档]
    Guidelines --> Examples[应用示例]
    Guidelines --> Assets[资产文件]
    
    Usage --> Output[品牌输出]
    Specs --> Output
    Examples --> Output
    Assets --> Output
    
    Output --> BrandAssets[品牌资产包]
    BrandAssets --> End([完成])
```

### web-agent 设计流程

```mermaid
flowchart TD
    Start([开始 Web 设计]) --> Input[接收需求文档]
    
    Input --> BrandRef{有品牌规范?}
    
    BrandRef -->|有| ApplyBrand[应用品牌规范]
    BrandRef -->|无| DefineTokens[定义设计令牌]
    
    ApplyBrand --> IA[信息架构]
    DefineTokens --> IA
    
    IA --> Structure[页面结构]
    IA --> Navigation[导航设计]
    IA --> Hierarchy[内容层级]
    
    Structure --> UX[用户体验设计]
    Navigation --> UX
    Hierarchy --> UX
    
    UX --> Flows[用户流程图]
    UX --> States[状态管理]
    UX --> Interactions[交互模式]
    UX --> MicroInteractions[微交互]
    
    Flows --> Visual[视觉设计]
    States --> Visual
    Interactions --> Visual
    MicroInteractions --> Visual
    
    Visual --> Layout[布局设计]
    Visual --> Grid[响应式网格]
    Visual --> ColorApply[色彩应用]
    Visual --> TypographyApply[字体应用]
    
    Layout --> Components[组件规格]
    Grid --> Components
    ColorApply --> Components
    TypographyApply --> Components
    
    Components --> Anatomy[组件结构]
    Components --> Variants[组件变体]
    Components --> Tokens[设计令牌]
    Components --> Responsive[响应式行为]
    Components --> Accessibility[无障碍要求]
    
    Anatomy --> Specs[设计规范文档]
    Variants --> Specs
    Tokens --> Specs
    Responsive --> Specs
    Accessibility --> Specs
    
    Specs --> Output[输出设计规范]
    Output --> End([完成])
```

### mobile-agent 设计流程

```mermaid
flowchart TD
    Start([开始 Mobile 设计]) --> Input[接收需求文档]
    
    Input --> Platform{目标平台?}
    
    Platform -->|iOS| iOSDesign[iOS 设计]
    Platform -->|Android| AndroidDesign[Android 设计]
    Platform -->|跨平台| CrossPlatform[跨平台设计]
    
    iOSDesign --> HIG[遵循 HIG]
    AndroidDesign --> Material[遵循 Material Design 3]
    CrossPlatform --> PlatformStrategy[平台策略]
    
    HIG --> BrandApply[应用品牌规范]
    Material --> BrandApply
    PlatformStrategy --> BrandApply
    
    BrandApply --> Touch[触摸与手势设计]
    
    Touch --> Targets[触摸目标 44x44pt]
    Touch --> Gestures[手势模式]
    Touch --> Haptic[触觉反馈]
    
    Targets --> UX[Mobile UX 模式]
    Gestures --> UX
    Haptic --> UX
    
    UX --> NavigationPattern{导航模式?}
    
    NavigationPattern -->|Tab Bar| TabBar[Tab Bar 导航]
    NavigationPattern -->|Drawer| Drawer[Navigation Drawer]
    NavigationPattern -->|Stack| Stack[Stack Navigation]
    
    TabBar --> Screens[屏幕设计]
    Drawer --> Screens
    Stack --> Screens
    
    Screens --> DeviceSizes[多设备尺寸]
    Screens --> Orientation[横屏方向]
    Screens --> SafeAreas[安全区域]
    
    DeviceSizes --> Components[组件规格]
    Orientation --> Components
    SafeAreas --> Components
    
    Components --> iOSComponents[iOS 组件]
    Components --> AndroidComponents[Android 组件]
    Components --> SharedComponents[共享组件]
    
    iOSComponents --> Specs[设计规范文档]
    AndroidComponents --> Specs
    SharedComponents --> Specs
    
    Specs --> Assets[资产导出 1x/2x/3x]
    Assets --> Output[输出设计规范]
    Output --> End([完成])
```

### design-reviewer 评审流程

```mermaid
flowchart TD
    Start([开始设计评审]) --> Context[收集上下文]
    
    Context --> Goals[理解设计目标]
    Context --> BrandGuidelines[品牌指南]
    Context --> Platform[目标平台]
    Context --> Focus[重点评审领域]
    
    Goals --> Systematic[系统化评审]
    BrandGuidelines --> Systematic
    Platform --> Systematic
    Focus --> Systematic
    
    Systematic --> VisualQuality[视觉质量评审]
    Systematic --> Accessibility[无障碍评审]
    Systematic --> BrandCompliance[品牌合规评审]
    Systematic --> UXCompleteness[UX 完整性评审]
    Systematic --> PlatformSpecific[平台特定评审]
    
    VisualQuality --> Icons[图标检查]
    VisualQuality --> HoverStates[Hover 状态]
    VisualQuality --> LightDark[Light/Dark 模式]
    VisualQuality --> Typography[字体一致性]
    
    Accessibility --> Contrast[色彩对比度]
    Accessibility --> Keyboard[键盘导航]
    Accessibility --> ScreenReader[屏幕阅读器]
    Accessibility --> TouchTargets[触摸目标]
    Accessibility --> Motion[动画无障碍]
    
    BrandCompliance --> LogoUsage[Logo 使用]
    BrandCompliance --> BrandColors[品牌色彩]
    BrandCompliance --> BrandTypography[品牌字体]
    BrandCompliance --> VisualStyle[视觉风格]
    
    UXCompleteness --> States[状态覆盖]
    UXCompleteness --> EdgeCases[边缘情况]
    UXCompleteness --> Navigation[导航清晰度]
    UXCompleteness --> Feedback[反馈机制]
    
    PlatformSpecific --> WebResponsive[Web 响应式]
    PlatformSpecific --> MobileHIG[Mobile HIG/Material]
    PlatformSpecific --> DeviceCoverage[设备覆盖]
    
    Icons --> Issues[问题文档]
    HoverStates --> Issues
    LightDark --> Issues
    Typography --> Issues
    Contrast --> Issues
    Keyboard --> Issues
    ScreenReader --> Issues
    TouchTargets --> Issues
    Motion --> Issues
    LogoUsage --> Issues
    BrandColors --> Issues
    BrandTypography --> Issues
    VisualStyle --> Issues
    States --> Issues
    EdgeCases --> Issues
    Navigation --> Issues
    Feedback --> Issues
    WebResponsive --> Issues
    MobileHIG --> Issues
    DeviceCoverage --> Issues
    
    Issues --> Severity{严重级别}
    
    Severity -->|Critical| Critical[Critical 问题]
    Severity -->|High| High[High 问题]
    Severity -->|Medium| Medium[Medium 问题]
    Severity -->|Low| Low[Low 问题]
    
    Critical --> Report[评审报告]
    High --> Report
    Medium --> Report
    Low --> Report
    
    Report --> Summary[摘要]
    Report --> Details[详细发现]
    Report --> Recommendations[修复建议]
    
    Summary --> Output[输出评审报告]
    Details --> Output
    Recommendations --> Output
    
    Output --> Result{评审结果?}
    
    Result -->|通过| Approved[批准实现]
    Result -->|需修改| FeedbackLoop[反馈修改]
    
    Approved --> End([完成])
    FeedbackLoop --> WebAgent[返回 web-agent]
    FeedbackLoop --> MobileAgent[返回 mobile-agent]
```

### Skills 使用流程

```mermaid
flowchart TD
    Start([开始 Skill 使用]) --> SkillSelect{选择 Skill?}
    
    SkillSelect -->|/ui-design| UIDesign[/ui-design skill]
    SkillSelect -->|/ui-ux-pro-max| UIUXProMax[/ui-ux-pro-max skill]
    SkillSelect -->|/baoyu-imagine| BaoyuImagine[/baoyu-imagine skill]
    
    UIDesign --> AnalyzeContext[分析上下文]
    AnalyzeContext --> IA[信息架构]
    IA --> Interaction[交互设计]
    Interaction --> Components[组件规格]
    Components --> Tokens[设计令牌]
    Tokens --> UISpecs[UI 设计规范]
    
    UIUXProMax --> AnalyzeQuery[分析查询]
    AnalyzeQuery --> DesignSystem[生成设计系统]
    DesignSystem --> Persist{持久化?}
    
    Persist -->|是| MasterFile[MASTER.md]
    Persist -->|否| DirectOutput[直接输出]
    
    MasterFile --> PageOverride{页面覆盖?}
    PageOverride -->|是| PageFile[pages/page.md]
    PageOverride -->|否| SystemOutput[设计系统输出]
    
    PageFile --> SystemOutput
    DirectOutput --> SystemOutput
    SystemOutput --> DSOutput[设计系统]
    
    BaoyuImagine --> ProviderSelect{选择提供商?}
    
    ProviderSelect -->|OpenAI| OpenAI[OpenAI DALL-E]
    ProviderSelect -->|Azure| Azure[Azure OpenAI]
    ProviderSelect -->|Google| Google[Google Imagen]
    ProviderSelect -->|DashScope| DashScope[通义万相]
    ProviderSelect -->|Replicate| Replicate[Replicate]
    
    OpenAI --> Generate[生成图像]
    Azure --> Generate
    Google --> Generate
    DashScope --> Generate
    Replicate --> Generate
    
    Generate --> ImageOutput[图像输出]
    
    UISpecs --> End([完成])
    DSOutput --> End
    ImageOutput --> End
```

## 关键分支与异常

### 品牌设计阶段异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 产品定位不明确 | 引导用户澄清产品本质和目标受众 |
| 品牌个性冲突 | 建议选择 3-5 个一致的特质 |
| Logo 生成失败 | 使用不同提供商或调整提示词 |
| 色彩系统不合适 | 提供替代色彩系统选项 |

### Web 设计阶段异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 无品牌规范 | 先调用 brand-agent 或定义临时设计令牌 |
| 响应式断点不合适 | 根据产品类型调整断点 |
| 无障碍合规失败 | 标记问题，提供修复建议 |
| 组件规格不完整 | 使用检查清单补充缺失项 |

### Mobile 设计阶段异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 平台选择不明确 | 引导用户选择 iOS/Android/跨平台 |
| 平台指南冲突 | 优先遵循目标平台指南 |
| 触摸目标过小 | 强制使用最小 44x44pt |
| 设备覆盖不全 | 补充小屏/大屏/平板设计 |

### 设计评审阶段异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| Critical 问题 | 必须修复后才能继续 |
| High 问题过多 | 建议分批修复 |
| 品牌合规失败 | 返回 brand-agent 重新定义 |
| 无障碍合规失败 | 提供具体修复方案 |

### Skills 使用异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| API 密钥缺失 | 引导用户配置 API 密钥 |
| 图像生成失败 | 使用替代提供商 |
| 设计系统不匹配 | 调整查询关键词 |
| 输出格式错误 | 自动修复格式 |

### Agent 协作异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| Agent 选择错误 | founder-agent 重新评估 |
| 交接失败 | 记录错误，重试交接 |
| 输出格式不兼容 | 自动转换格式 |
| 评审循环过多 | 建议人工介入 |