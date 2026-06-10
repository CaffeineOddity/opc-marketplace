# Intent Analysis Method (P0 → P1)

> Methodology for `opc_intent_complete`. Loaded as a docs reference when
> Claude is at `current_step = intent_analysis`. Spec source:
> [doc/feature/02-opc-state-server/01-intent-analysis/05_intent-recognition.md](../../../../doc/feature/02-opc-state-server/01-intent-analysis/05_intent-recognition.md).

## 1. Purpose

Classify the incoming user message into ONE of four intents and emit
`intent_evidence` (NOT a confidence number) so the P1 reflection layer
can validate the call.

## 2. The four intents

| Intent | When it fires | Routing after `opc_intent_complete` |
|---|---|---|
| `task` | User wants to ship code / produce a deliverable. | `task_analysis` (next state) |
| `project_question` | Question about *this* project / repo. | `knowledge_search` → answer |
| `general_question` | Knowledge question with no project context. | `done` — Claude answers directly |
| `chat` | Greeting, ack, off-topic. | `done` |

## 3. Signals

### 3.1 task signals

| Signal | Weight |
|---|---|
| Action verb: implement / fix / deploy / refactor / build / migrate | +0.3 |
| Concrete deliverable named: system / feature / page / endpoint | +0.2 |
| Explicit prefix `!task ` | +1.0 (deterministic) |
| Question word: how / why / what-is | −0.3 |
| Short, no verb (e.g. "这个", "帮忙") | −0.2 |

Score ≥ 0.5 → `task` candidate. Below threshold falls through to the
question/chat branches.

### 3.2 project_question vs general_question

| Signal | Tilts toward |
|---|---|
| Names concrete file / function / module in this repo | `project_question` |
| First-person plurals: "我们", "这里的", "这个项目" | `project_question` |
| References `opc-knowledge/` concepts or repo terminology | `project_question` |
| Pure definition / concept question | `general_question` |
| No project-specific anchor at all | `general_question` |

### 3.3 chat signals

| Signal | Strength |
|---|---|
| Pure greeting / thanks / ack with no technical content | hard `chat` |
| Single word reaction ("好", "嗯", "ok") | hard `chat` |

## 4. Evidence schema (REQUIRED — replaces `confidence: number`)

```json
{
  "intent": "task | project_question | general_question | chat",
  "intent_evidence": {
    "task_criteria_hits": ["action_verb", "concrete_deliverable"],
    "chat_signals": [],
    "user_quotes": ["实现登录页面", "用 jwt 认证"]
  }
}
```

- `task_criteria_hits[]` — each entry MUST cite a named criterion from
  §3.1 (e.g. `"action_verb"`, `"explicit_!task_prefix"`).
- `chat_signals[]` — same shape for §3.3 negative signals.
- `user_quotes[]` — verbatim substrings from the original user message.
  They MUST be retrievable in `state.user_message_history` — synthetic
  quotes fail V1.

## 5. Routing by validator result

Spec [§5.1](../../../../doc/feature/02-opc-state-server/01-intent-analysis/05_intent-recognition.md):

| V1–V5 + meta result | Effect |
|---|---|
| All pass + no severe objection | Direct route to target branch (no P1 reflection) |
| Pass + medium objection | Route through, but `step_instruction` asks Claude to short-confirm with the user, attaching `reasoning_trace` |
| Fail or severe objection | Enter P1 reflection: primary=M3 (CoVe), secondary=M4 (Critique). Rounds exhausted → escalate `ask_user` |

V1–V5 / M3 / M4 definitions:
[05-opc-reflection-server/01-method-theory/00_overview.md](../../../../doc/feature/05-opc-reflection-server/01-method-theory/00_overview.md).

## 6. Correction commands (post-classification)

| Phrase | Tool to call |
|---|---|
| "不用启动管线" / "just answer" | `opc_flow_abort` |
| "先不做了" / "cancel" | `opc_flow_abort` (auto-cascades `opc_pipeline_abort`) |
| "这不是任务" / "not a task" | `opc_flow_abort({reason:"marked_as_question_sample"})` |
| "重新分析" | `opc_flow_restart({from_step:"task_analysis"})` |
| "改 complexity 为 high" | `opc_flow_revise({field:"complexity",value:"high"})` |
| "还要加 X" | `opc_flow_restart({from_step:"task_analysis",additional_input:"X"})` |
| "回到分析重做拆分" | `opc_flow_restart({from_step:"task_decomposition"})` |
| "继续" / "嗯" | Honor previous `flow_next`, no flow tool needed |

## 7. Explicit prefixes (bypass P1 reflection)

| Prefix | Behaviour |
|---|---|
| `!task <…>` | Force `intent=task`, skip P1 reflection. `user_quotes` records the prefix only. |
| `? <…>` | Force `intent=question`, skip P1 reflection. |

## 8. Output contract

```json
{
  "intent": "task",
  "intent_evidence": { ... },
  "next": { "tool": "opc_flow_step_complete", "step": "task_analysis" }
}
```

If `next.tool` disagrees with `intent` (e.g. intent=`chat` but next=
`task_analysis`), `opc_intent_complete` raises a hard validation
error — these MUST stay aligned.
