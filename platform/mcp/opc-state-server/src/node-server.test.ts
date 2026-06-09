import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FlowServer,
  NodeResolverError,
  NodeServer,
  NodeValidationError,
  PhaseServer,
  PipelineServer,
  computeNextNode,
  computeUnblockedNodes,
  loadFlowState,
  loadStateJson,
  resolveNodes,
  saveFlowState,
  saveStateJson,
  type NodeDefinition,
  type ResolvedNodeStatus,
} from "./index.js";

let root: string;
let counter = 0;
const fixedNow = (): Date => new Date("2026-06-10T00:00:00Z");
const fixedUuid = (): string => {
  counter += 1;
  return `id-${counter}`;
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "node-server-"));
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
const node = (): NodeServer =>
  new NodeServer({ root, now: fixedNow, pid: () => 1234, uuid: fixedUuid });

const def = (overrides: Partial<NodeDefinition> & { name: string }): NodeDefinition => ({
  phase: "05-implement",
  description: overrides.description ?? "",
  tags: overrides.tags ?? [],
  mode: overrides.mode ?? "sequential",
  agents: overrides.agents ?? { primary: ["coder"] },
  ...overrides,
});

describe("node-resolver", () => {
  it("auto-derives blocked_by from knowledge match", () => {
    const plan = resolveNodes([
      def({
        name: "design",
        output: [{ artifacts: ["docs/design.md"], knowledge: "k-design" }],
      }),
      def({
        name: "implement",
        input: [{ knowledge: "k-design" }],
        output: [{ artifacts: ["src/impl.ts"], knowledge: "k-impl" }],
      }),
    ]);
    expect(plan.nodes.find((n) => n.name === "implement")?.blocked_by).toEqual(["design"]);
    expect(plan.groups).toEqual([
      { group: 0, nodes: ["design"], parallel: false },
      { group: 1, nodes: ["implement"], parallel: false },
    ]);
  });

  it("marks layer parallel when all nodes are mode=parallel + no file overlap", () => {
    const plan = resolveNodes([
      def({
        name: "frontend",
        mode: "parallel",
        output: [{ artifacts: ["src/ui/"], knowledge: "k-ui" }],
      }),
      def({
        name: "backend",
        mode: "parallel",
        output: [{ artifacts: ["src/api/"], knowledge: "k-api" }],
      }),
    ]);
    expect(plan.groups[0]?.parallel).toBe(true);
  });

  it("demotes layer to sequential on artifact path overlap", () => {
    const plan = resolveNodes([
      def({
        name: "a",
        mode: "parallel",
        output: [{ artifacts: ["src/shared/"], knowledge: "k-a" }],
      }),
      def({
        name: "b",
        mode: "parallel",
        output: [{ artifacts: ["src/shared/util.ts"], knowledge: "k-b" }],
      }),
    ]);
    expect(plan.groups[0]?.parallel).toBe(false);
    expect(plan.groups[0]?.demoted_reason).toMatch(/file-domain overlap/);
  });

  it("detects cycles in knowledge graph", () => {
    expect(() =>
      resolveNodes([
        def({
          name: "a",
          input: [{ knowledge: "k-b" }],
          output: [{ artifacts: [], knowledge: "k-a" }],
        }),
        def({
          name: "b",
          input: [{ knowledge: "k-a" }],
          output: [{ artifacts: [], knowledge: "k-b" }],
        }),
      ]),
    ).toThrow(NodeResolverError);
  });

  it("computeUnblockedNodes returns ready nodes", () => {
    const plan = resolveNodes([
      def({ name: "a", output: [{ artifacts: [], knowledge: "k-a" }] }),
      def({
        name: "b",
        input: [{ knowledge: "k-a" }],
        output: [{ artifacts: [], knowledge: "k-b" }],
      }),
    ]);
    const status = new Map<string, ResolvedNodeStatus["status"]>([
      ["a", "completed"],
      ["b", "pending"],
    ]);
    expect(computeUnblockedNodes(plan, status)).toEqual(["b"]);
  });

  it("computeNextNode picks first ready in earliest non-completed group", () => {
    const plan = resolveNodes([
      def({ name: "a", output: [{ artifacts: [], knowledge: "k-a" }] }),
      def({
        name: "b",
        input: [{ knowledge: "k-a" }],
        output: [{ artifacts: [], knowledge: "k-b" }],
      }),
    ]);
    const status = new Map<string, ResolvedNodeStatus["status"]>([
      ["a", "completed"],
      ["b", "ready"],
    ]);
    expect(computeNextNode(plan, status)?.name).toBe("b");
  });
});

async function seed(): Promise<{ session_id: string; pipeline_id: string }> {
  const fs = flow();
  const a = await fs.lifecycle({ action: "start" });
  const session_id = a.state.session_id;
  const c = await pipe().create({
    session_id,
    description: "feature",
    brief_content: "brief",
    complexity: "medium",
    knowledge_unit: ["auth"],
    suggested_phases: ["05-implement"],
    phase_selection_rationale: "minimal",
  });
  await phase().start({
    session_id,
    pipeline_id: c.pipeline_id,
    sub_pipeline_id: "sub-1",
    phase: "05-implement",
  });
  return { session_id, pipeline_id: c.pipeline_id };
}

describe("NodeServer.start", () => {
  it("materializes node from definition and transitions to in_progress", async () => {
    const { session_id, pipeline_id } = await seed();
    const r = await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "implement",
      node_definition: def({
        name: "implement",
        agents: { primary: ["backend-coder"] },
        body: "do the thing",
      }),
    });
    expect(r.status).toBe("in_progress");
    expect(r.agent).toBe("backend-coder");
    expect(r.dispatch_instruction.subagent_type).toBe("backend-coder");
    expect(r.dispatch_instruction.node_body).toBe("do the thing");
    expect(r.flow_next.tool).toBe("opc_node_complete");

    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const p = state.phases.find((x) => x.phase === "05-implement");
    expect(p?.nodes.find((n) => n.name === "implement")?.status).toBe("in_progress");

    const f = await loadFlowState(root, session_id);
    expect(f.current_pipeline_pointer?.node).toBe("implement");
  });

  it("registry-guard rejects when pending_reflections is non-empty", async () => {
    const { session_id, pipeline_id } = await seed();
    const f = await loadFlowState(root, session_id);
    f.pending_reflections.push({
      reflection_id: "rf-1",
      method: "m",
      step_id: "s",
      target_artifact: "x.md",
      context_artifacts: [],
    });
    await saveFlowState(root, f, fixedNow());
    await expect(
      node().start({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "implement",
        node_definition: def({ name: "implement" }),
      }),
    ).rejects.toThrow(/reflection-registry-guard/);
  });

  it("rejects when blocked_by is unsatisfied", async () => {
    const { session_id, pipeline_id } = await seed();
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const p = state.phases.find((x) => x.phase === "05-implement");
    p?.nodes.push({
      name: "a",
      status: "pending",
      agent: "coder",
      blocked_by: [],
      input: [],
      output: [],
      error: null,
      timeout_minutes: 30,
      retry_count: 0,
      max_retries: 3,
    });
    p?.nodes.push({
      name: "b",
      status: "pending",
      agent: "coder",
      blocked_by: ["a"],
      input: [],
      output: [],
      error: null,
      timeout_minutes: 30,
      retry_count: 0,
      max_retries: 3,
    });
    await saveStateJson(root, session_id, pipeline_id, state, fixedNow());
    await expect(
      node().start({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "b",
      }),
    ).rejects.toThrow(/blocked_by not satisfied/);
  });

  it("rejects L0 min_version when input.version below threshold", async () => {
    const { session_id, pipeline_id } = await seed();
    await expect(
      node().start({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "x",
        node_definition: def({
          name: "x",
          input: [{ knowledge: "k-foo", min_version: 3 }],
        }),
        input_knowledge: [{ path: "k-foo", version: 2 }],
      }),
    ).rejects.toThrow(/L0/);
  });
});

describe("NodeServer.complete", () => {
  it("L1: rejects when declared output.artifact is missing", async () => {
    const { session_id, pipeline_id } = await seed();
    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      node_definition: def({
        name: "x",
        output: [{ artifacts: ["src/x.ts"], knowledge: "k-x" }],
      }),
    });
    await expect(
      node().complete({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "x",
        knowledge_index_has: ["k-x"],
      }),
    ).rejects.toThrow(/L1: declared output\.artifact src\/x\.ts/);
  });

  it("L1: rejects when declared output.knowledge is missing from index", async () => {
    const { session_id, pipeline_id } = await seed();
    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      node_definition: def({
        name: "x",
        output: [{ artifacts: ["src/x.ts"], knowledge: "k-x" }],
      }),
    });
    await expect(
      node().complete({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "x",
        artifacts_exist: ["src/x.ts"],
      }),
    ).rejects.toThrow(/L1: declared output\.knowledge k-x/);
  });

  it("L2 test_pass: rejects when evidence.test_results.failed > 0", async () => {
    const { session_id, pipeline_id } = await seed();
    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      node_definition: def({ name: "x", quality_gates: ["test_pass"] }),
    });
    await expect(
      node().complete({
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "x",
        evidence: { test_results: { passed: 1, failed: 2 } },
      }),
    ).rejects.toThrow(/L2: test_pass/);
  });

  it("happy path: completes node, computes unblocked, routes to opc_phase_complete when phase done", async () => {
    const { session_id, pipeline_id } = await seed();
    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      node_definition: def({ name: "x" }),
    });
    const r = await node().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      evidence: { artifacts_written: [] },
    });
    expect(r.status).toBe("completed");
    expect(r.flow_next.tool).toBe("opc_phase_complete");
  });

  it("routes to next unblocked node when phase has more work", async () => {
    const { session_id, pipeline_id } = await seed();
    // Seed two nodes a -> b
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const p = state.phases.find((x) => x.phase === "05-implement")!;
    p.nodes.push(
      {
        name: "a",
        status: "ready",
        agent: "coder",
        blocked_by: [],
        input: [],
        output: [],
        error: null,
        timeout_minutes: 30,
        retry_count: 0,
        max_retries: 3,
      },
      {
        name: "b",
        status: "pending",
        agent: "coder",
        blocked_by: ["a"],
        input: [],
        output: [],
        error: null,
        timeout_minutes: 30,
        retry_count: 0,
        max_retries: 3,
      },
    );
    await saveStateJson(root, session_id, pipeline_id, state, fixedNow());

    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "a",
    });
    const r = await node().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "a",
    });
    expect(r.unblocked_nodes).toEqual(["b"]);
    expect(r.flow_next.tool).toBe("opc_node_start");
    expect(r.flow_next.args?.node_name).toBe("b");
  });

  it("NodeValidationError class is exported and carries required_action", () => {
    const e = new NodeValidationError("x", { required_action: "opc_flow_reflect" });
    expect(e.name).toBe("NodeValidationError");
    expect(e.required_action).toBe("opc_flow_reflect");
  });
});
