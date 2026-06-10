/**
 * M15.g: Scenario 09 — phase reset.
 *
 * Doc: doc/feature/04-e2e/02-test/09_phase-reset.md
 *
 * Validates that opc_phase_reset resets the target phase and all
 * downstream phases back to pending, and returns the knowledge-revert
 * plan (paths + confirm_commit_ref for git-based revert).
 *
 * The doc describes git-based knowledge revert (git show <ref>
 * → opc_knowledge_write with base_version); that is a kit-level
 * orchestrator concern (M19+). At the state-server layer, reset
 * returns the knowledge_revert_plan with paths + confirm_commit_ref
 * but does NOT perform any writes — the orchestrator consumes the
 * plan. This test validates the state-server contract.
 *
 * Sequence:
 *  1. lifecycle.start → intent → task_analysis → decomposition →
 *     brief → pipeline_create (3 phases).
 *  2. phase_start(04) → node_start → node_complete.
 *  3. phase_complete(04) → auto-advance → 05 in_progress.
 *  4. phase.reset(target: "04-implement-design") → downstream reset.
 *  5. assert: 04 pending, 05 pending (06 was never started, stays
 *     pending too), pipeline status reverted to in_progress.
 *  6. assert: knowledge_revert_plan populated with node output paths.
 *  7. assert: flow-state history has phase_reset entry.
 *  8. phase_start(04) again → succeeds (re-entering the phase).
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

const PHASES = ["04-implement-design", "05-implement", "06-testing"];

async function setupBefore04(b: Bootstrap): Promise<{
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
}> {
  const started = await b.flow.lifecycle({
    action: "start",
    initial_message: "实现注册功能（reset 测试）",
  });
  const session_id = started.state.session_id;
  await b.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
  await b.flow.stepComplete({
    step: "task_analysis",
    session_id,
    analysis_result: {
      description: "reg impl",
      complexity: "medium",
      suggested_phases: PHASES,
      knowledge_unit: ["user-auth"],
      scenario: "greenfield",
    },
  });
  await b.flow.stepComplete({
    step: "task_decomposition",
    session_id,
    sub_pipelines: [{ id: "sub-1", description: "reg", phases: PHASES }],
  });
  await b.flow.stepComplete({
    step: "brief_generation",
    session_id,
    brief_content: "implement reg",
  });
  const created = await b.pipeline.create({
    session_id,
    description: "reg impl",
    brief_content: "implement reg",
    complexity: "medium",
    knowledge_unit: ["user-auth"],
    suggested_phases: PHASES,
    phase_selection_rationale: "sequential",
    sub_pipelines: [
      { id: "sub-1", title: "reg", knowledge_unit: ["user-auth"], suggested_phases: PHASES },
    ],
  });
  return { session_id, pipeline_id: created.pipeline_id, sub_pipeline_id: "sub-1" };
}

describe("scenario 09 — phase reset", () => {
  it("phase.reset cascades downstream, resets all, returns knowledge_revert_plan", async () => {
    const { session_id, pipeline_id, sub_pipeline_id } = await setupBefore04(app);

    // 2: Drive phase 04 through node_start + node_complete.
    await app.phase.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "04-implement-design",
    });
    await app.node.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "04-implement-design",
      node_name: "api-design",
      node_definition: {
        name: "api-design",
        phase: "04-implement-design",
        description: "API design",
        tags: ["api", "backend"],
        mode: "sequential",
        agents: { primary: ["backend-engineer"] },
        output: [{ artifacts: [], knowledge: "user-auth/api/spec" }],
      },
    });
    const w1 = await app.knowledge.write({
      unit: "user-auth",
      section: "api",
      sub: "spec",
      content: "## API Spec\n- POST /register",
    });
    await app.node.complete({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "04-implement-design",
      node_name: "api-design",
      evidence: {
        knowledge_written: [{ path: "user-auth/api/spec", version: w1.version }],
      },
    });

    // 3: phase_complete(04) → auto-advance to 05.
    const p4Done = await app.phase.complete({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "04-implement-design",
    });
    expect(p4Done.next_phase).toBe("05-implement");
    expect(p4Done.auto_advance).toBe(true);

    // Verify 05 is in_progress
    await app.phase.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "05-implement",
    });

    // 4: phase.reset on 04 — must cascade to 05.
    const reset = await app.recorder.record(
      "opc-state-server",
      "opc_phase_reset",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design" },
      () =>
        app.phase.reset({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "04-implement-design",
        }),
    );
    expect(reset.reset_phase).toBe("04-implement-design");
    expect(reset.reset_downstream).toEqual(["05-implement", "06-testing"]);
    expect(reset.next_phase_status).toBe("pending");
    expect(reset.knowledge_revert_plan.length).toBeGreaterThan(0);
    const revertPaths = reset.knowledge_revert_plan.map((r) => r.path);
    expect(revertPaths).toContain("user-auth/api/spec");

    // 5: state assertions — phases reset to pending.
    const state = reset.state;
    const ph4 = state.phases.find((p) => p.phase === "04-implement-design");
    const ph5 = state.phases.find((p) => p.phase === "05-implement");
    const ph6 = state.phases.find((p) => p.phase === "06-testing");
    expect(ph4?.status).toBe("pending");
    expect(ph5?.status).toBe("pending");
    expect(ph6?.status).toBe("pending");
    expect(state.status).toBe("in_progress");

    // 6: Node-level reset verification.
    expect(ph4?.nodes.every((n) => n.status === "pending")).toBe(true);
    expect(ph4?.nodes.every((n) => n.retry_count === 0)).toBe(true);

    // 7: flow-state history has phase_reset entry.
    const flowState = await loadFlowState(app.root, session_id);
    const historyEntry = flowState.history.find((h) => h.tool === "opc_phase_reset");
    expect(historyEntry).toBeDefined();
    expect(historyEntry?.step).toBe("phase_reset");
    expect((historyEntry?.output as { reset_phase: string })?.reset_phase).toBe("04-implement-design");
    expect(flowState.current_pipeline_pointer?.phase).toBe("04-implement-design");

    // 8: Re-entering the reset phase succeeds.
    await app.phase.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "04-implement-design",
    });

    const calls = app.recorder.freeze();
    // Only the calls wrapped with recorder.record appear in the fixture:
    //   opc_phase_reset
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe("opc_phase_reset");
    expect(calls[0]?.error).toBeUndefined();
  });
});