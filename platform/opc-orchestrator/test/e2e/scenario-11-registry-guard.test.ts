/**
 * M15.e: Scenario 11 — registry-guard reject (negative).
 *
 * Doc: doc/feature/04-e2e/02-test/11_registry-guard-reject.md
 *
 * Validates defense layer 3 (engineering bottom line) of the
 * reflection-registry-guard: a protected tool called while
 * pending_reflections is non-empty MUST be rejected with a
 * "reflection-registry-guard" error, and the pending_reflection MUST
 * survive the reject (so opc_flow_reflect can still consume it).
 *
 * The doc describes opc_phase_confirm as the protected tool; current
 * impl folds confirmation into opc_phase_start's response (no
 * separate phase_confirm tool — see phase-server.ts L139). The guard
 * itself protects step_complete / node_start / phase_complete /
 * pipeline_create / node_complete identically. This test uses
 * opc_node_start as the canonical protected tool because that is
 * what the prod walkthrough hits after node-selection reflection.
 *
 * Sequence:
 *  1. lifecycle.start → intent_analysis(task) → task_analysis(low/single)
 *     → quick_dispatch (completed); then re-open a fresh flow per scenario
 *     setup — but quick_dispatch terminates the flow. Instead we follow
 *     the medium-single path through brief → pipeline_create → phase_start
 *     so an opc_node_start would be valid; then we inject pending_reflection
 *     and assert the rejection + recovery cycle.
 *
 * Recorded calls:
 *  1. opc_node_start (rejected; recorder captures error)
 *  2. opc_flow_reflect (registers, clears slot)
 *  3. opc_node_start (succeeds)
 *
 * Invariants validated:
 *  - reject error message contains "reflection-registry-guard"
 *  - pending_reflections still has the entry after the reject
 *  - after reflect, pending_reflections is empty + reflection_log has 1 entry
 *  - second node_start succeeds (registry slot is clean)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadFlowState, saveFlowState } from "@opc/state-server";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

const SUGGESTED_PHASES = ["05-implement", "06-testing"];

async function setupAtPhase05(b: Bootstrap): Promise<{
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
}> {
  const started = await b.flow.lifecycle({
    action: "start",
    initial_message: "scenario 11 — registry guard",
  });
  const session_id = started.state.session_id;
  await b.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
  await b.flow.stepComplete({
    step: "task_analysis",
    session_id,
    analysis_result: {
      description: "auth implement",
      complexity: "medium",
      suggested_phases: SUGGESTED_PHASES,
      knowledge_unit: ["user-auth"],
      scenario: "greenfield",
    },
  });
  await b.flow.stepComplete({
    step: "task_decomposition",
    session_id,
    sub_pipelines: [
      { id: "sub-auth", description: "auth", phases: SUGGESTED_PHASES },
    ],
  });
  await b.flow.stepComplete({
    step: "brief_generation",
    session_id,
    brief_content: "implement auth + tests",
  });
  const created = await b.pipeline.create({
    session_id,
    description: "auth impl",
    brief_content: "implement auth + tests",
    complexity: "medium",
    knowledge_unit: ["user-auth"],
    suggested_phases: SUGGESTED_PHASES,
    phase_selection_rationale: "implement → testing",
    sub_pipelines: [
      {
        id: "sub-auth",
        title: "auth sub",
        knowledge_unit: ["user-auth"],
        suggested_phases: SUGGESTED_PHASES,
      },
    ],
  });
  await b.phase.start({
    session_id,
    pipeline_id: created.pipeline_id,
    sub_pipeline_id: "sub-auth",
    phase: "05-implement",
  });
  return { session_id, pipeline_id: created.pipeline_id, sub_pipeline_id: "sub-auth" };
}

describe("scenario 11 — registry-guard reject (negative)", () => {
  it("opc_node_start rejected with pending_reflections; survives reject; reflect clears + retry succeeds", async () => {
    const { session_id, pipeline_id, sub_pipeline_id } = await setupAtPhase05(app);

    // Inject a pending_reflection directly (simulates the reflection-server
    // having issued one via critique_complete; in real prod the integration
    // hook calls registerPendingReflection on the flow state — see
    // flow-server.ts L611).
    const flowState = await loadFlowState(app.root, session_id);
    const reflection_id = "rfl-P5-r1-test11";
    const artifact_path = "opc-logs/reflection/test/rfl-P5-r1-test11.json";
    app.flow.registerPendingReflection(flowState, {
      reflection_id,
      artifact_path,
      step_id: "node_selection",
      issued_by: "reflection-server",
      issued_at: app.clock.now().toISOString(),
      expires_at: new Date(app.clock.now().getTime() + 60_000).toISOString(),
      must_be_registered_by: "opc_flow_reflect",
    });
    await saveFlowState(app.root, flowState, app.clock.now());

    const nodeDef = {
      name: "tdd-implementation",
      phase: "05-implement",
      description: "auth tdd",
      tags: ["tdd", "backend"],
      mode: "sequential" as const,
      agents: { primary: ["backend-engineer"] },
      quality_gates: ["test_pass"],
      output: [{ artifacts: [], knowledge: "user-auth/impl/summary" }],
    };

    // 1: opc_node_start — guard MUST reject.
    let rejectedErr: Error | undefined;
    try {
      await app.recorder.record(
        "opc-state-server",
        "opc_node_start",
        {
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "05-implement",
          node_name: "tdd-implementation",
        },
        () =>
          app.node.start({
            session_id,
            pipeline_id,
            sub_pipeline_id,
            phase: "05-implement",
            node_name: "tdd-implementation",
            node_definition: nodeDef,
          }),
      );
    } catch (err) {
      rejectedErr = err as Error;
    }
    expect(rejectedErr).toBeDefined();
    expect(rejectedErr?.message).toMatch(/reflection-registry-guard/);
    expect(rejectedErr?.message).toContain(reflection_id);

    // Invariant: pending_reflection survives the reject (not consumed).
    const afterReject = await loadFlowState(app.root, session_id);
    expect(afterReject.pending_reflections).toHaveLength(1);
    expect(afterReject.pending_reflections[0]?.reflection_id).toBe(reflection_id);
    expect(afterReject.reflection_log).toHaveLength(0);

    // 2: opc_flow_reflect — registers, clears the slot.
    const reflected = await app.recorder.record(
      "opc-state-server",
      "opc_flow_reflect",
      { session_id, reflection_id, artifact_path, step_id: "node_selection", round: 1 },
      () =>
        app.flow.reflect({
          session_id,
          reflection_id,
          artifact_path,
          step_id: "node_selection",
          round: 1,
          method: "critique",
        }),
    );
    expect(reflected.registered).toBe(true);
    expect(reflected.state.pending_reflections).toEqual([]);
    expect(reflected.state.reflection_log).toHaveLength(1);
    expect(reflected.state.reflection_log[0]?.step_id).toBe("node_selection");

    // 3: opc_node_start — retry now passes the guard.
    const nodeStarted = await app.recorder.record(
      "opc-state-server",
      "opc_node_start",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "05-implement",
        node_name: "tdd-implementation",
      },
      () =>
        app.node.start({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "05-implement",
          node_name: "tdd-implementation",
          node_definition: nodeDef,
        }),
    );
    expect(nodeStarted.status).toBe("in_progress");

    const calls = app.recorder.freeze();
    expect(calls.map((c) => `${c.tool}:${c.error ? "err" : "ok"}`)).toEqual([
      "opc_node_start:err",
      "opc_flow_reflect:ok",
      "opc_node_start:ok",
    ]);
    expect(calls[0]?.error).toMatch(/reflection-registry-guard/);
  });
});
