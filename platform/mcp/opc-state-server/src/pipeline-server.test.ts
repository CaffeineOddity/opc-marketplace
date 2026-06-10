import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FlowServer,
  PipelineServer,
  PipelineConflictError,
  KitNotLoadedPreFlightError,
  INSTALLED_KITS_FILENAME,
  computeNextSubPipeline,
  generateExecutionOrder,
  loadPipelinePlan,
  loadStateJson,
  TopologyError,
  validateDag,
  validateExecutionOrder,
} from "./index.js";
import { writeFile } from "node:fs/promises";

let root: string;
let counter = 0;
const fixedNow = (): Date => new Date("2026-06-10T00:00:00Z");
const fixedUuid = (): string => {
  counter += 1;
  return `id-${counter}`;
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pipeline-server-"));
  counter = 0;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const flow = (): FlowServer =>
  new FlowServer({ root, now: fixedNow, pid: () => 1234, uuid: fixedUuid });
const pipe = (): PipelineServer =>
  new PipelineServer({ root, now: fixedNow, pid: () => 1234, uuid: fixedUuid });

async function freshSession(): Promise<string> {
  const fs = flow();
  const a = await fs.lifecycle({ action: "start" });
  return a.state.session_id;
}

describe("topology", () => {
  it("validateDag accepts a clean DAG", () => {
    validateDag({
      sub_pipelines: [
        {
          id: "a",
          title: "A",
          knowledge_unit: [],
          status: "pending",
          blocked_by: [],
        },
        {
          id: "b",
          title: "B",
          knowledge_unit: [],
          status: "pending",
          blocked_by: ["a"],
        },
      ],
    });
  });

  it("validateDag rejects unknown blocked_by reference", () => {
    expect(() =>
      validateDag({
        sub_pipelines: [
          { id: "a", title: "A", knowledge_unit: [], status: "pending", blocked_by: ["ghost"] },
        ],
      }),
    ).toThrow(TopologyError);
  });

  it("validateDag detects cycles", () => {
    expect(() =>
      validateDag({
        sub_pipelines: [
          { id: "a", title: "A", knowledge_unit: [], status: "pending", blocked_by: ["b"] },
          { id: "b", title: "B", knowledge_unit: [], status: "pending", blocked_by: ["a"] },
        ],
      }),
    ).toThrow(/cycle detected/);
  });

  it("generateExecutionOrder produces layered groups", () => {
    const order = generateExecutionOrder({
      sub_pipelines: [
        { id: "a", title: "A", knowledge_unit: [], status: "pending", blocked_by: [] },
        { id: "b", title: "B", knowledge_unit: [], status: "pending", blocked_by: ["a"] },
        { id: "c", title: "C", knowledge_unit: [], status: "pending", blocked_by: ["a"] },
        { id: "d", title: "D", knowledge_unit: [], status: "pending", blocked_by: ["b", "c"] },
      ],
    });
    expect(order).toEqual([
      { group: 0, sub_pipeline_ids: ["a"] },
      { group: 1, sub_pipeline_ids: ["b", "c"] },
      { group: 2, sub_pipeline_ids: ["d"] },
    ]);
  });

  it("validateExecutionOrder rejects missing sub", () => {
    expect(() =>
      validateExecutionOrder(
        {
          sub_pipelines: [
            { id: "a", title: "A", knowledge_unit: [], status: "pending", blocked_by: [] },
            { id: "b", title: "B", knowledge_unit: [], status: "pending", blocked_by: [] },
          ],
        },
        [{ group: 0, sub_pipeline_ids: ["a"] }],
      ),
    ).toThrow(/missing sub/);
  });

  it("computeNextSubPipeline picks first ready sub in earliest non-completed group", () => {
    const subs = [
      { id: "a", title: "A", knowledge_unit: [], status: "completed" as const, blocked_by: [] },
      {
        id: "b",
        title: "B",
        knowledge_unit: [],
        status: "pending" as const,
        blocked_by: ["a"],
      },
      {
        id: "c",
        title: "C",
        knowledge_unit: [],
        status: "pending" as const,
        blocked_by: ["a"],
      },
    ];
    const order = [
      { group: 0, sub_pipeline_ids: ["a"] },
      { group: 1, sub_pipeline_ids: ["b", "c"] },
    ];
    const next = computeNextSubPipeline(subs, order);
    expect(next?.id).toBe("b");
  });
});

describe("PipelineServer.create", () => {
  it("creates single-sub pipeline by default", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const r = await p.create({
      session_id,
      description: "build login form",
      brief_content: "# Brief\nbuild it",
      complexity: "medium",
      knowledge_unit: ["auth"],
      suggested_phases: ["01-discovery", "05-implement"],
      phase_selection_rationale: "minimal",
    });
    expect(r.pipeline_id).toMatch(/^pl-/);
    expect(r.plan.sub_pipelines.length).toBe(1);
    expect(r.plan.execution_order).toEqual([{ group: 0, sub_pipeline_ids: ["sub-1"] }]);
    expect(r.flow_next.tool).toBe("opc_phase_start");
    const brief = await readFile(
      join(
        root,
        ".opc/sessions",
        session_id,
        "pipelines",
        r.pipeline_id,
        "sub-pipelines/sub-1/brief.md",
      ),
      "utf8",
    );
    expect(brief).toContain("build it");
    const state = await loadStateJson(root, session_id, r.pipeline_id, "sub-1");
    expect(state.phase_plan.selected).toEqual(["01-discovery", "05-implement"]);
  });

  it("creates multi-sub pipeline with explicit blocked_by and auto-orders", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const r = await p.create({
      session_id,
      description: "fullstack feature",
      brief_content: "brief",
      complexity: "high",
      knowledge_unit: ["auth", "billing"],
      suggested_phases: ["05-implement"],
      phase_selection_rationale: "ok",
      sub_pipelines: [
        { id: "back", title: "backend", knowledge_unit: ["auth"] },
        { id: "front", title: "frontend", knowledge_unit: ["billing"], blocked_by: ["back"] },
      ],
    });
    expect(r.plan.execution_order).toEqual([
      { group: 0, sub_pipeline_ids: ["back"] },
      { group: 1, sub_pipeline_ids: ["front"] },
    ]);
    expect(r.flow_next.args).toEqual({ pipeline_id: r.pipeline_id, sub_pipeline_id: "back" });
  });

  it("updates flow-state pipeline_id and current_step", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const r = await p.create({
      session_id,
      description: "x",
      brief_content: "b",
      complexity: "medium",
      knowledge_unit: [],
      suggested_phases: [],
      phase_selection_rationale: "n/a",
    });
    const reloaded = await flow().query({ session_id });
    expect(reloaded.state.pipeline_id).toBe(r.pipeline_id);
    expect(reloaded.state.current_step).toBe("pipeline_execution");
  });

  it("rejects cyclic blocked_by", async () => {
    const session_id = await freshSession();
    const p = pipe();
    await expect(
      p.create({
        session_id,
        description: "x",
        brief_content: "b",
        complexity: "medium",
        knowledge_unit: [],
        suggested_phases: [],
        phase_selection_rationale: "n/a",
        sub_pipelines: [
          { id: "a", title: "A", knowledge_unit: [], blocked_by: ["b"] },
          { id: "b", title: "B", knowledge_unit: [], blocked_by: ["a"] },
        ],
      }),
    ).rejects.toThrow(/cycle/);
  });
});

describe("PipelineServer.status", () => {
  it("aggregates status and lists blocked subs", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const c = await p.create({
      session_id,
      description: "x",
      brief_content: "b",
      complexity: "medium",
      knowledge_unit: [],
      suggested_phases: [],
      phase_selection_rationale: "n/a",
      sub_pipelines: [
        { id: "a", title: "A", knowledge_unit: [] },
        { id: "b", title: "B", knowledge_unit: [], blocked_by: ["a"] },
      ],
    });
    const s = await p.status({ session_id, pipeline_id: c.pipeline_id });
    expect(s.status).toBe("pending");
    expect(s.next_sub_pipeline?.id).toBe("a");
    expect(s.blocked_sub_pipelines).toEqual([{ id: "b", waiting_for: ["a"] }]);
  });

  it("returns sub view when sub_pipeline_id is provided", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const c = await p.create({
      session_id,
      description: "x",
      brief_content: "b",
      complexity: "medium",
      knowledge_unit: [],
      suggested_phases: [],
      phase_selection_rationale: "n/a",
    });
    const s = await p.status({
      session_id,
      pipeline_id: c.pipeline_id,
      sub_pipeline_id: "sub-1",
    });
    expect(s.sub?.id).toBe("sub-1");
  });
});

describe("PipelineServer.replan add_sub_pipeline", () => {
  it("appends a normal sub and records replan_history", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const c = await p.create({
      session_id,
      description: "x",
      brief_content: "b",
      complexity: "medium",
      knowledge_unit: [],
      suggested_phases: [],
      phase_selection_rationale: "n/a",
    });
    const r = await p.replan({
      session_id,
      pipeline_id: c.pipeline_id,
      reason: "user asked for extra task",
      changes: {
        add_sub_pipeline: [{ id: "extra", title: "Extra", knowledge_unit: ["logging"] }],
      },
    });
    const plan = await loadPipelinePlan(root, session_id, c.pipeline_id);
    expect(plan.sub_pipelines.find((s) => s.id === "extra")?.execution_priority).toBe("normal");
    expect(plan.replan_history.length).toBe(1);
    expect(r.applied_changes).toBeTruthy();
    expect(r.rejected_changes).toEqual([]);
  });

  it("rejects immediate insertion when no in_progress sub exists", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const c = await p.create({
      session_id,
      description: "x",
      brief_content: "b",
      complexity: "medium",
      knowledge_unit: [],
      suggested_phases: [],
      phase_selection_rationale: "n/a",
    });
    const r = await p.replan({
      session_id,
      pipeline_id: c.pipeline_id,
      changes: {
        add_sub_pipeline: [
          {
            id: "hot",
            title: "Hot",
            knowledge_unit: ["auth"],
            execution_priority: "immediate",
          },
        ],
      },
    });
    expect(r.rejected_changes.length).toBe(1);
  });

  it("rejects immediate insertion on knowledge_unit overlap", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const c = await p.create({
      session_id,
      description: "x",
      brief_content: "b",
      complexity: "medium",
      knowledge_unit: ["auth"],
      suggested_phases: [],
      phase_selection_rationale: "n/a",
      sub_pipelines: [{ id: "current", title: "cur", knowledge_unit: ["auth"] }],
    });
    // simulate current sub starting
    const plan = await loadPipelinePlan(root, session_id, c.pipeline_id);
    plan.sub_pipelines[0]!.status = "in_progress";
    const { savePipelinePlan } = await import("./pipeline-plan.js");
    await savePipelinePlan(root, session_id, plan, fixedNow());

    const r = await p.replan({
      session_id,
      pipeline_id: c.pipeline_id,
      changes: {
        add_sub_pipeline: [
          {
            id: "hot",
            title: "Hot",
            knowledge_unit: ["auth"],
            execution_priority: "immediate",
          },
        ],
      },
    });
    expect(r.rejected_changes.length).toBe(1);
    const reason = (r.rejected_changes[0] as { reason: string }).reason;
    expect(reason).toMatch(/overlap/);
  });

  it("accepts immediate insertion when no knowledge overlap and current is in_progress", async () => {
    const session_id = await freshSession();
    const p = pipe();
    const c = await p.create({
      session_id,
      description: "x",
      brief_content: "b",
      complexity: "medium",
      knowledge_unit: ["auth"],
      suggested_phases: [],
      phase_selection_rationale: "n/a",
      sub_pipelines: [{ id: "current", title: "cur", knowledge_unit: ["auth"] }],
    });
    const plan = await loadPipelinePlan(root, session_id, c.pipeline_id);
    plan.sub_pipelines[0]!.status = "in_progress";
    const { savePipelinePlan } = await import("./pipeline-plan.js");
    await savePipelinePlan(root, session_id, plan, fixedNow());

    const r = await p.replan({
      session_id,
      pipeline_id: c.pipeline_id,
      changes: {
        add_sub_pipeline: [
          {
            id: "hot",
            title: "Hot",
            knowledge_unit: ["logging"],
            execution_priority: "immediate",
          },
        ],
      },
    });
    expect(r.rejected_changes).toEqual([]);
    const finalPlan = await loadPipelinePlan(root, session_id, c.pipeline_id);
    const inserted = finalPlan.sub_pipelines.find((s) => s.id === "hot");
    expect(inserted?.execution_priority).toBe("immediate");
    expect(inserted?.inserted_at).toBe(fixedNow().toISOString());
  });

  it("PipelineConflictError class is exported", () => {
    expect(new PipelineConflictError("x").name).toBe("PipelineConflictError");
  });
});

describe("PipelineServer.create A4 kit-loaded pre-flight gate", () => {
  const baseReq = (session_id: string) => ({
    session_id,
    description: "feature x",
    brief_content: "brief",
    complexity: "medium" as const,
    knowledge_unit: ["x"],
    suggested_phases: ["01-discovery"],
    phase_selection_rationale: "minimal",
  });

  async function writeKits(payload: unknown): Promise<void> {
    await writeFile(join(root, INSTALLED_KITS_FILENAME), JSON.stringify(payload));
  }

  it("does NOT reject when required_agents is omitted (back-compat)", async () => {
    const session_id = await freshSession();
    await writeKits({
      kits: [
        { name: "fresh", agents: ["x"], installed_at: "2026-06-10T05:00:00Z" },
      ],
    });
    const r = await pipe().create(baseReq(session_id));
    expect(r.pipeline_id).toMatch(/^pl-/);
  });

  it("does NOT reject when required_agents do NOT intersect not-loaded kits", async () => {
    const session_id = await freshSession();
    await writeKits({
      kits: [
        { name: "fresh", agents: ["x"], installed_at: "2026-06-10T05:00:00Z" },
      ],
    });
    const r = await pipe().create({
      ...baseReq(session_id),
      required_agents: ["other-agent"],
    });
    expect(r.pipeline_id).toMatch(/^pl-/);
  });

  it("does NOT reject when kit was installed BEFORE session start", async () => {
    const session_id = await freshSession();
    await writeKits({
      kits: [
        { name: "old", agents: ["x"], installed_at: "2026-06-09T00:00:00Z" },
      ],
    });
    const r = await pipe().create({
      ...baseReq(session_id),
      required_agents: ["x"],
    });
    expect(r.pipeline_id).toMatch(/^pl-/);
  });

  it("REJECTS with KitNotLoadedPreFlightError when required_agent ∈ not-loaded kit", async () => {
    const session_id = await freshSession();
    await writeKits({
      kits: [
        {
          name: "backend-pro",
          agents: ["backend-engineer", "api-designer"],
          installed_at: "2026-06-10T05:00:00Z",
        },
      ],
    });
    let caught: unknown = null;
    try {
      await pipe().create({
        ...baseReq(session_id),
        required_agents: ["backend-engineer"],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(KitNotLoadedPreFlightError);
    const e = caught as KitNotLoadedPreFlightError;
    expect(e.code).toBe("KIT_NOT_LOADED_PRE_FLIGHT");
    expect(e.required_agents).toEqual(["backend-engineer"]);
    expect(e.affected_kits).toEqual(["backend-pro"]);
    expect(e.remediation).toContain("Exit current `claude` session");
  });

  it("REJECTS reports only the intersection of required_agents and not-loaded kits", async () => {
    const session_id = await freshSession();
    await writeKits({
      kits: [
        { name: "k1", agents: ["a", "b"], installed_at: "2026-06-10T05:00:00Z" },
        { name: "k2", agents: ["c"], installed_at: "2026-06-09T00:00:00Z" },
      ],
    });
    try {
      await pipe().create({
        ...baseReq(session_id),
        required_agents: ["a", "c", "z"],
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(KitNotLoadedPreFlightError);
      const e = err as KitNotLoadedPreFlightError;
      expect(e.required_agents).toEqual(["a"]);
      expect(e.affected_kits).toEqual(["k1"]);
    }
  });

  it("does NOT reject when installed-kits.json is absent", async () => {
    const session_id = await freshSession();
    const r = await pipe().create({
      ...baseReq(session_id),
      required_agents: ["anything"],
    });
    expect(r.pipeline_id).toMatch(/^pl-/);
  });

  it("KitNotLoadedPreFlightError class is exported and shaped", () => {
    const e = new KitNotLoadedPreFlightError(["x"], ["k"]);
    expect(e.name).toBe("KitNotLoadedPreFlightError");
    expect(e.code).toBe("KIT_NOT_LOADED_PRE_FLIGHT");
    expect(e.message).toContain("KIT_NOT_LOADED_PRE_FLIGHT");
  });
});
