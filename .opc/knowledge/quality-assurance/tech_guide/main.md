---
name: 技术指南
description: 开发语言/框架确认、实现要点、关键决策与注意事项。
category: tech_guide
feature_name: quality-assurance
created_at: 2026-05-11T16:41:33.696Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide]
---
## 技术栈

### 测试框架

| 框架 | 语言 | 特点 |
|------|------|------|
| Playwright | TypeScript/JavaScript | 跨浏览器、现代 API、自动等待 |
| Cypress | JavaScript | 实时重载、时间旅行、调试友好 |
| jest-axe | JavaScript | React 无障碍测试集成 |
| axe-core | JavaScript | 通用无障碍检测引擎 |

### 无障碍工具

| 工具 | 类型 | 用途 |
|------|------|------|
| axe DevTools | 浏览器扩展 | 手动无障碍检查 |
| WAVE | 浏览器扩展 | 可视化无障碍问题 |
| Lighthouse | Chrome 工具 | 综合性能和无障碍审计 |
| Pa11y | CLI 工具 | 自动化无障碍扫描 |
| NVDA | 屏幕阅读器 | 真实用户体验测试 |
| VoiceOver | 屏幕阅读器 | macOS/iOS 测试 |

### 依赖

**核心依赖：**
- Claude Code SDK
- Playwright 测试框架
- axe-core 无障碍引擎

**工具依赖：**
- Node.js（测试运行环境）
- 浏览器驱动（Playwright 内置）

## 实现要点

### 1. 测试计划生成

```shell
/test-plan <feature>
```

生成内容：
- **测试范围**：功能范围、环境配置、依赖假设
- **测试分类**：功能测试、集成测试、非功能测试
- **测试用例**：ID、标题、前置条件、步骤、预期结果、优先级
- **优先级排序**：基于风险的优先级映射

测试用例格式：
```
ID: TC-001
Title: 用户登录成功场景
Preconditions: 用户已注册
Steps:
  1. 打开登录页面
  2. 输入有效用户名和密码
  3. 点击登录按钮
Expected Result: 成功跳转到首页
Priority: Critical
```

### 2. 缺陷报告生成

```shell
/bug-report
```

报告结构：
- **复现步骤**：详细操作步骤
- **预期结果**：应该发生什么
- **实际结果**：实际发生了什么
- **严重程度**：Critical / High / Medium / Low
- **优先级**：P1 / P2 / P3 / P4
- **环境信息**：浏览器、操作系统、版本
- **截图/日志**：问题证据

严重程度定义：
| 级别 | 定义 | 示例 |
|------|------|------|
| Critical | 系统崩溃、数据丢失 | 登录失败、支付异常 |
| High | 主要功能不可用 | 搜索无结果、表单提交失败 |
| Medium | 功能受限但有替代方案 | 排序错误、显示问题 |
| Low | 小问题、建议改进 | UI 错位、文案错误 |

### 3. E2E 测试生成

```shell
/e2e-test <scenario>
```

生成内容：
- Page Object Model 定义
- 测试场景代码
- 断言和验证
- 设置和清理逻辑

Playwright 测试示例：
```typescript
// Page Object Model
class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator('#username');
    this.passwordInput = page.locator('#password');
    this.loginButton = page.locator('button[type="submit"]');
  }

  async login(username, password) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}

// Test Case
test('user can login successfully', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await page.goto('/login');
  await loginPage.login('testuser', 'password123');
  await expect(page).toHaveURL('/dashboard');
});
```

### 4. WCAG 无障碍审计

```shell
/wcag-audit <url or component>
```

审计内容：
- **Perceivable（可感知）**：文本替代、时基媒体、适应性、可区分
- **Operable（可操作）**：键盘可访问、足够时间、癫痫预防、导航
- **Understandable（可理解）**：可读、可预测、输入辅助
- **Robust（兼容）**：兼容辅助技术

常见违规检测：
| 违规类型 | 影响 | 修复方法 |
|----------|------|----------|
| 缺少 alt 文本 | Critical | 添加描述性 alt |
| 低对比度 | Serious | 提高到 4.5:1 |
| 无键盘访问 | Critical | 添加 tabindex、事件处理 |
| 缺少表单标签 | Critical | 添加 label 元素 |

### 5. Web 应用测试工具包

```shell
/webapp-testing
```

提供内容：
- 测试生成模板
- 页面交互模式
- 断言最佳实践
- 调试技巧

## 关键决策

### D1: Playwright 作为首选 E2E 框架

**决策**：推荐使用 Playwright 进行 E2E 测试

**理由**：
- 跨浏览器支持（Chrome、Firefox、Safari）
- 自动等待机制，减少显式等待
- 现代异步 API，易于编写
- 内置截图和视频录制

### D2: WCAG AA 作为默认合规级别

**决策**：默认审计 WCAG 2.2 Level AA

**理由**：
- AA 是大多数法规的最低要求
- A 级别不足以保证可用性
- AAA 级别过于严格，成本高

### D3: 测试计划风险驱动

**决策**：测试用例优先级基于风险评估

**理由**：
- 一人公司资源有限
- 高风险功能优先测试
- 确保关键路径覆盖

### D4: 自动化 + 手动结合

**决策**：无障碍测试结合自动化和手动验证

**理由**：
- 自动化只能检测 30-50% 问题
- 真实用户体验需要手动测试
- 屏幕阅读器测试不可替代

## 注意事项

### 常见问题

1. **测试计划过于庞大**
   - 解决：聚焦高风险功能，使用烟雾测试
   - 原则：一人公司优先核心路径

2. **E2E 测试不稳定**
   - 解决：使用自动等待，避免固定等待时间
   - 原则：Playwright 自动等待机制

3. **无障碍审计误报**
   - 解决：结合手动验证，使用真实屏幕阅读器
   - 原则：工具辅助，人工确认

4. **缺陷报告信息不足**
   - 解决：提供详细复现步骤和截图
   - 原则：开发人员能独立复现

### 最佳实践

1. **测试计划**
   - 从用户故事出发
   - 覆盖正向和负向场景
   - 定义清晰的验收标准

2. **E2E 测试**
   - 使用 Page Object Model
   - 测试用户流程而非细节
   - 保持测试独立和可重复

3. **无障碍审计**
   - 语义化 HTML 优先
   - ARIA 作为补充而非替代
   - 测试真实辅助技术

4. **缺陷管理**
   - 及时报告，详细描述
   - 分类准确，优先级合理
   - 跟踪修复，验证闭环