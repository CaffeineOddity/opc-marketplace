# Quality Gate Verdict — <feature-name>

> Phase: 06-testing • Node: quality-gate
> 模板：四维矩阵全 PASS → 进入 07-release；任一 BLOCK → 触发 phase_reset 回 05-implement。

## 1. 判定结论

**Verdict**: `[ PASS | BLOCK ]`

**Date**: YYYY-MM-DD

**Verifier**: <人名>

## 2. 四维矩阵

| 维度 | 实测 | 阈值 | 状态 |
|---|---|---|---|
| 集成/E2E | <如：126/130 通过；覆盖率 78%> | 全绿 + 覆盖率 ≥ 70% | ✅ PASS |
| 安全扫描 | <如：critical 0 / high 0 / medium 3> | critical+high = 0 | ✅ PASS |
| 性能基线 | <如：p95 180ms / LCP 2.1s> | p95 < 200ms / LCP < 2.5s | ✅ PASS |
| 架构合规 | <如：无高危违反> | 无 high-severity 违反 | ✅ PASS |

## 3. 引用产物

- 测试报告：[`test-report`](./test-report.md)
- 安全扫描：[`security-scan`](./security-scan.md)
- 性能基线数据：<链接 / 路径>

## 4. BLOCK 时的责任节点（仅 BLOCK 时填写）

- **责任节点**：<如 `05-implement/tdd-implementation`>
- **重做指令**：<具体修复方向>
- **触发动作**：`opc_node_finish({status:'failed'})` → 自动 phase_reset 回 05-implement L1

## 5. medium / low 风险登记（即使 PASS 也填）

| 项 | 维度 | 处理时机 |
|---|---|---|
| <如 medium SCA finding> | 安全 | 下一迭代 |

## 6. 用户介入豁免（如有）

- 若用户介入 `accept_risk` 跳过某维度，必须在此节记录：豁免人、豁免理由、回避路径。

---
*下游：PASS → 触发 `opc_phase_complete` 进入 07-release；BLOCK → 阻断 phase 推进。*
