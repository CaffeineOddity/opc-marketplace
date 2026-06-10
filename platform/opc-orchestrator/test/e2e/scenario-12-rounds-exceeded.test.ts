/**
 * M15.f: Scenario 12 — reflection rounds exceeded (A3 closure).
 *
 * Doc: doc/feature/04-e2e/02-test/12_reflection-rounds-exceeded.md
 *
 * Validates the A3 closure (反思 rounds 耗尽兜底):
 *   1. After max_rounds reflection rounds all returning objections_remain,
 *      state-server's opc_flow_reflect with verdict=rounds_exceeded
 *      creates a pending_user_question.
 *   2. pending-question-guard blocks any other state-mutating tool until
 *      opc_flow_user_reply consumes it.
 *   3. opc_flow_user_reply applies accumulated_patch + records intervention +
 *      sets skip_reflection_once_for_step.
 *   4. The next opc_flow_step_complete on the same step is the consumer of
 *      _skip_reflection_once_for_step (cleared, but no reflection rerun on
 *      this server layer — reflection budgeting is reflection-server's job).
 *
 * Test flow (compressed — uses direct flow.reflect calls rather than full
 * reflection-server M3-debate round-trips; reflection-server unit tests
 * cover the round-trip generation. The state-server is the system under
 * test for A3.):
 *  1. lifecycle.start
 *  2. step_complete(intent_analysis, intent=task)
 *  3. step_complete(task_analysis, complexity=high) — into decomposition
 *  4. flow.reflect(verdict=objections_remain, round=1)
 *  5. flow.reflect(verdict=objections_remain, round=2)
 *  6. flow.reflect(verdict=rounds_exceeded, round=3, rounds_exceeded_payload)
 *  7. step_complete attempt — MUST be blocked by pending-question-guard
 *  8. flow.userReply with accumulated_patch
 *  9. step_complete(task_decomposition) — succeeds (guard cleared)
 *
 * Asserts (per doc §"断言清单" 7 / 9 / 10 / 11 / 12 / 13):
 *  - pending_user_question populated after rounds_exceeded
 *  - context_artifacts contains the 3 reflection artifacts
 *  - any other write tool throws pending-question-guard
 *  - accumulated NOT mutated by the guard reject
 *  - after userReply: pending_user_question = null
 *  - user_interventions[0].trigger = "ask_user_rounds_exceeded"
 *  - accumulated_patch applied (knowledge_unit contains "audit")
 *  - skip_reflection_once_for_step set to "task_analysis"
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadFlowState } from "@opc/state-server";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

describe("scenario 12 — reflection rounds_exceeded (A3 closure)", () => {
  it("rounds_exceeded → ask_user → guard blocks → user_reply → patch applied → skip flag set", async () => {
    // 1: lifecycle.start
    const started = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "start", initial_message: "重构一个高复杂度的认证系统" },
      () => app.flow.lifecycle({ action: "start", initial_message: "重构一个高复杂度的认证系统" }),
    );
    const session_id = started.state.session_id;

    // 2: intent
    await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      { step: "intent_analysis", session_id, intent: "task" },
      () => app.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" }),
    );

    // 3: task_analysis high — leaves flow at task_decomposition
    const SUGGESTED_PHASES = ["04-implement-design", "05-implement", "06-testing"];
    await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      {
        step: "task_analysis",
        session_id,
        analysis_result: { complexity: "high" },
      },
      () =>
        app.flow.stepComplete({
          step: "task_analysis",
          session_id,
          analysis_result: {
            description: "auth refactor",
            complexity: "high",
            suggested_phases: SUGGESTED_PHASES,
            knowledge_unit: ["user-auth"],
            scenario: "refactor",
          },
        }),
    );

    // 4 + 5: two rounds objections_remain
    const r1 = "rfl-P2-r1-test12";
    const r2 = "rfl-P2-r2-test12";
    const r3 = "rfl-P2-r3-test12";
    const r1_path = "opc-logs/reflection/test/rfl-P2-r1-test12.json";
    const r2_path = "opc-logs/reflection/test/rfl-P2-r2-test12.json";
    const r3_path = "opc-logs/reflection/test/rfl-P2-r3-test12.json";

    await app.recorder.record(
      "opc-state-server",
      "opc_flow_reflect",
      { session_id, reflection_id: r1, verdict: "objections_remain", round: 1 },
      () =>
        app.flow.reflect({
          session_id,
          reflection_id: r1,
          artifact_path: r1_path,
          step_id: "task_analysis",
          round: 1,
          method: "debate",
        }),
    );
    await app.recorder.record(
      "opc-state-server",
      "opc_flow_reflect",
      { session_id, reflection_id: r2, verdict: "objections_remain", round: 2 },
      () =>
        app.flow.reflect({
          session_id,
          reflection_id: r2,
          artifact_path: r2_path,
          step_id: "task_analysis",
          round: 2,
          method: "debate",
        }),
    );

    // 6: rounds_exceeded — state-server creates pending_user_question
    const exceeded = await app.recorder.record(
      "opc-state-server",
      "opc_flow_reflect",
      {
        session_id,
        reflection_id: r3,
        verdict: "rounds_exceeded",
        round: 3,
        rounds_exceeded_payload: {
          reasoning_trace: ["3 轮 M3-debate 始终在 'scope 边界' 上分歧"],
          kept_objections: [{ id: "obj-1", text: "scope 边界无法收敛" }],
          context_artifacts: [r1_path, r2_path, r3_path],
        },
      },
      () =>
        app.flow.reflect({
          session_id,
          reflection_id: r3,
          artifact_path: r3_path,
          step_id: "task_analysis",
          round: 3,
          method: "debate",
          verdict: "rounds_exceeded",
          rounds_exceeded_payload: {
            reasoning_trace: ["3 轮 M3-debate 始终在 'scope 边界' 上分歧"],
            kept_objections: [{ id: "obj-1", text: "scope 边界无法收敛" }],
            context_artifacts: [r1_path, r2_path, r3_path],
          },
        }),
    );
    expect(exceeded.state.pending_user_question).not.toBeNull();
    expect(exceeded.next).toEqual({ tool: "opc_flow_user_reply" });
    const q = exceeded.state.pending_user_question!;
    expect(q.context_artifacts).toEqual([r1_path, r2_path, r3_path]);
    expect(q.kept_objections).toHaveLength(1);
    expect(q.kept_objections[0]?.id).toBe("obj-1");
    expect(q.must_be_resolved_by).toBe("opc_flow_user_reply");
    expect(exceeded.state.pending_reflections).toEqual([]);

    // 7: any other write tool blocked by pending-question-guard
    let guardErr: Error | undefined;
    try {
      await app.recorder.record(
        "opc-state-server",
        "opc_flow_step_complete",
        { step: "task_decomposition", session_id },
        () =>
          app.flow.stepComplete({
            step: "task_decomposition",
            session_id,
            sub_pipelines: [{ id: "sub-1", description: "x", phases: SUGGESTED_PHASES }],
          }),
      );
    } catch (err) {
      guardErr = err as Error;
    }
    expect(guardErr).toBeDefined();
    expect(guardErr?.message).toMatch(/pending-question-guard/);
    expect(guardErr?.message).toContain(q.question_id);

    // Invariant: accumulated NOT mutated by reject
    const afterReject = await loadFlowState(app.root, session_id);
    expect(afterReject.pending_user_question?.question_id).toBe(q.question_id);
    expect(afterReject.accumulated.decomposition_result).toBeNull();

    // 8: user_reply — applies patch, clears question, sets skip flag
    const replied = await app.recorder.record(
      "opc-state-server",
      "opc_flow_user_reply",
      {
        session_id,
        question_id: q.question_id,
        user_reply: "scope 就按 high 走，加 audit unit",
        resolution: {
          objections_resolved: ["obj-1"],
          accumulated_patch: {
            analysis_result: {
              description: "auth refactor",
              complexity: "high",
              suggested_phases: SUGGESTED_PHASES,
              knowledge_unit: ["user-auth", "audit"],
              scenario: "refactor",
            },
          },
          notes: "用户裁定 scope 先粗后细",
        },
      },
      () =>
        app.flow.userReply({
          session_id,
          question_id: q.question_id,
          user_reply: "scope 就按 high 走，加 audit unit",
          resolution: {
            objections_resolved: ["obj-1"],
            accumulated_patch: {
              analysis_result: {
                description: "auth refactor",
                complexity: "high",
                suggested_phases: SUGGESTED_PHASES,
                knowledge_unit: ["user-auth", "audit"],
                scenario: "refactor",
              },
            },
            notes: "用户裁定 scope 先粗后细",
          },
        }),
    );
    expect(replied.state.pending_user_question).toBeNull();
    expect(replied.state.user_interventions).toHaveLength(1);
    expect(replied.state.user_interventions[0]?.trigger).toBe("ask_user_rounds_exceeded");
    expect(replied.state.user_interventions[0]?.linked_reflection_artifacts).toEqual([
      r1_path,
      r2_path,
      r3_path,
    ]);
    expect(replied.state.accumulated.analysis_result?.knowledge_unit).toContain("audit");
    expect(replied.state.skip_reflection_once_for_step).toBe("task_analysis");

    // 9: subsequent step_complete on task_decomposition succeeds (guard clear)
    const decompDone = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      { step: "task_decomposition", session_id },
      () =>
        app.flow.stepComplete({
          step: "task_decomposition",
          session_id,
          sub_pipelines: [{ id: "sub-1", description: "auth-core", phases: SUGGESTED_PHASES }],
        }),
    );
    expect(decompDone.state.accumulated.decomposition_result?.sub_pipelines).toHaveLength(1);

    const calls = app.recorder.freeze();
    expect(calls.map((c) => `${c.tool}:${c.error ? "err" : "ok"}`)).toEqual([
      "opc_flow_lifecycle:ok",
      "opc_flow_step_complete:ok",
      "opc_flow_step_complete:ok",
      "opc_flow_reflect:ok",
      "opc_flow_reflect:ok",
      "opc_flow_reflect:ok",
      "opc_flow_step_complete:err",
      "opc_flow_user_reply:ok",
      "opc_flow_step_complete:ok",
    ]);
  });
});
