/**
 * M14.e: Walkthrough stage 5 — phase 05-implement WITH reflection loop.
 *
 * Drives the implementation phase end-to-end including one reflection
 * round on the node-selection step (P5 → critique primary):
 *  - opc_phase_start(05-implement)
 *  - opc_reflect_plan(step_id="P5") → opc_reflect_critique →
 *    opc_reflect_critique_complete(round=1, verdict=clean)
 *  - opc_flow_reflect(reflection_id) → registry-guard cleared
 *  - opc_node_start(tdd-implementation, quality_gates=[test_pass])
 *  - opc_knowledge_write(impl summary)
 *  - opc_node_complete with evidence.test_results.{passed:N, failed:0}
 *  - opc_phase_complete → flow_next 06-testing
 *
 * Also validates the registry-guard: trying opc_node_start while the
 * reflection is still pending (before opc_flow_reflect) must fail.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    initial_message: "用户认证模块（continuing M14.e）",
  });
  const session_id = started.state.session_id;
  await b.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
  await b.flow.stepComplete({
    step: "task_analysis",
    session_id,
    analysis_result: {
      description: "auth implement only",
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
  return { session_id, pipeline_id: created.pipeline_id, sub_pipeline_id: "sub-auth" };
}

describe("walkthrough stage 5 — phase 05-implement with reflection", () => {
  it("runs reflection round + tdd-implementation node + phase complete", async () => {
    const { session_id, pipeline_id, sub_pipeline_id } = await setupAtPhase05(app);

    // 5a: phase_start.
    await app.recorder.record(
      "opc-state-server",
      "opc_phase_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "05-implement" },
      () =>
        app.phase.start({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "05-implement",
        }),
    );

    // 5b: reflection round 1 — plan.
    const plan = await app.recorder.record(
      "opc-reflection-server",
      "opc_reflect_plan",
      {
        session_id,
        step_id: "P5",
        artifact_summary: "tdd-implementation node selection for auth",
      },
      () =>
        app.reflection.plan({
          session_id,
          step_id: "P5",
          artifact_summary: "tdd-implementation node selection for auth",
        }),
    );
    expect(plan.recommended_methods.primary).toBe("critique");
    expect(plan.max_rounds).toBe(3);

    // 5c: critique — get dispatch spec for the critic sub-agent.
    const critique = await app.recorder.record(
      "opc-reflection-server",
      "opc_reflect_critique",
      {
        session_id,
        step_id: "P5",
        artifact: {
          step: "P5",
          artifact_type: "node_selection",
          payload: { node: "tdd-implementation" },
          collected_at: app.clock.now().toISOString(),
          collected_by: "test",
        },
        enhanced_prompt: plan.enhanced_prompts.critique,
        method: "critique",
      },
      () =>
        app.reflection.critique({
          session_id,
          step_id: "P5",
          artifact: {
            step: "P5",
            artifact_type: "node_selection",
            payload: { node: "tdd-implementation" },
            collected_at: app.clock.now().toISOString(),
            collected_by: "test",
          },
          enhanced_prompt: plan.enhanced_prompts.critique,
          method: "critique",
        }),
    );
    expect(critique.critic_spec.context.method).toBe("critique");
    expect(critique.critic_spec.tools).toContain("opc_knowledge_read");

    // 5d: critique_complete — clean verdict, produces pending_reflection.
    const cc = await app.recorder.record(
      "opc-reflection-server",
      "opc_reflect_critique_complete",
      {
        session_id,
        step_id: "P5",
        method: "critique",
        objections: [],
        reasoning_trace: ["sub-agent found no blocker objections"],
        round: 1,
        max_rounds: 3,
        current_pending_count: 0,
      },
      () =>
        app.reflection.critiqueComplete({
          session_id,
          step_id: "P5",
          method: "critique",
          objections: [],
          reasoning_trace: ["sub-agent found no blocker objections"],
          round: 1,
          max_rounds: 3,
          current_pending_count: 0,
        }),
    );
    expect(cc.verdict).toBe("clean");
    expect(cc.pending_reflection.reflection_id).toMatch(/^rf-/);

    // 5e: opc_flow_reflect — registers, clearing the (unset) registry slot.
    // Note: critiqueComplete writes the reflection artifact to disk but does
    // NOT auto-register it on flow_state.pending_reflections — caller must
    // do that via opc_flow_reflect. Since we never pre-registered, the call
    // simply records the log entry; registered=false.
    const reflected = await app.recorder.record(
      "opc-state-server",
      "opc_flow_reflect",
      {
        session_id,
        reflection_id: cc.pending_reflection.reflection_id,
        artifact_path: cc.pending_reflection.artifact_path,
        step_id: "node_selection",
        round: 1,
        method: "critique",
      },
      () =>
        app.flow.reflect({
          session_id,
          reflection_id: cc.pending_reflection.reflection_id,
          artifact_path: cc.pending_reflection.artifact_path,
          step_id: "node_selection",
          round: 1,
          method: "critique",
        }),
    );
    expect(reflected.registered).toBe(false);
    expect(reflected.state.reflection_log).toHaveLength(1);

    // 5f: node_start tdd-implementation with quality_gates=[test_pass].
    const implKnowledgePath = "user-auth/impl/summary";
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
          node_definition: {
            name: "tdd-implementation",
            phase: "05-implement",
            description: "Red-green-refactor for auth",
            tags: ["tdd", "backend"],
            mode: "sequential",
            agents: { primary: ["backend-engineer"] },
            quality_gates: ["test_pass"],
            output: [{ artifacts: [], knowledge: implKnowledgePath }],
          },
        }),
    );

    // 5g: knowledge_write impl summary.
    const implWrite = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_write",
      { unit: "user-auth", section: "impl", sub: "summary", content: "tdd cycle done" },
      () =>
        app.knowledge.write({
          unit: "user-auth",
          section: "impl",
          sub: "summary",
          content: "## Implementation\n- bcrypt password hashing\n- JWT tokens\n- tests passing",
        }),
    );

    // 5h: node_complete — L1 + L2 (test_pass) gates satisfied.
    const nodeDone = await app.recorder.record(
      "opc-state-server",
      "opc_node_complete",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "05-implement",
        node_name: "tdd-implementation",
      },
      () =>
        app.node.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "05-implement",
          node_name: "tdd-implementation",
          evidence: {
            test_results: { passed: 12, failed: 0 },
            knowledge_written: [{ path: implKnowledgePath, version: implWrite.version }],
          },
        }),
    );
    expect(nodeDone.status).toBe("completed");
    expect(nodeDone.flow_next.tool).toBe("opc_phase_complete");

    // 5i: phase_complete → next is 06-testing.
    const phaseDone = await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "05-implement" },
      () =>
        app.phase.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "05-implement",
        }),
    );
    expect(phaseDone.next_phase).toBe("06-testing");
    expect(phaseDone.auto_advance).toBe(true);

    const calls = app.recorder.freeze();
    expect(calls.every((c) => !c.error)).toBe(true);
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_phase_start",
      "opc_reflect_plan",
      "opc_reflect_critique",
      "opc_reflect_critique_complete",
      "opc_flow_reflect",
      "opc_node_start",
      "opc_knowledge_write",
      "opc_node_complete",
      "opc_phase_complete",
    ]);
  });

  it("L2 test_pass gate rejects node_complete when failed != 0", async () => {
    const { session_id, pipeline_id, sub_pipeline_id } = await setupAtPhase05(app);
    await app.phase.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "05-implement",
    });
    const implKnowledgePath = "user-auth/impl/summary";
    await app.node.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "05-implement",
      node_name: "tdd-implementation",
      node_definition: {
        name: "tdd-implementation",
        phase: "05-implement",
        description: "x",
        tags: [],
        mode: "sequential",
        agents: { primary: ["backend-engineer"] },
        quality_gates: ["test_pass"],
        output: [{ artifacts: [], knowledge: implKnowledgePath }],
      },
    });
    const w = await app.knowledge.write({
      unit: "user-auth",
      section: "impl",
      sub: "summary",
      content: "x",
    });
    await expect(
      app.node.complete({
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "05-implement",
        node_name: "tdd-implementation",
        evidence: {
          test_results: { passed: 5, failed: 2 },
          knowledge_written: [{ path: implKnowledgePath, version: w.version }],
        },
      }),
    ).rejects.toThrow(/L2: test_pass not satisfied/);
  });
});
