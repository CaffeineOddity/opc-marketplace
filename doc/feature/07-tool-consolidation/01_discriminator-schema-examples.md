# 01 — Discriminator Schema 完整示例

> 本章提供 24 个合并后工具的完整 JSON Schema 示例，展示每种 discriminator
> 值的 `oneOf` 分支写法。与 `00_overview.md` §2.1 映射表一一对应。

## 一、State-Server Flow（7 工具）

### 1.1 `opc_flow_query`（无 discriminator）

```typescript
{
  name: "opc_flow_query",
  description: "查询当前 pipeline 状态、next step、pending 项、suggested_actions。",
  input_schema: {
    type: "object",
    properties: {
      pipeline_id: { type: "string" },
      include_reflection_log: { type: "boolean", default: false }
    }
  }
}
```

### 1.2 `opc_flow_lifecycle` — `action` discriminator

```typescript
{
  name: "opc_flow_lifecycle",
  description: "管理 flow 生命周期。action=start 创建新 session；abort 中止当前流程；recover 接管孤儿 session。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: { enum: ["start", "abort", "recover"] }
    },
    oneOf: [
      {
        properties: {
          action: { const: "start" },
          user_intent: { type: "string" },
          complexity: { enum: ["simple", "medium", "high"] }
        },
        required: ["user_intent"]
      },
      {
        properties: {
          action: { const: "abort" },
          pipeline_id: { type: "string" },
          reason: { type: "string" }
        },
        required: ["pipeline_id"]
      },
      {
        properties: {
          action: { const: "recover" },
          orphan_session_id: { type: "string" },
          transport_proof: { type: "object" }
        },
        required: ["orphan_session_id"]
      }
    ]
  }
}
```

### 1.3 `opc_flow_step_complete` — `step` discriminator

```typescript
{
  name: "opc_flow_step_complete",
  description: "提交流程步骤产出。step=intent_analysis 收意图分类结果；task_analysis 收需求分析；task_decomposition 收分解方案；brief_generation 收 brief 内容。",
  input_schema: {
    type: "object",
    required: ["step"],
    properties: {
      step: { enum: ["intent_analysis", "task_analysis", "task_decomposition", "brief_generation"] }
    },
    oneOf: [
      {
        properties: {
          step: { const: "intent_analysis" },
          intent: { type: "object", required: ["classification", "reasoning"] },
          intent_evidence: { $ref: "#/$defs/EvidenceArtifact" },
          reasoning: { type: "string" }
        },
        required: ["intent", "intent_evidence"]
      },
      {
        properties: {
          step: { const: "task_analysis" },
          analysis_result: { type: "object", required: ["requirements", "dependencies", "risks"] },
          task_analysis_evidence: { $ref: "#/$defs/EvidenceArtifact" }
        },
        required: ["analysis_result", "task_analysis_evidence"]
      },
      {
        properties: {
          step: { const: "task_decomposition" },
          sub_pipelines: { type: "array", items: { $ref: "#/$defs/SubPipeline" } },
          execution_order: { type: "object" },
          decomposition_evidence: { $ref: "#/$defs/EvidenceArtifact" }
        },
        required: ["sub_pipelines", "decomposition_evidence"]
      },
      {
        properties: {
          step: { const: "brief_generation" },
          brief_content: { type: "string" },
          brief_evidence: { $ref: "#/$defs/EvidenceArtifact" }
        },
        required: ["brief_content", "brief_evidence"]
      }
    ]
  }
}
```

### 1.4 `opc_flow_reflect`（无 discriminator，锚点工具）

```typescript
{
  name: "opc_flow_reflect",
  description: "登记反思结果。reflection-registry-guard 的 must_be_registered_by 锚点。",
  input_schema: {
    type: "object",
    required: ["reflection_id"],
    properties: {
      reflection_id: { type: "string" },
      session_id: { type: "string" }
    }
  }
}
```

### 1.5 `opc_flow_user_reply`（无 discriminator，锚点工具）

```typescript
{
  name: "opc_flow_user_reply",
  description: "用户回复 pending question。A3 闭环的 must_be_resolved_by 锚点。",
  input_schema: {
    type: "object",
    required: ["question_id", "reply"],
    properties: {
      question_id: { type: "string" },
      reply: { type: "string" },
      session_id: { type: "string" }
    }
  }
}
```

### 1.6 `opc_quick_dispatch`（无 discriminator）

```typescript
{
  name: "opc_quick_dispatch",
  description: "快速派发（low 通道）。绕过完整 pipeline 的轻量工具调用。",
  input_schema: {
    type: "object",
    required: ["tool", "args"],
    properties: {
      tool: { type: "string" },
      args: { type: "object" }
    }
  }
}
```

### 1.7 `opc_flow_correct` — `action` discriminator

```typescript
{
  name: "opc_flow_correct",
  description: "纠正流程。action=revise 局部修正；restart 重新执行步骤；phase_reset 回退 phase（吸收旧 opc_flow_correct phase_reset 分支）。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: { enum: ["revise", "restart", "phase_reset"] }
    },
    oneOf: [
      {
        properties: {
          action: { const: "revise" },
          correction: { type: "string" },
          target_step: { type: "string" }
        },
        required: ["correction"]
      },
      {
        properties: {
          action: { const: "restart" },
          from_step: { type: "string" },
          additional_input: { type: "string" }
        },
        required: ["from_step"]
      },
      {
        properties: {
          action: { const: "phase_reset" },
          level: { enum: ["L0", "L1", "L2", "L3"] },
          reason: { type: "string" }
        },
        required: ["level"]
      }
    ]
  }
}
```

## 二、State-Server Pipeline（3 工具）

### 2.1 `opc_pipeline_create`（无 discriminator）

```typescript
{
  name: "opc_pipeline_create",
  description: "创建新 pipeline。接收 sub_pipelines 和 execution_order。",
  input_schema: {
    type: "object",
    required: ["sub_pipelines"],
    properties: {
      sub_pipelines: { type: "array", items: { $ref: "#/$defs/SubPipeline" } },
      execution_order: { type: "object" },
      complexity: { enum: ["simple", "medium", "high"] }
    }
  }
}
```

### 2.2 `opc_pipeline_status`（无 discriminator）

```typescript
{
  name: "opc_pipeline_status",
  description: "查询 pipeline 状态：进度、当前 phase、各 sub-pipeline 完成情况。",
  input_schema: {
    type: "object",
    properties: {
      pipeline_id: { type: "string" }
    }
  }
}
```

### 2.3 `opc_pipeline_lifecycle` — `action` discriminator

```typescript
{
  name: "opc_pipeline_lifecycle",
  description: "管理 pipeline 生命周期。action=complete 结束 pipeline；abort 中止；replan 重新规划；resume 恢复暂停的 pipeline。",
  input_schema: {
    type: "object",
    required: ["action", "pipeline_id"],
    properties: {
      action: { enum: ["complete", "abort", "replan", "resume"] },
      pipeline_id: { type: "string" }
    },
    oneOf: [
      {
        properties: {
          action: { const: "complete" }
        }
      },
      {
        properties: {
          action: { const: "abort" },
          reason: { type: "string" }
        },
        required: ["reason"]
      },
      {
        properties: {
          action: { const: "replan" },
          changes: { type: "object" }
        },
        required: ["changes"]
      },
      {
        properties: {
          action: { const: "resume" }
        }
      }
    ]
  }
}
```

## 三、State-Server Phase（3 工具）

### 3.1 `opc_phase_start`（无 discriminator）

```typescript
{
  name: "opc_phase_start",
  description: "开始新 phase。初始化 phase state，返回 phase 内首个 step。",
  input_schema: {
    type: "object",
    required: ["pipeline_id", "phase_id"],
    properties: {
      pipeline_id: { type: "string" },
      phase_id: { type: "string" }
    }
  }
}
```

### 3.2 `opc_phase_confirm`（无 discriminator，锚点工具）

```typescript
{
  name: "opc_phase_confirm",
  description: "确认节点选择方案。registry-guard 锚点（会拦截未登记的 pending_reflection）。",
  input_schema: {
    type: "object",
    required: ["pipeline_id", "selection_evidence"],
    properties: {
      pipeline_id: { type: "string" },
      selection_evidence: { $ref: "#/$defs/EvidenceArtifact" }
    }
  }
}
```

### 3.3 `opc_phase_complete`（无 discriminator，锚点工具）

```typescript
{
  name: "opc_phase_complete",
  description: "完成当前 phase。跑 quality_gate，返回是否推进。",
  input_schema: {
    type: "object",
    required: ["pipeline_id"],
    properties: {
      pipeline_id: { type: "string" },
      quality_gate_results: { type: "array" }
    }
  }
}
```

## 四、State-Server Node（2 工具）

### 4.1 `opc_node_start`（无 discriminator，锚点工具）

```typescript
{
  name: "opc_node_start",
  description: "开始执行节点。返回 dispatch_instruction（含 dispatch_context）。",
  input_schema: {
    type: "object",
    required: ["pipeline_id", "sub_pipeline_id", "node_name"],
    properties: {
      pipeline_id: { type: "string" },
      sub_pipeline_id: { type: "string" },
      node_name: { type: "string" }
    }
  }
}
```

### 4.2 `opc_node_finish` — `status` discriminator

```typescript
{
  name: "opc_node_finish",
  description: "结束节点执行。status=success 收 evidence 跑 L1+L2 校验；status=failed 收 error；status=retry 手动重跑。",
  input_schema: {
    type: "object",
    required: ["pipeline_id", "sub_pipeline_id", "node_name", "status"],
    properties: {
      pipeline_id: { type: "string" },
      sub_pipeline_id: { type: "string" },
      node_name: { type: "string" },
      status: { enum: ["success", "failed", "retry"] }
    },
    oneOf: [
      {
        properties: {
          status: { const: "success" },
          evidence: { $ref: "#/$defs/EvidenceArtifact" }
        },
        required: ["evidence"]
      },
      {
        properties: {
          status: { const: "failed" },
          error: {
            type: "object",
            required: ["message", "type"],
            properties: {
              message: { type: "string" },
              type: { type: "string" },
              stack: { type: "string" }
            }
          }
        },
        required: ["error"]
      },
      {
        properties: {
          status: { const: "retry" },
          reset_retry_count: { type: "boolean", default: true }
        }
      }
    ]
  }
}
```

## 五、Knowledge-Server（4 工具）

### 5.1 `opc_knowledge_open`（无 discriminator）

```typescript
{
  name: "opc_knowledge_open",
  description: "初始化 knowledge 库。若已存在则验证结构完整性，否则创建三层目录骨架。",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string" },
      force: { type: "boolean", default: false }
    }
  }
}
```

### 5.2 `opc_knowledge_read` — `mode` discriminator

```typescript
{
  name: "opc_knowledge_read",
  description: "读取 knowledge。mode=single 读单文件；batch 批量读取；list 列目录；search 全文搜索；diff 3-way 预演。",
  input_schema: {
    type: "object",
    required: ["mode"],
    properties: {
      mode: { enum: ["single", "batch", "list", "search", "diff"] }
    },
    oneOf: [
      {
        properties: {
          mode: { const: "single" },
          path: { type: "string" }
        },
        required: ["path"]
      },
      {
        properties: {
          mode: { const: "batch" },
          paths: { type: "array", items: { type: "string" } }
        },
        required: ["paths"]
      },
      {
        properties: {
          mode: { const: "list" },
          path: { type: "string", default: "/" },
          recursive: { type: "boolean", default: false }
        }
      },
      {
        properties: {
          mode: { const: "search" },
          query: { type: "string" },
          scope: { type: "string", default: "/" }
        },
        required: ["query"]
      },
      {
        properties: {
          mode: { const: "diff" },
          path: { type: "string" },
          base_version: { type: "integer" }
        },
        required: ["path", "base_version"]
      }
    ]
  }
}
```

### 5.3 `opc_knowledge_write`（无 discriminator）

```typescript
{
  name: "opc_knowledge_write",
  description: "写入 knowledge。支持 \`refs\` 参数写入 _refs 文件。传 \`base_version\` 触发 3-way diff-and-merge，返回 merge_status。",
  input_schema: {
    type: "object",
    required: ["path", "content"],
    properties: {
      path: { type: "string" },
      content: { type: "string" },
      refs: { type: "array", items: { type: "string" } },
      base_version: { type: "integer" },
      frontmatter: { type: "object" }
    }
  }
}
```

### 5.4 `opc_knowledge_admin` — `action` discriminator

```typescript
{
  name: "opc_knowledge_admin",
  description: "管理 knowledge。action=delete 删除并可选传 base_version 做版本校验；reindex 重建全文索引。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: { enum: ["delete", "reindex"] }
    },
    oneOf: [
      {
        properties: {
          action: { const: "delete" },
          path: { type: "string" },
          base_version: { type: "integer" }
        },
        required: ["path"]
      },
      {
        properties: {
          action: { const: "reindex" },
          scope: { type: "string", default: "/" }
        }
      }
    ]
  }
}
```

## 六、Reflection-Server（4 工具）

### 6.1 `opc_reflect_plan`（无 discriminator）

```typescript
{
  name: "opc_reflect_plan",
  description: "规划反思：输入 step + context，返回 method 选择 + 历史纠正 + agent_spec + max_rounds。",
  input_schema: {
    type: "object",
    required: ["step"],
    properties: {
      step: { enum: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
      context: { type: "object" },
      intensity: { enum: ["high", "medium", "low", "off"] }
    }
  }
}
```

### 6.2 `opc_reflect_execute` — `method` discriminator + `inline`

```typescript
{
  name: "opc_reflect_execute",
  description: "执行反思方法。method=M3-cove 拆断言逐条验证；M4-critique 派 critic 列 objection；M5-debate 多 agent 辩论；M6-tot 多分支搜索。inline=true 一次性跑完 plan+Task+complete，返回 pending_reflection。",
  input_schema: {
    type: "object",
    required: ["step", "method", "artifact"],
    properties: {
      step: { enum: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
      method: { enum: ["M3-cove", "M4-critique", "M5-debate", "M6-tot"] },
      artifact: { type: "object" },
      inline: { type: "boolean", default: true },
      enhanced_prompt: { type: "string" },
      prior_corrections: { type: "array" }
    },
    oneOf: [
      {
        properties: {
          method: { const: "M3-cove" },
          artifact: {
            type: "object",
            required: ["payload"],
            properties: { payload: { type: "object" } }
          }
        }
      },
      {
        properties: {
          method: { const: "M4-critique" },
          artifact: {
            type: "object",
            required: ["payload"],
            properties: {
              payload: { type: "object" },
              node_type: { type: "string" },
              phase: { type: "string" }
            }
          }
        }
      },
      {
        properties: {
          method: { const: "M5-debate" },
          artifact: { type: "object" },
          topic: { type: "string" },
          positions: { type: "array", items: { enum: ["pro", "con", "third_party"] } }
        },
        required: ["topic"]
      },
      {
        properties: {
          method: { const: "M6-tot" },
          artifact: { type: "object" },
          problem_statement: { type: "string" },
          max_depth: { type: "integer", default: 3 }
        },
        required: ["problem_statement"]
      }
    ]
  }
}
```

### 6.3 `opc_reflect_complete` — `method` discriminator

```typescript
{
  name: "opc_reflect_complete",
  description: "完成反思：收 sub-agent 结果，跑 meta-validator，写盘 artifact，发 pending_reflection。",
  input_schema: {
    type: "object",
    required: ["method", "reflection_id", "result"],
    properties: {
      method: { enum: ["M3-cove", "M4-critique", "M5-debate", "M6-tot"] },
      reflection_id: { type: "string" },
      result: { type: "object" }
    },
    oneOf: [
      {
        properties: {
          method: { const: "M3-cove" },
          result: {
            type: "object",
            required: ["claims"],
            properties: {
              claims: { type: "array" },
              revised_output: { type: "string" }
            }
          }
        }
      },
      {
        properties: {
          method: { const: "M4-critique" },
          result: {
            type: "object",
            required: ["objections"],
            properties: {
              objections: { type: "array" },
              reasoning_trace: { type: "array" }
            }
          }
        }
      },
      {
        properties: {
          method: { const: "M5-debate" },
          result: {
            type: "object",
            required: ["debate_synthesis"],
            properties: {
              debate_synthesis: { type: "object" }
            }
          }
        }
      },
      {
        properties: {
          method: { const: "M6-tot" },
          result: {
            type: "object",
            required: ["search_tree"],
            properties: {
              search_tree: { type: "object" },
              best_path: { type: "array" }
            }
          }
        }
      }
    ]
  }
}
```

### 6.4 `opc_reflect_admin` — `action` discriminator

```typescript
{
  name: "opc_reflect_admin",
  description: "反思管理。action=record_interventions 派 distiller 提炼 L1→L2；on_demand 事后反思；explain 查看 reasoning_trace；query_stats 查方法健康度；unlearn_method 临时禁用方法。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: { enum: ["record_interventions", "on_demand", "explain", "query_stats", "unlearn_method"] }
    },
    oneOf: [
      {
        properties: {
          action: { const: "record_interventions" },
          pipeline_id: { type: "string" }
        },
        required: ["pipeline_id"]
      },
      {
        properties: {
          action: { const: "on_demand" },
          target: {
            type: "object",
            required: ["pipeline_id", "step"],
            properties: {
              pipeline_id: { type: "string" },
              step: { type: "string" },
              method: { enum: ["M3-cove", "M4-critique", "M5-debate", "M6-tot"] }
            }
          }
        },
        required: ["target"]
      },
      {
        properties: {
          action: { const: "explain" },
          reflection_id: { type: "string" },
          include_superseded: { type: "boolean", default: false }
        },
        required: ["reflection_id"]
      },
      {
        properties: {
          action: { const: "query_stats" },
          method: { enum: ["M2-reflexion", "M3-cove", "M4-critique", "M5-debate", "M6-tot"] },
          window: { type: "string", default: "24h" }
        }
      },
      {
        properties: {
          action: { const: "unlearn_method" },
          method: { enum: ["M2-reflexion", "M3-cove", "M4-critique", "M5-debate", "M6-tot"] },
          undo: { type: "boolean", default: false }
        },
        required: ["method"]
      }
    ]
  }
}
```

## 七、Corrections（1 工具）

### 7.1 `opc_corrections` — `action` discriminator

```typescript
{
  name: "opc_corrections",
  description: "管理纠正库。action=query 按 step+keywords 查；record 写入新纠正；unlearn 删除过期纠正；reindex 重建索引；promote 晋升 L2→L3；migrate 升级 schema；endorse 认可；freeze/delete 管理条目。",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: { enum: ["query", "record", "unlearn", "reindex", "promote", "migrate", "endorse", "freeze", "delete"] }
    },
    oneOf: [
      {
        properties: {
          action: { const: "query" },
          step: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          include_frozen: { type: "boolean", default: false },
          include_l3: { type: "boolean", default: false },
          limit: { type: "integer", default: 5 }
        }
      },
      {
        properties: {
          action: { const: "record" },
          step: { type: "string" },
          unit: { type: "string" },
          section: { type: "string" },
          subsection: { type: "string" },
          title: { type: "string" },
          failure_pattern: { type: "string" },
          correction_advice: { type: "string" },
          reflection_snippet: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          type: { enum: ["correction", "lesson"] },
          merge_with: { type: "string" }
        },
        required: ["step", "unit", "section", "subsection", "title"]
      },
      {
        properties: {
          action: { const: "unlearn" },
          id: { type: "string" },
          reason: { type: "string" }
        },
        required: ["id"]
      },
      {
        properties: {
          action: { const: "reindex" }
        }
      },
      {
        properties: {
          action: { const: "promote" },
          id: { type: "string" },
          preview: { type: "boolean", default: false }
        },
        required: ["id"]
      },
      {
        properties: {
          action: { const: "migrate" },
          target_version: { type: "integer" }
        },
        required: ["target_version"]
      },
      {
        properties: {
          action: { const: "endorse" },
          id: { type: "string" }
        },
        required: ["id"]
      },
      {
        properties: {
          action: { const: "freeze" },
          id: { type: "string" }
        },
        required: ["id"]
      },
      {
        properties: {
          action: { const: "delete" },
          id: { type: "string" }
        },
        required: ["id"]
      }
    ]
  }
}
```

## 八、总结矩阵

| # | 工具 | Discriminator | 分支数 | 锚点 |
|---|---|---|---|---|
| 1 | `opc_flow_query` | — | 0 | — |
| 2 | `opc_flow_lifecycle` | `action` | 3 | — |
| 3 | `opc_flow_step_complete` | `step` | 4 | — |
| 4 | `opc_flow_reflect` | — | 0 | ✅ registry-guard |
| 5 | `opc_flow_user_reply` | — | 0 | ✅ A3 闭环 |
| 6 | `opc_quick_dispatch` | — | 0 | — |
| 7 | `opc_flow_correct` | `action` | 3 | — |
| 8 | `opc_pipeline_create` | — | 0 | — |
| 9 | `opc_pipeline_status` | — | 0 | — |
| 10 | `opc_pipeline_lifecycle` | `action` | 4 | — |
| 11 | `opc_phase_start` | — | 0 | — |
| 12 | `opc_phase_confirm` | — | 0 | ✅ registry-guard |
| 13 | `opc_phase_complete` | — | 0 | ✅ registry-guard |
| 14 | `opc_node_start` | — | 0 | ✅ registry-guard |
| 15 | `opc_node_finish` | `status` | 3 | — |
| 16 | `opc_knowledge_open` | — | 0 | — |
| 17 | `opc_knowledge_read` | `mode` | 5 | — |
| 18 | `opc_knowledge_write` | — | 0 | — |
| 19 | `opc_knowledge_admin` | `action` | 2 | — |
| 20 | `opc_reflect_plan` | — | 0 | — |
| 21 | `opc_reflect_execute` | `method` | 4 | — |
| 22 | `opc_reflect_complete` | `method` | 4 | — |
| 23 | `opc_reflect_admin` | `action` | 5 | — |
| 24 | `opc_corrections` | `action` | 9 | — |

**24 工具，11 个有 discriminator，13 个无 discriminator。总分支数 = 49。**

## 九、相关文档

- [00 工具合并总览](./00_overview.md) — 54→24 映射表 + 规则
- [02 迁移 Checklist](./02_migration-checklist.md) — 文档更新逐文件 checklist
- [03 Deprecated Alias 规范](./03_deprecated-alias-spec.md) — 旧名 alias 实现
