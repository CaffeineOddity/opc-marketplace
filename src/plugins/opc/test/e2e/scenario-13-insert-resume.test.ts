/**
 * M15.i: Scenario 13 — sub-pipeline insert + auto-resume.
 *
 * Doc: doc/feature/04-e2e/02-test/13_insert-resume.md
 *
 * Validates the insert-and-auto-resume contract:
 *  1. opc_pipeline_lifecycle({action:"replan", add_sub_pipeline,
 *     execution_priority:"immediate"}) ENQUEUES a new sub without
 *     interrupting the active sub or its sub-agent.
 *  2. The replan response confirms active_sub_pipeline_id is unchanged
 *     (status: pending; the active sub keeps running).
 *  3. knowledge_unit overlap with an in-progress sub is rejected at
 *     the replan entrypoint (defense layer 1).
 *  4. After node-boundary pause-switch (paused/in_progress flip), the
 *     inserted sub completes its final phase → opc_phase_complete
 *     auto-detects the paused sub and surfaces it via
 *     pipeline_progress.next_sub_pipeline.resumed_from_paused=true
 *     + flow_next.args.sub_pipeline_id pointing back at the original.
 *
 * Implementation gap documented (per 13_insert-resume.md §"调用链路 [04]"):
 *   - The doc describes opc_node_finish performing the paused/in_progress
 *     status flip automatically at node boundaries.
 *   - Current impl: pause-flip is NOT in node-server. It is treated as
 *     orchestrator-side scheduling (kit/M16+). The state-server contract
 *     this test covers is the SURROUNDING behavior:
 *       a. replan enqueues + does not interrupt        (covered)
 *       b. overlap rejection                            (covered)
 *       c. phase.complete auto-resume detection         (covered)
 *   - The orchestrator-side flip is simulated by directly mutating
 *     pipeline-plan.json (saving via savePipelinePlan) — same shape as
 *     what the M16 orchestrator would do at the next opc_node_complete
 *     boundary.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadPipelinePlan,
  newStateJson,
  savePipelinePlan,
  saveStateJson,
} from "@opc/state-server";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

const PHASES = ["05-implement", "06-testing"];
const INSERT_PHASES = ["05-implement"];

async function setupTwoSubsAtSub2(b: Bootstrap): Promise<{
  session_id: string;
  pipeline_id: string;
}> {
  const started = await b.flow.lifecycle({
    action: "start",
    initial_message: "scenario 13 — insert + resume",
  });
  const session_id = started.state.session_id;
  await b.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
  await b.flow.stepComplete({
    step: "task_analysis",
    session_id,
    analysis_result: {
      description: "multi-sub work",
      complexity: "medium",
      suggested_phases: PHASES,
      knowledge_unit: ["user-auth", "billing"],
      scenario: "greenfield",
    },
  });
  await b.flow.stepComplete({
    step: "task_decomposition",
    session_id,
    sub_pipelines: [
      { id: "sub-1", description: "auth", phases: PHASES },
      { id: "sub-2", description: "billing", phases: PHASES },
    ],
  });
  await b.flow.stepComplete({
    step: "brief_generation",
    session_id,
    brief_content: "auth + billing",
  });
  const created = await b.pipeline.create({
    session_id,
    description: "two-sub pipeline",
    brief_content: "auth + billing",
    complexity: "medium",
    knowledge_unit: ["user-auth", "billing"],
    suggested_phases: PHASES,
    phase_selection_rationale: "sequential",
    sub_pipelines: [
      {
        id: "sub-1",
        title: "auth",
        knowledge_unit: ["user-auth"],
        suggested_phases: PHASES,
      },
      {
        id: "sub-2",
        title: "billing",
        knowledge_unit: ["billing"],
        suggested_phases: PHASES,
      },
    ],
  });
  // Mark sub-2 in_progress so the immediate-insert path is valid.
  const plan = await loadPipelinePlan(b.root, session_id, created.pipeline_id);
  const sub2 = plan.sub_pipelines.find((s) => s.id === "sub-2");
  if (sub2) sub2.status = "in_progress";
  await savePipelinePlan(b.root, session_id, plan, b.clock.now());

  return { session_id, pipeline_id: created.pipeline_id };
}

describe("scenario 13 — insert + auto-resume", () => {
  it("replan enqueues immediate sub, does not interrupt, then phase.complete auto-resumes paused sub", async () => {
    const { session_id, pipeline_id } = await setupTwoSubsAtSub2(app);

    // 1: opc_pipeline_lifecycle({action:"replan"}) — enqueue insert.
    const replanned = await app.recorder.record(
      "opc-state-server",
      "opc_pipeline_lifecycle",
      {
        action: "replan",
        pipeline_id,
        changes: {
          add_sub_pipeline: [
            {
              id: "sub-insert-1",
              title: "logging-middleware",
              knowledge_unit: ["logging"],
              execution_priority: "immediate",
              suggested_phases: INSERT_PHASES,
            },
          ],
        },
      },
      () =>
        app.pipeline.replan({
          session_id,
          pipeline_id,
          reason: "user asked to insert logging middleware",
          changes: {
            add_sub_pipeline: [
              {
                id: "sub-insert-1",
                title: "logging-middleware",
                knowledge_unit: ["logging"],
                execution_priority: "immediate",
                suggested_phases: INSERT_PHASES,
              },
            ],
          },
        }),
    );
    expect(replanned.rejected_changes).toEqual([]);
    expect(replanned.plan.sub_pipelines.find((s) => s.id === "sub-insert-1")?.status).toBe(
      "pending",
    );
    expect(
      replanned.plan.sub_pipelines.find((s) => s.id === "sub-insert-1")?.execution_priority,
    ).toBe("immediate");
    // Active sub unchanged after replan (no interrupt).
    expect(replanned.plan.sub_pipelines.find((s) => s.id === "sub-2")?.status).toBe(
      "in_progress",
    );
    expect(replanned.plan.replan_history).toHaveLength(1);

    // 2: orchestrator-side pause-switch (M16+). Simulate the node-boundary
    // flip the doc §[04] describes: sub-2 → paused, sub-insert-1 → in_progress.
    // In production this happens inside the kit-level orchestrator at the
    // next opc_node_complete boundary; the state-server contract only
    // requires that the resulting plan be valid for downstream auto-resume.
    const plan = await loadPipelinePlan(app.root, session_id, pipeline_id);
    const sub2 = plan.sub_pipelines.find((s) => s.id === "sub-2");
    const insert = plan.sub_pipelines.find((s) => s.id === "sub-insert-1");
    if (sub2) {
      sub2.status = "paused";
      sub2.paused_at = {
        at: app.clock.now().toISOString(),
        phase: "05-implement",
        node_after: "backend-endpoint",
        next_node_was: "security-review",
      };
    }
    if (insert) insert.status = "in_progress";
    await savePipelinePlan(app.root, session_id, plan, app.clock.now());

    // Bootstrap the inserted sub's state.json (replan only mutates
    // pipeline-plan.json; per-sub state.json materialization is an
    // orchestrator concern — mirrored here for the e2e harness).
    const insertState = newStateJson({
      sub_pipeline_id: "sub-insert-1",
      title: "logging-middleware",
      description: "wire logging middleware",
      complexity: "medium",
      knowledge_unit: ["logging"],
      suggested_phases: INSERT_PHASES,
      phase_selection_rationale: "single-phase insert",
      now: app.clock.now(),
    });
    await saveStateJson(app.root, session_id, pipeline_id, insertState, app.clock.now());

    // 3: Drive the insert sub through its single phase.
    await app.phase.start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-insert-1",
      phase: "05-implement",
    });
    await app.node.start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-insert-1",
      phase: "05-implement",
      node_name: "logging-impl",
      node_definition: {
        name: "logging-impl",
        phase: "05-implement",
        description: "wire logging middleware",
        tags: ["backend"],
        mode: "sequential",
        agents: { primary: ["backend-engineer"] },
        output: [{ artifacts: [], knowledge: "logging/middleware/summary" }],
      },
    });
    const w1 = await app.knowledge.write({
      unit: "logging",
      section: "middleware",
      sub: "summary",
      content: "## Logging middleware\nrequest-id propagation",
    });
    await app.node.complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-insert-1",
      phase: "05-implement",
      node_name: "logging-impl",
      evidence: {
        knowledge_written: [{ path: "logging/middleware/summary", version: w1.version }],
      },
    });

    // 4: opc_phase_complete on the insert's final phase → auto-resume.
    const completed = await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-insert-1",
        phase: "05-implement",
      },
      () =>
        app.phase.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id: "sub-insert-1",
          phase: "05-implement",
        }),
    );

    // 5: assertions — auto-resume points back at paused sub-2.
    expect(completed.next_phase).toBeNull();
    expect(completed.pipeline_progress.current_sub_status).toBe("completed");
    expect(completed.pipeline_progress.next_sub_pipeline?.id).toBe("sub-2");
    expect(completed.pipeline_progress.next_sub_pipeline?.resumed_from_paused).toBe(true);
    expect(completed.flow_next.tool).toBe("opc_phase_start");
    expect(completed.flow_next.args?.sub_pipeline_id).toBe("sub-2");
    expect(completed.flow_next.why).toMatch(/auto-resume/);

    // 6: plan invariants — insert is completed, sub-2 is still flagged paused
    //    (resume itself is M16-orchestrator; state-server's contract here is
    //    *detection* and *handoff* via flow_next).
    const finalPlan = await loadPipelinePlan(app.root, session_id, pipeline_id);
    expect(finalPlan.sub_pipelines.find((s) => s.id === "sub-insert-1")?.status).toBe(
      "completed",
    );
    expect(finalPlan.sub_pipelines.find((s) => s.id === "sub-2")?.status).toBe("paused");
    expect(finalPlan.sub_pipelines.find((s) => s.id === "sub-2")?.paused_at?.next_node_was).toBe(
      "security-review",
    );

    const calls = app.recorder.freeze();
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_pipeline_lifecycle",
      "opc_phase_complete",
    ]);
    expect(calls.every((c) => !c.error)).toBe(true);
  });

  it("replan rejects immediate insert when knowledge_unit overlaps with active sub", async () => {
    const { session_id, pipeline_id } = await setupTwoSubsAtSub2(app);

    const replanned = await app.pipeline.replan({
      session_id,
      pipeline_id,
      changes: {
        add_sub_pipeline: [
          {
            id: "sub-overlap",
            title: "billing-extra",
            knowledge_unit: ["billing"], // overlaps with active sub-2
            execution_priority: "immediate",
            suggested_phases: INSERT_PHASES,
          },
        ],
      },
    });
    expect(replanned.rejected_changes).toHaveLength(1);
    const reason = (replanned.rejected_changes[0] as { reason: string }).reason;
    expect(reason).toMatch(/overlap/);
    // The rejected spec must NOT have been inserted into the plan.
    const plan = await loadPipelinePlan(app.root, session_id, pipeline_id);
    expect(plan.sub_pipelines.find((s) => s.id === "sub-overlap")).toBeUndefined();
    // Active sub still in_progress, unchanged.
    expect(plan.sub_pipelines.find((s) => s.id === "sub-2")?.status).toBe("in_progress");
  });
});
