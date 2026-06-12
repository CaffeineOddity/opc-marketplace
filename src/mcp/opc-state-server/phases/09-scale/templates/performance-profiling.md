# Performance Profiling — <feature-name>

> Phase: 09-scale • Node: performance-profiling
> 模板：USE 模型分类瓶颈；baseline 实测值持久化以便对比优化前后。

## 1. Baseline

- **采集日期**：YYYY-MM-DD
- **采集环境**：production / staging
- **关键 SLI 实测**：

  | SLI | 当前值 | SLO 阈值 | 状态 |
  |---|---|---|---|
  | API p95 | <数字 ms> | <200 ms> | <绿 / 黄 / 红> |
  | API p99 | <数字 ms> | <500 ms> | <颜色> |
  | 可用性 | <数字 %> | 99.9% | <颜色> |
  | error rate | <数字 %> | < 0.1% | <颜色> |

## 2. CPU Profiling

- **工具**：<pprof / async-profiler / node --prof>
- **样本时长**：<10 min>
- **火焰图链接**：<URL>
- **Top 5 热点函数**：

  | 函数 | self% | total% | 假设原因 |
  |---|---|---|---|
  | <func A> | 12% | 35% | <推测> |

## 3. 内存 Profiling

- **工具**：<heapdump / pprof heap>
- **总堆大小**：<数字>
- **疑似 leak**：<列表 + 保留路径>

## 4. I/O & 网络

- **磁盘 IOPS**：<读 / 写>
- **网络吞吐**：<入 / 出>
- **连接池饱和度**：<%>

## 5. DB 查询计划

- **慢查询数量（>500ms）**：<数字>
- **典型样本**：

  ```sql
  -- 原始查询
  SELECT ... FROM ... WHERE ...
  -- EXPLAIN
  Seq Scan on big_table  (cost=... rows=...)
  ```

- **建议**：<加索引 / 改写 / 拆查询>

## 6. 瓶颈分类（USE 模型 + 影响面）

| ID | 维度 | 资源 | utilization | saturation | errors | 影响面 | 优先级 |
|---|---|---|---|---|---|---|---|
| B1 | CPU | api-server | 85% | high | 0 | 全站 | P0 |
| B2 | DB | primary | 60% | medium | 0 | 写路径 | P1 |

## 7. 处置建议（不在本节点实现）

| 瓶颈 | 处置方向 | 新建 sub-pipeline | 目标 phase |
|---|---|---|---|
| B1 | 优化算法 / 加缓存 | <ID> | 05-implement (refactor) |
| B2 | 读写分离 | <ID> | 09-scale (architecture-evolution) |

---
*下游节点：architecture-evolution 与 capacity-planning 强依赖本节点产物。本节点禁止直接写业务代码——finding 必须走新建 sub-pipeline 回 05-implement。*
