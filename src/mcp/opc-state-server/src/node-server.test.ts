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
    expect(r.flow_next.tool).toBe("opc_node_finish");

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

describe("NodeServer.finish (M17.c discriminator facade)", () => {
  async function startNode(): Promise<{ session_id: string; pipeline_id: string }> {
    const { session_id, pipeline_id } = await seed();
    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      node_definition: def({ name: "x" }),
    });
    return { session_id, pipeline_id };
  }

  it("finish(success) delegates to complete() and tags node_status=completed", async () => {
    const { session_id, pipeline_id } = await startNode();
    const r = await node().finish({
      status: "success",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
    });
    expect(r.status).toBe("success");
    if (r.status === "success") {
      expect(r.node_status).toBe("completed");
      expect(r.flow_next.tool).toMatch(/opc_(node_start|phase_complete|flow_query)/);
    }
  });

  it("finish(failed) records error, increments retry_count, retry_available=true under budget", async () => {
    const { session_id, pipeline_id } = await startNode();
    const r = await node().finish({
      status: "failed",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      error: { message: "boom", type: "RuntimeError" },
    });
    expect(r.status).toBe("failed");
    if (r.status === "failed") {
      expect(r.retry_count).toBe(1);
      expect(r.max_retries).toBe(3);
      expect(r.retry_available).toBe(true);
      expect(r.flow_next.tool).toBe("opc_node_finish");
      expect(r.flow_next.args?.status).toBe("retry");
    }
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const nd = state.phases
      .find((p) => p.phase === "05-implement")!
      .nodes.find((n) => n.name === "x");
    expect(nd?.status).toBe("failed");
    expect(nd?.error?.message).toBe("boom");
  });

  it("finish(failed) escalates to opc_flow_query when retry budget exhausted", async () => {
    const { session_id, pipeline_id } = await startNode();
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const nd = state.phases
      .find((p) => p.phase === "05-implement")!
      .nodes.find((n) => n.name === "x")!;
    nd.retry_count = 2;
    nd.max_retries = 3;
    await saveStateJson(root, session_id, pipeline_id, state, fixedNow());

    const r = await node().finish({
      status: "failed",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      error: { message: "boom", type: "RuntimeError" },
    });
    if (r.status === "failed") {
      expect(r.retry_available).toBe(false);
      expect(r.flow_next.tool).toBe("opc_flow_query");
    }
  });

  it("finish(retry) resets a failed node to ready, default reset_retry_count=true clears budget", async () => {
    const { session_id, pipeline_id } = await startNode();
    await node().finish({
      status: "failed",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      error: { message: "boom", type: "RuntimeError" },
    });
    const r = await node().finish({
      status: "retry",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
    });
    if (r.status === "retry") {
      expect(r.node_status).toBe("ready");
      expect(r.retry_count).toBe(0);
      expect(r.flow_next.tool).toBe("opc_node_start");
    }
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const nd = state.phases
      .find((p) => p.phase === "05-implement")!
      .nodes.find((n) => n.name === "x");
    expect(nd?.status).toBe("ready");
    expect(nd?.error).toBeNull();
  });

  it("finish(retry) with reset_retry_count=false preserves the count", async () => {
    const { session_id, pipeline_id } = await startNode();
    await node().finish({
      status: "failed",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      error: { message: "boom", type: "RuntimeError" },
    });
    const r = await node().finish({
      status: "retry",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      reset_retry_count: false,
    });
    if (r.status === "retry") {
      expect(r.retry_count).toBe(1);
    }
  });

  it("finish(retry) cascades downstream completed nodes back to pending", async () => {
    const { session_id, pipeline_id } = await seed();
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const ph = state.phases.find((p) => p.phase === "05-implement")!;
    ph.nodes.push(
      {
        name: "a",
        status: "completed",
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
        status: "completed",
        agent: "coder",
        blocked_by: ["a"],
        input: [],
        output: [],
        error: null,
        timeout_minutes: 30,
        retry_count: 0,
        max_retries: 3,
      },
      {
        name: "c",
        status: "completed",
        agent: "coder",
        blocked_by: ["b"],
        input: [],
        output: [],
        error: null,
        timeout_minutes: 30,
        retry_count: 0,
        max_retries: 3,
      },
    );
    ph.nodes.find((n) => n.name === "a")!.status = "failed";
    await saveStateJson(root, session_id, pipeline_id, state, fixedNow());

    const r = await node().finish({
      status: "retry",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "a",
    });
    if (r.status === "retry") {
      expect(r.reset_downstream.sort()).toEqual(["b", "c"]);
    }
    const reloaded = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const phReloaded = reloaded.phases.find((p) => p.phase === "05-implement")!;
    expect(phReloaded.nodes.find((n) => n.name === "b")?.status).toBe("pending");
    expect(phReloaded.nodes.find((n) => n.name === "c")?.status).toBe("pending");
  });

  it("finish(retry) rejects when node is not failed", async () => {
    const { session_id, pipeline_id } = await startNode();
    await expect(
      node().finish({
        status: "retry",
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "x",
      }),
    ).rejects.toThrow(/expected failed/);
  });

  it("finish(failed) rejects when node is not in_progress", async () => {
    const { session_id, pipeline_id } = await seed();
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    state.phases
      .find((p) => p.phase === "05-implement")!
      .nodes.push({
        name: "y",
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
    await saveStateJson(root, session_id, pipeline_id, state, fixedNow());
    await expect(
      node().finish({
        status: "failed",
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "y",
        error: { message: "x", type: "X" },
      }),
    ).rejects.toThrow(/cannot fail from status=pending/);
  });

  it("finish() rejects unknown status via exhaustiveness check", async () => {
    const { session_id, pipeline_id } = await startNode();
    await expect(
      node().finish({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: "bogus" as any,
        session_id,
        pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
        node_name: "x",
      }),
    ).rejects.toThrow(/unknown status/);
  });

  it("finish() is registry-guard exempt per §4.4 (pending_reflections do NOT block)", async () => {
    const { session_id, pipeline_id } = await startNode();
    const f = await loadFlowState(root, session_id);
    f.pending_reflections.push({
      reflection_id: "rf-1",
      method: "m",
      step_id: "s",
      target_artifact: "x.md",
      context_artifacts: [],
    });
    await saveFlowState(root, f, fixedNow());

    const r = await node().finish({
      status: "failed",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      error: { message: "boom", type: "E" },
    });
    expect(r.status).toBe("failed");
  });

  it("history rows tagged tool=opc_node_finish for all branches", async () => {
    const { session_id, pipeline_id } = await startNode();
    await node().finish({
      status: "failed",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      error: { message: "boom", type: "E" },
    });
    await node().finish({
      status: "retry",
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
    });
    const f = await loadFlowState(root, session_id);
    const tools = f.history.map((h) => h.tool);
    expect(tools.filter((t) => t === "opc_node_finish").length).toBe(2);
  });
});

describe("M18.f validator artifact writer (node_execution)", () => {
  it("happy path writes .opc/logs/validator/<session>/node_execution-1.json with all-pass results", async () => {
    const { session_id, pipeline_id } = await seed();
    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      node_definition: def({ name: "x", quality_gates: ["test_pass"] }),
    });
    await node().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "x",
      evidence: { test_results: { passed: 3, failed: 0 } },
    });
    const path = join(root, ".opc/logs/validator", session_id, "node_execution-1.json");
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(path, "utf8");
    const art = JSON.parse(raw) as {
      step: string;
      validator_results: Record<string, string>;
      failure_reasons?: string[];
      ran_by: string;
      node?: string;
    };
    expect(art.step).toBe("node_execution");
    expect(art.ran_by).toBe("state-manager");
    expect(art.node).toBe("x");
    expect(art.validator_results.l1).toBe("pass");
    expect(art.validator_results.l2).toBe("pass");
    expect(art.failure_reasons).toBeUndefined();
  });

  it("L1 failure: writes artifact with l1=fail + failure_reasons, still throws", async () => {
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
    ).rejects.toThrow(/L1: declared output\.artifact/);
    const path = join(root, ".opc/logs/validator", session_id, "node_execution-1.json");
    const { readFile } = await import("node:fs/promises");
    const art = JSON.parse(await readFile(path, "utf8")) as {
      validator_results: Record<string, string>;
      failure_reasons: string[];
    };
    expect(art.validator_results.l1).toBe("fail");
    expect(art.failure_reasons.some((r) => r.startsWith("L1:"))).toBe(true);
  });

  it("L2 failure: writes l1=pass + l2=fail and rejects (gates exist)", async () => {
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
    const path = join(root, ".opc/logs/validator", session_id, "node_execution-1.json");
    const { readFile } = await import("node:fs/promises");
    const art = JSON.parse(await readFile(path, "utf8")) as {
      validator_results: Record<string, string>;
      failure_reasons: string[];
    };
    expect(art.validator_results.l1).toBe("pass");
    expect(art.validator_results.l2).toBe("fail");
    expect(art.failure_reasons.some((r) => r.startsWith("L2:"))).toBe(true);
  });

  it("sequential numbering: two complete() calls produce -1 and -2 in same session", async () => {
    const { session_id, pipeline_id } = await seed();
    // Add a second node a; the seeded phase already has nothing — push two
    const state = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const ph = state.phases.find((p) => p.phase === "05-implement")!;
    ph.nodes.push(
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
    );
    await saveStateJson(root, session_id, pipeline_id, state, new Date("2026-06-10T00:00:00Z"));
    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "a",
    });
    await node().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "a",
    });
    await node().start({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "b",
    });
    await node().complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
      node_name: "b",
    });
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(join(root, ".opc/logs/validator", session_id))).sort();
    expect(files).toContain("node_execution-1.json");
    expect(files).toContain("node_execution-2.json");
  });
});
