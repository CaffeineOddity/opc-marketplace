---
name: security-scan
tags: [security, auth]
description: 系统级安全扫描（SAST / SCA / secrets / 渗透测试）
agents:
  primary: [security-engineer]
  fallback: [penetration-tester]
input:
  - path: <unit>/<feature>/architecture
    type: knowledge
  - path: <unit>/<feature>/security-review
    type: knowledge
output:
  - path: <unit>/<feature>/security-scan
    type: knowledge
quality_gates:
  L1: [sast, sca, secrets-scan]
  L2: [no_high_findings]
always_show: false
---

## 安全扫描节点

系统级安全扫描，**包含渗透测试**。与 05-implement 的 `security-review`（代码级人工审查）互补。

### 何时被选中

- 任务 tags 包含 `auth` / `security` / `payment` / `pii`
- scenario = `security-audit`
- 05-implement 的 `security-review` 节点曾产出"遗留风险"

### 何时跳过

- 任务为纯内部 admin / 纯展示页面
- 用户介入显式 `skip_security_scan`（需记录原因）

### 执行步骤

1. **加载 review**：`opc_knowledge_get` 取 `<unit>/<feature>/security-review` 了解已审查范围。
2. **SAST**（静态应用安全测试）：Semgrep / CodeQL / SonarQube，扫描注入 / XSS / 反序列化 / 不安全反射。
3. **SCA**（软件成分分析）：依赖漏洞扫描（npm audit / pip-audit / Trivy），输出 CVE 列表 + 修复建议。
4. **Secrets 扫描**：gitleaks / trufflehog 全历史，不限于 HEAD。
5. **渗透测试**（可选，按 scenario）：黑盒 / 灰盒，对 API + 认证流做漏洞探测。
6. **写知识**：`<unit>/<feature>/security-scan` 记录每类扫描的 finding 列表（按 critical/high/medium/low 分级）+ 修复责任人。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | sast | 工具运行成功（不要求零 finding） |
| L1 | sca | 工具运行成功 |
| L1 | secrets-scan | 工具运行成功 |
| L2 | no_high_findings | critical + high 数 = 0；medium 进入 backlog |

### 与 phase 内节点的接口

- 与 `integration-test` 并行（互不依赖）
- 是 `quality-gate` 的前置（quality-gate 读取 security-scan 知识做发布判定）

### 不做的事

- 不做代码级修改（发现高危 → `opc_node_finish({status:'failed'})` 回到 05-implement）
- 不做合规审计（HIPAA/SOC2/PCI-DSS 归专项节点）
- 不替代 05-implement 的 `security-review`（本节点是工具扫描 + 渗透，那个是人工 code review）
