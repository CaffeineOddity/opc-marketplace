import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FlowServer,
  PhaseServer,
  PhaseValidationError,
  PipelineServer,
  loadFlowState,
  loadPipelinePlan,
  loadStateJson,
  saveFlowState,
  savePipelinePlan,
  saveStateJson,
} from "./index.js";

let root: string;
let counter = 0;
const fixedNow = (): Date => new Date("2026-06-10T00:00:00Z");
const fixedUuid = (): string => {
  counter += 1;
  return `id-${counter}`;
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "phase-server-"));
  counter = 0;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const flow = (): FlowServer =>
  new FlowServer({ root, now: fixedNow, pid: () => 1234, uuid: fixedUuid });
const pipe = (): PipelineServer =>
  new PipelineServer({ root, now: fixedNow, pid: () => 1234, uuid: fixedUuid });
const phase = (): PhaseServer =>
  new PhaseServer({ root, now: fixedNow, pid: () => 1234, uuid: fixedUuid });

async function seedSinglePipeline(opts: {
  complexity?: "medium" | "high";
  suggested_phases?: string[];
} = {}): Promise<{ session_id: string; pipeline_id: string }> {
  const fs = flow();
  const a = await fs.lifecycle({ action: "start" });
  const session_id = a.state.session_id;
  const c = await pipe().create({
    session_id,
    description: "feature x",
    brief_content: "brief",
    complexity: opts.complexity ?? "medium",
    knowledge_unit: ["auth"],
    suggested_phases: opts.suggested_phases ?? ["01-discovery", "05-implement", "08-validate"],
    phase_selection_rationale: "minimal viable",
  });
  return { session_id, pipeline_id: c.pipeline_id };
}

describe("PhaseServer.start", () => {
  it("transitions phase to in_progress and updates flow pointer + state status", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    const r = await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    expect(r.status).toBe("in_progress");
    expect(r.flow_next.tool).toBe("opc_phase_confirm");

    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    expect(state.status).toBe("in_progress");
    expect(state.phases.find((p) => p.phase === "01-discovery")?.status).toBe("in_progress");

    const flowState = await loadFlowState(root, session_id);
    expect(flowState.current_step).toBe("phase_execution");
    expect(flowState.current_pipeline_pointer?.phase).toBe("01-discovery");
  });

  it("rejects phase not in phase_plan.selected (V0.4)", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await expect(
      phase().start({ session_id, pipeline_id, sub_pipeline_id: "sub-1", phase: "99-bogus" }),
    ).rejects.toThrow(/V0\.4/);
  });

  it("rejects when phase_plan.order_validated is false (V0.8)", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    state.phase_plan.order_validated = false;
    await saveStateJson(root, session_id, pipeline_id, state, fixedNow());
    await expect(
      phase().start({ session_id, pipeline_id, sub_pipeline_id: "sub-1", phase: "01-discovery" }),
    ).rejects.toThrow(/V0\.8/);
  });

  it("rejects when previous selected phase is not completed (V0.3)", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await expect(
      phase().start({ session_id, pipeline_id, sub_pipeline_id: "sub-1", phase: "05-implement" }),
    ).rejects.toThrow(/V0\.3/);
  });
});

describe("PhaseServer.complete", () => {
  it("auto_advance=true when not last phase, nodes done, complexity!=high", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    const r = await phase().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
      confirm_commit_ref: "abc123",
    });
    expect(r.auto_advance).toBe(true);
    expect(r.next_phase).toBe("05-implement");
    expect(r.flow_next.tool).toBe("opc_phase_start");
    expect(r.flow_next.why).toBe("auto_advance");

    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    expect(state.phases.find((p) => p.phase === "01-discovery")?.confirm_commit_ref).toBe("abc123");
  });

  it("auto_advance=false when complexity=high", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline({ complexity: "high" });
    await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    const r = await phase().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    expect(r.auto_advance).toBe(false);
    expect(r.flow_next.why).toMatch(/complexity=high/);
  });

  it("blocks completion when pending_reflections is non-empty", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    const f = await loadFlowState(root, session_id);
    f.pending_reflections.push({
      reflection_id: "rf-1",
      method: "method:peer-review",
      step_id: "step-1",
      target_artifact: "x.md",
      context_artifacts: [],
    });
    await saveFlowState(root, f, fixedNow());

    await expect(
      phase().complete({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "01-discovery",
      }),
    ).rejects.toThrow(/reflection-registry-guard/);
  });

  it("on last phase: marks sub completed and routes to pipeline_complete when no next sub", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline({
      suggested_phases: ["01-discovery"],
    });
    await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    const r = await phase().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    expect(r.next_phase).toBeNull();
    expect(r.flow_next.tool).toBe("opc_pipeline_lifecycle");
    const plan = await loadPipelinePlan(root, session_id, pipeline_id);
    expect(plan.sub_pipelines[0]?.status).toBe("completed");
  });

  it("on last phase: auto-resumes paused sub_pipeline", async () => {
    const fs = flow();
    const a = await fs.lifecycle({ action: "start" });
    const session_id = a.state.session_id;
    const c = await pipe().create({
      session_id,
      description: "x",
      brief_content: "b",
      complexity: "medium",
      knowledge_unit: [],
      suggested_phases: ["01-discovery"],
      phase_selection_rationale: "n/a",
      sub_pipelines: [
        { id: "main", title: "Main", knowledge_unit: [], suggested_phases: ["01-discovery"] },
        { id: "hot", title: "Hot", knowledge_unit: [], suggested_phases: ["01-discovery"] },
      ],
    });
    // simulate: main paused, hot has been running and is now finishing
    const plan = await loadPipelinePlan(root, session_id, c.pipeline_id);
    const main = plan.sub_pipelines.find((s) => s.id === "main");
    if (main) main.status = "paused";
    const hot = plan.sub_pipelines.find((s) => s.id === "hot");
    if (hot) hot.status = "in_progress";
    await savePipelinePlan(root, session_id, plan, fixedNow());

    await phase().start({
      session_id,
      pipeline_id: c.pipeline_id,
      sub_pipeline_id: "hot",
      phase: "01-discovery",
    });
    const r = await phase().complete({
      session_id,
      pipeline_id: c.pipeline_id,
      sub_pipeline_id: "hot",
      phase: "01-discovery",
    });
    expect(r.pipeline_progress.next_sub_pipeline?.id).toBe("main");
    expect(r.pipeline_progress.next_sub_pipeline?.resumed_from_paused).toBe(true);
    expect(r.flow_next.args?.sub_pipeline_id).toBe("main");
  });

  it("rejects complete from non in_progress phase", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await expect(
      phase().complete({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "01-discovery",
      }),
    ).rejects.toThrow(/cannot complete from status=pending/);
  });
});

describe("PhaseServer.reset", () => {
  it("resets target phase + downstream phases back to pending", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    await phase().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
      confirm_commit_ref: "c1",
    });
    await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
    });
    await phase().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      confirm_commit_ref: "c2",
    });

    const r = await phase().reset({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    expect(r.reset_phase).toBe("01-discovery");
    expect(r.reset_downstream).toEqual(["05-implement", "08-validate"]);
    expect(r.next_phase_status).toBe("pending");

    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    for (const ph of state.phases) {
      expect(ph.status).toBe("pending");
    }
  });

  it("rejects reset of phase not in phase_plan.selected", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await expect(
      phase().reset({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "99-bogus",
      }),
    ).rejects.toThrow(/not in phase_plan\.selected/);
  });

  it("PhaseValidationError class is exported and carries required_action", () => {
    const e = new PhaseValidationError("x", { required_action: "retry" });
    expect(e.name).toBe("PhaseValidationError");
    expect(e.required_action).toBe("retry");
  });

  it("V0.9: phase_start succeeds when all available phases exist on disk", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(`${root}/.opc/phases/01-discovery`, { recursive: true });
    mkdirSync(`${root}/.opc/phases/05-implement`, { recursive: true });
    mkdirSync(`${root}/.opc/phases/08-validate`, { recursive: true });

    const { session_id } = await seedSinglePipeline();
    const flow = await loadFlowState(root, session_id);
    flow.pending_reflections = [];
    const { saveFlowState } = await import("./flow-state.js");
    await saveFlowState(root, flow, fixedNow());

    const r = await phase().start({
      session_id,
      pipeline_id: "pl-id-1",
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    expect(r.status).toBe("in_progress");
  });

  it("V0.9: rejects when a phase in available is not on disk", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(`${root}/.opc/phases/01-discovery`, { recursive: true });
    // 05-implement and 08-validate are NOT on disk.

    const { session_id } = await seedSinglePipeline();
    const flow = await loadFlowState(root, session_id);
    flow.pending_reflections = [];
    const { saveFlowState } = await import("./flow-state.js");
    await saveFlowState(root, flow, fixedNow());

    await expect(
      phase().start({
        session_id,
        pipeline_id: "pl-id-1",
        sub_pipeline_id: "sub-1",
        phase: "01-discovery",
      }),
    ).rejects.toThrow(/V0.9/);
  });

  it("V0.9: scanOpcPhaseDirectories returns sorted phase dirs under .opc/phases/", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(`${root}/.opc/phases/03-design`, { recursive: true });
    mkdirSync(`${root}/.opc/phases/05-implement`, { recursive: true });
    mkdirSync(`${root}/.opc/phases/99-custom`, { recursive: true });

    const { scanOpcPhaseDirectories } = await import("./phase-server.js");
    const dirs = scanOpcPhaseDirectories(root);
    expect(dirs).toEqual(["03-design", "05-implement", "99-custom"]);
  });
});

describe("PhaseServer.confirm", () => {
  async function seedAndStart(): Promise<{ session_id: string; pipeline_id: string }> {
    const seed = await seedSinglePipeline();
    await phase().start({
      session_id: seed.session_id,
      pipeline_id: seed.pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    return seed;
  }

  async function seedNodes(
    session_id: string,
    pipeline_id: string,
    nodes: Array<{
      name: string;
      blocked_by?: string[];
      mode?: "parallel" | "sequential";
      output?: Array<{ knowledge: string; artifacts: string[] }>;
      input?: Array<{ knowledge: string }>;
    }>,
  ): Promise<void> {
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const ph = state.phases.find((p) => p.phase === "01-discovery");
    if (!ph) throw new Error("phase missing");
    ph.nodes = nodes.map((n) => ({
      name: n.name,
      status: "pending",
      agent: "test-agent",
      blocked_by: n.blocked_by ?? [],
      input: [],
      output: [],
      error: null,
      timeout_minutes: 5,
      retry_count: 0,
      max_retries: 1,
      mode: n.mode ?? "parallel",
      node_input: n.input ?? [],
      node_output: n.output ?? [],
    }));
    await saveStateJson(root, session_id, pipeline_id, state, fixedNow());
  }

  it("locks execution plan and routes to opc_node_start (first group, first node)", async () => {
    const { session_id, pipeline_id } = await seedAndStart();
    await seedNodes(session_id, pipeline_id, [
      { name: "n1", output: [{ knowledge: "k1", artifacts: ["a1.md"] }] },
      { name: "n2", input: [{ knowledge: "k1" }], output: [{ knowledge: "k2", artifacts: ["a2.md"] }] },
    ]);

    const r = await phase().confirm({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    expect(r.status).toBe("confirmed");
    expect(r.groups.length).toBe(2);
    expect(r.groups[0]?.nodes).toEqual(["n1"]);
    expect(r.groups[1]?.nodes).toEqual(["n2"]);
    expect(r.flow_next.tool).toBe("opc_node_start");
    expect(r.flow_next.args?.node_name).toBe("n1");

    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const n2 = state.phases.find((p) => p.phase === "01-discovery")?.nodes.find((n) => n.name === "n2");
    expect(n2?.blocked_by).toEqual(["n1"]);

    const flowState = await loadFlowState(root, session_id);
    expect(flowState.current_step).toBe("phase_confirmed");
    const last = flowState.history[flowState.history.length - 1];
    expect(last?.tool).toBe("opc_phase_confirm");
  });

  it("rejects when phase is not in_progress", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await expect(
      phase().confirm({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "01-discovery",
      }),
    ).rejects.toThrow(/cannot confirm from status=pending/);
  });

  it("rejects when pending_reflections is non-empty (registry-guard)", async () => {
    const { session_id, pipeline_id } = await seedAndStart();
    const f = await loadFlowState(root, session_id);
    f.pending_reflections.push({
      reflection_id: "rf-9",
      method: "method:peer-review",
      step_id: "step-1",
      target_artifact: "x.md",
      context_artifacts: [],
    });
    await saveFlowState(root, f, fixedNow());

    await expect(
      phase().confirm({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "01-discovery",
      }),
    ).rejects.toThrow(/reflection-registry-guard/);
  });

  it("rejects when pending_user_question is set (pending-question-guard)", async () => {
    const { session_id, pipeline_id } = await seedAndStart();
    const f = await loadFlowState(root, session_id);
    f.pending_user_question = {
      question_id: "q-1",
      asked_at: fixedNow().toISOString(),
      tool: "opc_phase_confirm",
      blocking: true,
      question: "?",
      options: [],
    };
    await saveFlowState(root, f, fixedNow());

    await expect(
      phase().confirm({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "01-discovery",
      }),
    ).rejects.toThrow(/pending-question-guard/);
  });

  it("records confirm_commit_ref when provided", async () => {
    const { session_id, pipeline_id } = await seedAndStart();
    await seedNodes(session_id, pipeline_id, [{ name: "only" }]);
    const r = await phase().confirm({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
      confirm_commit_ref: "deadbeef",
    });
    expect(r.confirm_commit_ref).toBe("deadbeef");
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    expect(state.phases.find((p) => p.phase === "01-discovery")?.confirm_commit_ref).toBe("deadbeef");
  });

  it("applies node overrides (blocked_by) before resolver runs", async () => {
    const { session_id, pipeline_id } = await seedAndStart();
    await seedNodes(session_id, pipeline_id, [{ name: "a" }, { name: "b" }]);
    const r = await phase().confirm({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
      nodes: [
        { name: "a" },
        { name: "b", blocked_by: ["a"] },
      ],
    });
    expect(r.groups.length).toBeGreaterThanOrEqual(1);
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const ph = state.phases.find((p) => p.phase === "01-discovery");
    const b = ph?.nodes.find((n) => n.name === "b");
    expect(b?.blocked_by).toContain("a");
  });

  it("rejects override with unknown node name", async () => {
    const { session_id, pipeline_id } = await seedAndStart();
    await seedNodes(session_id, pipeline_id, [{ name: "a" }]);
    await expect(
      phase().confirm({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "01-discovery",
        nodes: [{ name: "ghost", blocked_by: [] }],
      }),
    ).rejects.toThrow(/node ghost not found/);
  });

  it("routes to opc_phase_complete when phase has no nodes", async () => {
    const { session_id, pipeline_id } = await seedAndStart();
    const r = await phase().confirm({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    expect(r.groups).toEqual([]);
    expect(r.flow_next.tool).toBe("opc_phase_complete");
  });
});

describe("M18.f validator artifact writer (phase_completion)", () => {
  it("happy path: complete() writes .opc/logs/validator/<session>/phase_completion-1.json with l1=pass", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    await phase().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    const path = join(root, ".opc/logs/validator", session_id, "phase_completion-1.json");
    const { readFile } = await import("node:fs/promises");
    const art = JSON.parse(await readFile(path, "utf8")) as {
      step: string;
      validator_results: Record<string, string>;
      failure_reasons?: string[];
      ran_by: string;
    };
    expect(art.step).toBe("phase_completion");
    expect(art.ran_by).toBe("state-manager");
    expect(art.validator_results.l1).toBe("pass");
    expect(art.failure_reasons).toBeUndefined();
  });

  it("incomplete nodes: writes l1=fail with failure_reasons enumerating incomplete nodes", async () => {
    const { session_id, pipeline_id } = await seedSinglePipeline();
    await phase().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    // inject an incomplete node directly so phase.complete sees allNodesDone=false
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const ph = state.phases.find((p) => p.phase === "01-discovery")!;
    ph.nodes.push({
      name: "lingering",
      status: "in_progress",
      agent: "coder",
      blocked_by: [],
      input: [],
      output: [],
      error: null,
      timeout_minutes: 30,
      retry_count: 0,
      max_retries: 3,
    });
    await saveStateJson(root, session_id, pipeline_id, state, new Date("2026-06-10T00:00:00Z"));
    await phase().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "01-discovery",
    });
    const path = join(root, ".opc/logs/validator", session_id, "phase_completion-1.json");
    const { readFile } = await import("node:fs/promises");
    const art = JSON.parse(await readFile(path, "utf8")) as {
      validator_results: Record<string, string>;
      failure_reasons: string[];
    };
    expect(art.validator_results.l1).toBe("fail");
    expect(art.failure_reasons.some((r) => r.includes("lingering(in_progress)"))).toBe(true);
  });
});
