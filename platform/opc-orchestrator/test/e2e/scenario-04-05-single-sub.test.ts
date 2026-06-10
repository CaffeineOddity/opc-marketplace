/**
 * M15.l: Scenarios 04 + 05 — medium/high single-sub gap-fill.
 *
 * Docs:
 *  - doc/feature/04-e2e/02-test/04_medium-single.md
 *  - doc/feature/04-e2e/02-test/05_high-single.md
 *
 * Status: most of 04/05 is already covered by M14 stages 4-7
 * (stage-4 covers medium auto_advance=true; stage-5 covers reflection
 * loop on P5; stage-6 covers terminal phase auto_advance=false). The
 * one discriminator NOT yet covered in any e2e test is:
 *
 *   complexity=high → auto_advance=false BETWEEN two non-terminal
 *   phases (formula: !isLastPhase && allNodesDone && !isHigh)
 *
 * stage-6 asserts auto_advance=false but ONLY because nextPhase===null
 * (last phase). This gap-fill test isolates the complexity discriminator
 * by completing a non-terminal phase in a high-complexity sub and
 * asserting auto_advance=false WHILE nextPhase is non-null.
 *
 * Out of scope (already covered):
 *  - medium happy path (stage-4 + stage-5)
 *  - terminal auto_advance=false (stage-6)
 *  - high complexity through reflection rounds (scenario 12)
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

const PHASES = ["04-implement-design", "05-implement"];

describe("scenarios 04 + 05 — single-sub auto_advance discriminators", () => {
  it("Scenario 05 gap: complexity=high blocks auto_advance between non-terminal phases", async () => {
    const started = await app.flow.lifecycle({
      action: "start",
      initial_message: "重构 user 模块，把 session 管理从 cookie 改成 JWT",
    });
    const session_id = started.state.session_id;
    await app.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
    await app.flow.stepComplete({
      step: "task_analysis",
      session_id,
      analysis_result: {
        description: "JWT migration",
        complexity: "high",
        suggested_phases: PHASES,
        knowledge_unit: ["user-auth"],
        scenario: "refactor",
      },
    });
    // high complexity routes through task_decomposition even with 1 sub.
    await app.flow.stepComplete({
      step: "task_decomposition",
      session_id,
      sub_pipelines: [
        { id: "sub-1", description: "jwt-migration", phases: PHASES },
      ],
    });
    await app.flow.stepComplete({
      step: "brief_generation",
      session_id,
      brief_content: "migrate session to JWT",
    });
    const created = await app.pipeline.create({
      session_id,
      description: "JWT migration",
      brief_content: "migrate session to JWT",
      complexity: "high",
      knowledge_unit: ["user-auth"],
      suggested_phases: PHASES,
      phase_selection_rationale: "high complexity refactor",
      sub_pipelines: [
        {
          id: "sub-1",
          title: "jwt-migration",
          knowledge_unit: ["user-auth"],
          suggested_phases: PHASES,
        },
      ],
    });
    const pipeline_id = created.pipeline_id;

    // Phase 04 (non-terminal): start → node → node_complete → phase_complete
    await app.phase.start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "04-implement-design",
    });
    await app.node.start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "04-implement-design",
      node_name: "api-design",
      node_definition: {
        name: "api-design",
        phase: "04-implement-design",
        description: "JWT endpoint design",
        tags: ["api"],
        mode: "sequential",
        agents: { primary: ["backend-engineer"] },
        output: [{ artifacts: [], knowledge: "user-auth/api/jwt" }],
      },
    });
    const w = await app.knowledge.write({
      unit: "user-auth",
      section: "api",
      sub: "jwt",
      content: "## JWT endpoints\nPOST /token",
    });
    await app.node.complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "04-implement-design",
      node_name: "api-design",
      evidence: {
        knowledge_written: [{ path: "user-auth/api/jwt", version: w.version }],
      },
    });

    // The discriminator under test: phase.complete on a NON-terminal phase
    // (next_phase === "05-implement") with complexity=high → auto_advance=false.
    const p4Done = await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id: "sub-1", phase: "04-implement-design" },
      () =>
        app.phase.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id: "sub-1",
          phase: "04-implement-design",
        }),
    );
    expect(p4Done.next_phase).toBe("05-implement");
    expect(p4Done.auto_advance).toBe(false);
    // flow_next still routes the caller, just without auto-advance —
    // user/Claude must confirm explicitly per doc 05 §"complexity=high
    // → auto_advance: false（每阶段必须用户确认）".
    expect(p4Done.flow_next.tool).toBe("opc_phase_start");
    expect(p4Done.flow_next.args?.phase).toBe("05-implement");

    const calls = app.recorder.freeze();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe("opc_phase_complete");
    expect(calls[0]?.error).toBeUndefined();
  });
});
