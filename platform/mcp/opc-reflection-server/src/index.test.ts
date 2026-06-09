import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  availableMethodsForStep,
  checkFreshness,
  checkRoundsGuard,
  pickMethods,
  ReflectionServer,
  SERVER_NAME,
  validateAll,
  validateV1Schema,
  validateV2Referential,
  validateV3Presence,
  validateV4Coverage,
  validateV5Discrimination,
} from "./index.js";
import type {
  EvidenceArtifact,
  Objection,
  StepId,
} from "./index.js";

describe("opc-reflection-server facade", () => {
  it("exposes its server name", () => {
    expect(SERVER_NAME).toBe("opc-reflection-server");
  });
});

const baseArtifact = (overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact => ({
  step: "P5",
  artifact_type: "matching-result",
  payload: { matched_tags: ["a", "b"], blocked_by_graph: { nodes: [] } },
  collected_at: "2026-01-01T00:00:00Z",
  collected_by: "tester",
  ...overrides,
});

describe("validators", () => {
  it("V1 rejects missing step field", () => {
    const bad = baseArtifact() as unknown as Record<string, unknown>;
    delete bad.step;
    const r = validateV1Schema(bad as unknown as EvidenceArtifact);
    expect(r.pass).toBe(false);
  });

  it("V1 accepts a well-formed artifact", () => {
    expect(validateV1Schema(baseArtifact()).pass).toBe(true);
  });

  it("V2 rejects unknown knowledge_ref", () => {
    const art = baseArtifact({
      payload: { items: [{ knowledge_ref: "unit/missing" }] },
    });
    const r = validateV2Referential(art, { known_paths: new Set(["unit/known"]) });
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("unknown knowledge_ref");
  });

  it("V2 accepts when known_paths includes ref", () => {
    const art = baseArtifact({
      payload: { items: [{ knowledge_ref: "unit/known" }] },
    });
    const r = validateV2Referential(art, { known_paths: new Set(["unit/known"]) });
    expect(r.pass).toBe(true);
  });

  it("V3 rejects when required step field missing", async () => {
    const art = baseArtifact({ step: "P5", payload: { blocked_by_graph: {} } });
    const r = await validateV3Presence(art);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("matched_tags");
  });

  it("V3 rejects when referenced file does not exist", async () => {
    const art = baseArtifact({
      step: "P5",
      payload: {
        matched_tags: ["x"],
        blocked_by_graph: {},
        files: [{ file_ref: "/nonexistent/path/should-fail.tmp" }],
      },
    });
    const r = await validateV3Presence(art);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("does not exist");
  });

  it("V3 accepts when file_ref points at a real file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rfv3-"));
    const f = join(dir, "exists.txt");
    await writeFile(f, "hi", "utf8");
    try {
      const art = baseArtifact({
        step: "P5",
        payload: {
          matched_tags: ["x"],
          blocked_by_graph: {},
          files: [{ file_ref: f }],
        },
      });
      const r = await validateV3Presence(art);
      expect(r.pass).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("V4 fails when coverage ratio below threshold", () => {
    const art = baseArtifact({
      payload: {
        matched_tags: [],
        blocked_by_graph: {},
        task_criteria_hits: ["a"],
        task_criteria_required: ["a", "b", "c", "d"],
      },
    });
    const r = validateV4Coverage(art, { coverage_threshold: 0.5 });
    expect(r.pass).toBe(false);
  });

  it("V5 fails when all candidates matched (no discrimination)", () => {
    const art = baseArtifact({
      payload: {
        matched_tags: ["1", "2", "3", "4", "5"],
        blocked_by_graph: {},
        candidate_pool_size: 5,
      },
    });
    const r = validateV5Discrimination(art, { discrimination_threshold: 0.1 });
    expect(r.pass).toBe(false);
  });

  it("rounds-guard fails when round exceeds max", () => {
    const r = checkRoundsGuard({ current_round: 4, max_rounds: 3 });
    expect(r.pass).toBe(false);
  });

  it("freshness fails when current_version < min_version", () => {
    const r = checkFreshness({
      freshness_refs: [{ path: "unit/x", min_version: 3, current_version: 2 }],
    });
    expect(r.pass).toBe(false);
  });

  it("validateAll short-circuits on V1 failure", async () => {
    const bad = baseArtifact() as unknown as Record<string, unknown>;
    delete bad.step;
    const { pass, results } = await validateAll(bad as unknown as EvidenceArtifact);
    expect(pass).toBe(false);
    expect(results.length).toBe(1);
    expect(results[0]?.validator).toBe("V1");
  });

  it("validateAll passes for a clean artifact with full payload", async () => {
    const art = baseArtifact({
      step: "P5",
      payload: {
        matched_tags: ["a", "b"],
        blocked_by_graph: {},
        candidate_pool_size: 10,
      },
    });
    const { pass } = await validateAll(art);
    expect(pass).toBe(true);
  });
});

describe("methods registry", () => {
  it("returns step→primary+secondary mapping", () => {
    const plan = pickMethods({ step_id: "P3", artifact_summary: "decompose plan" });
    expect(plan.primary).toBe("tot");
    expect(plan.secondary).toBe("debate");
    expect(plan.max_rounds).toBe(3);
    expect(plan.enhanced_prompts.tot).toContain("Tree-of-Thoughts");
  });

  it("budget_disable_secondary drops secondary", () => {
    const plan = pickMethods({
      step_id: "P3",
      artifact_summary: "x",
      budget_disable_secondary: true,
    });
    expect(plan.secondary).toBeNull();
    expect(plan.enhanced_prompts.debate).toBeUndefined();
  });

  it("availableMethodsForStep returns primary+secondary by step", () => {
    expect(availableMethodsForStep("P6")).toEqual(["validator"]);
    expect(availableMethodsForStep("P1")).toContain("cove");
  });

  it("interpolates {{artifact_summary}} into prompts", () => {
    const plan = pickMethods({
      step_id: "P1",
      artifact_summary: "INTENT-XYZ",
    });
    expect(plan.enhanced_prompts.cove).toContain("INTENT-XYZ");
  });
});

describe("ReflectionServer", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "rfsrv-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const newServer = (): ReflectionServer =>
    new ReflectionServer({
      root,
      now: (): Date => new Date("2026-06-10T12:00:00Z"),
      uuid: ((): (() => string) => {
        let n = 0;
        return (): string => `uuid-${++n}`;
      })(),
    });

  it("plan returns recommended_methods and never emits flow_next", async () => {
    const srv = newServer();
    const resp = await srv.plan({
      session_id: "s1",
      step_id: "P5",
      artifact_summary: "candidate match table",
    });
    expect(resp.recommended_methods.primary).toBe("critique");
    expect(resp.max_rounds).toBe(3);
    expect((resp as unknown as { flow_next?: unknown }).flow_next).toBeUndefined();
  });

  it("critique returns read-only critic_spec", async () => {
    const srv = newServer();
    const resp = await srv.critique({
      session_id: "s1",
      step_id: "P5",
      artifact: baseArtifact(),
      enhanced_prompt: "be critical",
    });
    expect(resp.critic_spec.tools).toContain("Read");
    expect(resp.critic_spec.tools).toContain("opc_knowledge_read");
    expect(resp.critic_spec.tools).not.toContain("Write");
    expect(resp.critic_spec.tools).not.toContain("Bash");
    expect(resp.critic_spec.context.step_id).toBe("P5");
  });

  it("critiqueComplete writes artifact and emits pending_reflection", async () => {
    const srv = newServer();
    const resp = await srv.critiqueComplete({
      session_id: "s1",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: ["looked at matching table"],
      round: 1,
      max_rounds: 3,
    });
    expect(resp.verdict).toBe("clean");
    expect(resp.pending_reflection.must_be_registered_by).toBe("opc_flow_reflect");
    expect(resp.pending_reflection.artifact_path).toContain("opc-logs/reflection/s1/");
    const raw = await readFile(resp.pending_reflection.artifact_path, "utf8");
    expect(JSON.parse(raw).reflection_id).toBe(resp.pending_reflection.reflection_id);
  });

  it("critiqueComplete verdict=objections_remain when blocker present", async () => {
    const srv = newServer();
    const blocker: Objection = {
      id: "o1",
      severity: "blocker",
      category: "logic",
      text: "missing edge case",
    };
    const resp = await srv.critiqueComplete({
      session_id: "s1",
      step_id: "P5",
      method: "critique",
      objections: [blocker],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    expect(resp.verdict).toBe("objections_remain");
    expect(resp.kept_objections).toHaveLength(1);
  });

  it("critiqueComplete verdict=rounds_exceeded when round > max_rounds", async () => {
    const srv = newServer();
    const resp = await srv.critiqueComplete({
      session_id: "s1",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: [],
      round: 4,
      max_rounds: 3,
    });
    expect(resp.verdict).toBe("rounds_exceeded");
  });

  it("dismissed objections are excluded from kept_objections", async () => {
    const srv = newServer();
    const dismissed: Objection = {
      id: "o2",
      severity: "minor",
      category: "style",
      text: "nit",
      resolution: "dismissed",
    };
    const resp = await srv.critiqueComplete({
      session_id: "s1",
      step_id: "P5",
      method: "critique",
      objections: [dismissed],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    expect(resp.kept_objections).toHaveLength(0);
    expect(resp.verdict).toBe("clean");
  });

  it("validator failures become blocker objections", async () => {
    const srv = newServer();
    const badArtifact: EvidenceArtifact = baseArtifact({
      step: "P5" as StepId,
      payload: { blocked_by_graph: {} },
    });
    const resp = await srv.critiqueComplete({
      session_id: "s1",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
      artifact: badArtifact,
    });
    expect(resp.verdict).toBe("objections_remain");
    expect(resp.kept_objections.some((o) => o.category === "validator")).toBe(true);
    expect(resp.validator_results?.some((r) => !r.pass)).toBe(true);
  });

  it("recordInterventions signals distiller dispatch", async () => {
    const srv = newServer();
    const resp = await srv.recordInterventions({
      session_id: "s1",
      pipeline_id: "pl-1",
    });
    expect(resp.dispatched).toBe(true);
    expect(resp.distiller_agent).toBe("corrections-distiller");
  });
});
