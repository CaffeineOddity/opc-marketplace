# qa-kit

质量保障插件 —— 一人公司的测试计划、Bug 报告、E2E 测试和无障碍审计。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/test-plan` | 测试计划生成 |
| `/bug-report` | 结构化 Bug 报告 |
| `/e2e-test` | Playwright / Cypress E2E 测试模式 |
| `/wcag-audit` | WCAG 2.2 无障碍审计 |
| `/webapp-testing` | Playwright Web 应用测试工具包 |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| qa-agent | sonnet | QA 测试代理 —— 测试计划、缺陷管理、质量门禁 |
| accessibility-expert | inherit | WCAG 合规、辅助技术、无障碍测试 |

## 快速开始

### 测试计划

```shell
/test-plan <功能>
```

生成：
- 测试范围和目标
- 测试用例（正向、负向、边缘）
- 测试数据需求
- 进入/退出标准

### Bug 报告

```shell
/bug-report
```

结构化报告：
- 复现步骤
- 预期 vs 实际行为
- 严重程度和优先级
- 环境详情
- 截图/日志

### E2E 测试

```shell
/e2e-test <场景>
```

生成 Playwright/Cypress 测试：
- 页面对象模型
- 测试场景
- 断言
- 设置/清理

### WCAG 审计

```shell
/wcag-audit <URL 或组件>
```

对照 WCAG 2.2 审计：
- 可感知（替代文本、对比度、字幕）
- 可操作（键盘、时间、导航）
- 可理解（可读、可预测、输入帮助）
- 健壮（兼容、解析）

## 工作流集成

```
dev-kit (实现) → qa-kit (测试) → ship-kit (部署)
```

### 测试优先流程 (配合 TDD)

```
/test-plan → /test-driven-development (dev-kit) → /verification-before-completion
```

### Bug 修复流程

```
/bug-report → /systematic-debugging (dev-kit) → /e2e-test → /verification-before-completion
```

### 无障碍流程

```
/wcag-audit → accessibility-expert → frontend-agent (修复) → /wcag-audit (验证)
```
