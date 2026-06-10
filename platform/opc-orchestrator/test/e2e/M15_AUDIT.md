# M15 — E2E Scenario Coverage Audit

> Cross-reference of `doc/feature/04-e2e/02-test/*.md` scenario specs against
> the executable e2e tests in `platform/opc-orchestrator/test/e2e/`.
> All 14 scenarios have at least one test asserting the contract described in
> the scenario doc. Total: **19 test files / 31 tests passing**.

## Coverage matrix

| #  | Doc                          | Test file                                 | Sub-task | Status |
|----|------------------------------|-------------------------------------------|----------|--------|
| 01 | `01_chat.md`                 | `scenario-01-chat.test.ts`                | M15.a    | ✓      |
| 02 | `02_project-question.md`     | `scenario-02-project-question.test.ts`    | M15.b    | ✓      |
| 03 | `03_low-complexity.md`       | `scenario-03-low-complexity.test.ts`      | M15.c    | ✓      |
| 04 | `04_medium-single.md`        | `stage-4.test.ts` + `stage-5.test.ts` (M14) + gap-fill in `scenario-04-05-single-sub.test.ts` | M15.l | ✓ |
| 05 | `05_high-single.md`          | `scenario-04-05-single-sub.test.ts` (high-complexity auto_advance discriminator) | M15.l | ✓ |
| 06 | `06_split-3-sub.md`          | `scenario-06-07-multi-sub.test.ts` ("Scenario 06") | M15.k | ✓ |
| 07 | `07_split-5-sub.md`          | `scenario-06-07-multi-sub.test.ts` ("Scenario 07") | M15.k | ✓ |
| 08 | `08_recovery.md`             | `scenario-08-recovery.test.ts`            | M15.h    | ✓      |
| 09 | `09_phase-reset.md`          | `scenario-09-phase-reset.test.ts`         | M15.g    | ✓      |
| 10 | `10_abort.md`                | `scenario-10-abort.test.ts`               | M15.d    | ✓      |
| 11 | `11_registry-guard-reject.md`| `scenario-11-registry-guard.test.ts`      | M15.e    | ✓      |
| 12 | `12_reflection-rounds-exceeded.md` | `scenario-12-rounds-exceeded.test.ts` | M15.f | ✓ |
| 13 | `13_insert-resume.md`        | `scenario-13-insert-resume.test.ts`       | M15.i    | ✓      |
| 14 | `14_reflection-tool-surface.md` | `scenario-14-reflection-surface.test.ts` | M15.j  | ✓      |

## Documented impl gaps surfaced by M15

These are doc-vs-impl deltas surfaced while writing the tests. None block
M15 closure; each is filed against M16+ in the test file header where it
was discovered.

### Reflection (Scenario 14 — `scenario-14-reflection-surface.test.ts`)

| Gap | Doc behavior | Current impl | Target milestone |
|-----|--------------|--------------|------------------|
| Fused `opc_reflect_execute({inline:true})` tool | Single fused tool folding plan+critique+Task+complete | 4 separate tools (plan/critique/critiqueComplete/recordInterventions); inline path is the 3-call minimum | M17 (tool consolidation) |
| `execution_mode` field in `reflection_budget_hint` | Caller-selectable mode A/B hint | Not present; caller chooses mode directly | M17 |
| V5 evidence_ref enforcement on `kept_objections` | Strict ref enforcement | V5 only checks distinctness | M17+ |
| `ReflectionLogEntry.artifact_path` / `reflection_id` capture in `flow.reflect()` | Schema permits both | Builder omits both | M16+ |

### Insert/resume (Scenario 13 — `scenario-13-insert-resume.test.ts`)

| Gap | Doc behavior | Current impl | Target milestone |
|-----|--------------|--------------|------------------|
| `opc_node_finish` auto pause-flip at node boundary | Node-server flips paused/in_progress | Treated as orchestrator-side concern (kit-level scheduler); state-server only handles surrounding behavior (enqueue, overlap reject, phase.complete auto-resume) | M16 (kit orchestrator) |

### Multi-sub split (Scenarios 06/07 — `scenario-06-07-multi-sub.test.ts`)

| Gap | Doc behavior | Current impl | Resolution |
|-----|--------------|--------------|------------|
| Doc title says "3 sub" / "5 sub" but inline pseudo-code lists 2 + 4 | — | — | Test mirrors inline content (executable contract). Doc title is informational. |

### Phase auto_advance (Scenarios 04/05 — `scenario-04-05-single-sub.test.ts`)

No impl gap — formula at `phase-server.ts:188` (`!isLastPhase && allNodesDone && !isHigh && nextPhase !== null`) matches doc 05 §"complexity=high → auto_advance: false".

## What M15 didn't cover (deferred)

- **MCP subprocess framing**: every test exercises in-process server APIs.
  Real-subprocess MCP transcript validation is deferred to M19 per harness
  header comment.
- **Real Claude `Task` spawn**: critic sub-agent in Mode A is simulated
  (objections + reasoning_trace injected directly). Doc 14 §"Mode A" makes
  this an out-of-band Claude responsibility; recorder fixture documents the
  simulated nature.
- **Cross-process file lock contention**: scenario 08 simulates cross-process
  with a second `FlowServer` instance over the same root. Real `kill(pid,0)`
  semantics on non-Unix hosts not tested.

## How the suite is run

```bash
pnpm vitest run platform/opc-orchestrator/test/e2e/
```

Fixture freeze (recorder JSON) is captured in `stage-7.test.ts` for the
golden walkthrough path; scenario tests assert structurally rather than
matching against a frozen blob.

## Sign-off

All 14 scenarios documented in `doc/feature/04-e2e/02-test/` have an
executable test exercising the contract. Impl gaps surfaced during the
audit are recorded inline in test headers and forwarded to M16/M17.

M15 is complete.
