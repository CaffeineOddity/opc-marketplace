---
name: security-review
tags: [security, auth]
description: 代码级安全审查（密码、token、注入、XSS）
agents:
  primary: [security-engineer]
  fallback: []
input:
  - path: <unit>/<feature>/api
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
output:
  - path: <unit>/<feature>/security-review
    type: knowledge
quality_gates:
  L1: [security-scan]
  L2: []
always_show: false
---

## 安全审查节点

对 05-implement 阶段产出的代码做代码级安全审查。**非渗透测试**（归 06-testing）。

### 何时被选中

- 任务 tags 包含 `auth` / `security`
- 任务涉及敏感数据（payment / pii / session）
- scenario = `security-audit`

### 执行步骤

1. **加载实现**：read `src/auth/` 或对应业务目录。
2. **审查清单**：
   - 密码：哈希算法 + cost；杜绝明文存储
   - Token：CSPRNG 来源；过期/刷新；HttpOnly+Secure cookie
   - SQL 注入：参数化查询 / ORM；禁字符串拼接
   - XSS：转义；CSP；DOM-based 检查
   - 输入校验：边界、长度、类型、注入字符
   - 错误信息：不泄漏内部细节
3. **写知识**：`<unit>/<feature>/security-review` 记录已通过的检查与遗留风险。
4. **L1 quality gate**：自动 `security-scan` 工具（SAST / SCA / secrets scanner）必须 PASS。

### 何时跳过

- 任务为非敏感 CRUD（如内部 admin 页面、纯展示）

### 不做的事

- 不做渗透测试（归 06-testing 的 `penetration-test` 节点）
- 不修代码（发现高危问题 → 调 `opc_node_finish({status:'failed'})` 让 tdd-implementation / auth-integration 重做）
- 不替代合规审计（HIPAA / SOC2 / PCI-DSS 等专项归 `compliance-audit` 节点）
