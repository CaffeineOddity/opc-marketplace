import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  availableMethodsForStep,
  buildCorrection,
  checkFreshness,
  checkRoundsGuard,
  CorrectionsServer,
  listAllCorrections,
  listCorrectionsByStep,
  pickMethods,
  ReflectionServer,
  saveCorrection,
  SERVER_NAME,
  SIM_MERGE_THRESHOLD,
  similarity,
  validateAll,
  validateV1Schema,
  validateV2Referential,
  validateV3Presence,
  validateV4Coverage,
  validateV5Discrimination,
} from "./index.js";
import type {
  Correction,
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

  it("recordInterventions returns full distiller dispatch context", async () => {
    const srv = newServer();
    const resp = await srv.recordInterventions({
      session_id: "s1",
      pipeline_id: "pl-1",
      rounds_exceeded_artifacts: ["opc-logs/reflection/p3-r3.json"],
      pipeline_metadata: { scope: "user-auth", phases_executed: 9 },
    });
    expect(resp.dispatched).toBe(true);
    expect(resp.distiller_agent).toBe("opc-distiller");
    expect(resp.task_spec.subagent_type).toBe("opc-distiller");
    expect(resp.task_spec.tools).toContain("opc_corrections_upsert");
    expect(resp.task_spec.tools).toContain("opc_flow_query");
    expect(resp.task_spec.tools).not.toContain("Write");
    expect(resp.task_spec.dispatch_context.pipeline_id).toBe("pl-1");
    expect(resp.task_spec.dispatch_context.l1_source.rounds_exceeded_artifacts).toEqual(
      ["opc-logs/reflection/p3-r3.json"],
    );
    expect(resp.task_spec.dispatch_context.budget.max_new_corrections).toBe(8);
    expect(resp.task_spec.prompt).toContain("opc_flow_query");
  });
});

describe("ReflectionServer M17.e discriminator facades", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "rfsrv-m17e-"));
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

  describe("opc_reflect_execute", () => {
    it("delegates to critique() and tags response with method", async () => {
      const srv = newServer();
      const resp = await srv.execute({
        method: "cove",
        session_id: "s1",
        step_id: "P5",
        artifact: baseArtifact(),
        enhanced_prompt: "verify step by step",
      });
      expect(resp.method).toBe("cove");
      expect(resp.critic_spec.context.method).toBe("cove");
      expect(resp.critic_spec.tools).toContain("Read");
      expect(resp.critic_spec.tools).not.toContain("Write");
    });

    it("rejects unknown method", async () => {
      const srv = newServer();
      await expect(
        srv.execute({
          method: "nonsense" as never,
          session_id: "s1",
          step_id: "P5",
          artifact: baseArtifact(),
          enhanced_prompt: "x",
        }),
      ).rejects.toThrow(/unknown method=nonsense/);
    });
  });

  describe("opc_reflect_complete", () => {
    it("delegates to critiqueComplete() and tags response with method", async () => {
      const srv = newServer();
      const resp = await srv.complete({
        method: "cove",
        session_id: "s1",
        step_id: "P5",
        objections: [],
        reasoning_trace: ["checked"],
        round: 1,
        max_rounds: 3,
      });
      expect(resp.method).toBe("cove");
      expect(resp.verdict).toBe("clean");
      expect(resp.pending_reflection.must_be_registered_by).toBe("opc_flow_reflect");
    });

    it("rejects unknown method", async () => {
      const srv = newServer();
      await expect(
        srv.complete({
          method: "wrong" as never,
          session_id: "s1",
          step_id: "P5",
          objections: [],
          reasoning_trace: [],
          round: 1,
          max_rounds: 3,
        }),
      ).rejects.toThrow(/unknown method=wrong/);
    });
  });

  describe("opc_reflect_admin", () => {
    it("action=record_interventions delegates to recordInterventions()", async () => {
      const srv = newServer();
      const resp = await srv.admin({
        action: "record_interventions",
        session_id: "s1",
        pipeline_id: "pl-1",
        rounds_exceeded_artifacts: ["opc-logs/reflection/p3-r3.json"],
      });
      expect(resp.action).toBe("record_interventions");
      if (resp.action === "record_interventions") {
        expect(resp.dispatched).toBe(true);
        expect(resp.distiller_agent).toBe("opc-distiller");
        expect(resp.task_spec.dispatch_context.pipeline_id).toBe("pl-1");
      }
    });

    it.each([
      ["on_demand"],
      ["explain"],
      ["query_stats"],
      ["unlearn_method"],
    ] as const)(
      "action=%s returns not_implemented:true (deferred to M18)",
      async (action) => {
        const srv = newServer();
        const req =
          action === "explain"
            ? { action, session_id: "s1", reflection_id: "rf-1" }
            : action === "unlearn_method"
              ? { action, session_id: "s1", method: "critique" as const }
              : { action, session_id: "s1" };
        const resp = await srv.admin(req);
        expect(resp.action).toBe(action);
        if (resp.action !== "record_interventions") {
          expect(resp.not_implemented).toBe(true);
          expect(resp.reason).toContain(action);
          expect(resp.reason).toContain("M18");
        }
      },
    );

    it("rejects unknown action with ReflectionServerError", async () => {
      const srv = newServer();
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        srv.admin({ action: "ghost", session_id: "s1" } as any),
      ).rejects.toThrow(/unknown action=ghost/);
    });
  });
});

describe("similarity engine", () => {
  const sample = (overrides: Partial<Correction> = {}): Correction => ({
    id: "corr-x",
    step: "P3",
    unit: "decomposition",
    section: "sub-pipeline-coupling",
    subsection: "tight-interface",
    lesson: "Sub-pipelines should expose loose interfaces; avoid sharing internal state",
    applies_when: { keywords: ["coupling", "interface"], phase_id: ["03-decompose"] },
    source: "distiller",
    linked_reflection_artifacts: [],
    linked_interventions: [],
    hotness: 3,
    frozen: false,
    schema_version: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    related: [],
    deprecated_by: null,
    ...overrides,
  });

  it("scores high for matching keywords + lesson", () => {
    const s = similarity(
      {
        keywords: ["coupling", "interface"],
        lesson: "Sub-pipelines should expose loose interfaces",
        applies_when: { keywords: ["coupling", "interface"], phase_id: ["03-decompose"] },
      },
      sample(),
    );
    expect(s.score).toBeGreaterThanOrEqual(SIM_MERGE_THRESHOLD);
  });

  it("scores low for disjoint keywords + lesson", () => {
    const s = similarity(
      {
        keywords: ["jwt", "refresh"],
        lesson: "Always rotate refresh tokens via short TTL",
        applies_when: { keywords: ["jwt"], phase_id: ["05-tdd"] },
      },
      sample(),
    );
    expect(s.score).toBeLessThan(SIM_MERGE_THRESHOLD);
  });

  it("glob pattern overlap contributes to applies_when_overlap", () => {
    const s = similarity(
      {
        keywords: [],
        lesson: "",
        applies_when: { keywords: [], modify_unit_pattern: "packages/auth/**" },
      },
      sample({ applies_when: { keywords: [], modify_unit_pattern: "packages/auth/**" } }),
    );
    expect(s.applies_when_overlap).toBeGreaterThan(0);
  });
});

describe("CorrectionsServer", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "corr-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const newServer = (overrides?: { perSectionCap?: number }): CorrectionsServer =>
    new CorrectionsServer({
      root,
      now: (): Date => new Date("2026-06-10T12:00:00Z"),
      uuid: ((): (() => string) => {
        let n = 0;
        return (): string => `uuid-${++n}`;
      })(),
      ...(overrides?.perSectionCap !== undefined
        ? { perSectionCap: overrides.perSectionCap }
        : {}),
    });

  it("create writes to opc-memory/corrections/{unit}/{section}/{sub}/", async () => {
    const srv = newServer();
    const resp = await srv.upsert({
      batch: [
        {
          operation: "create",
          correction: buildCorrection({
            step: "P3",
            unit: "decomposition",
            section: "sub-pipeline",
            subsection: "tight",
            lesson: "Avoid tight interfaces",
            applies_when: { keywords: ["coupling"] },
            source: "distiller",
          }),
        },
      ],
    });
    expect(resp.new_count).toBe(1);
    expect(resp.written_ids).toHaveLength(1);
    const all = await listAllCorrections(root);
    expect(all).toHaveLength(1);
    expect(all[0]?.path).toContain("opc-memory/corrections/decomposition/sub-pipeline/tight");
  });

  it("query returns top-K matching by keyword overlap then hotness", async () => {
    const srv = newServer();
    const base = buildCorrection({
      step: "P5",
      unit: "node-selection",
      section: "file-conflict",
      subsection: "parallel-write",
      lesson: "x",
      applies_when: { keywords: ["jwt", "refresh"] },
      source: "distiller",
    });
    await srv.upsert({
      batch: [
        { operation: "create", correction: { ...base, hotness: 2 } },
        {
          operation: "create",
          correction: { ...base, applies_when: { keywords: ["other"] }, hotness: 10 },
        },
        {
          operation: "create",
          correction: { ...base, applies_when: { keywords: ["jwt"] }, hotness: 1 },
        },
      ],
    });
    const q = await srv.query({ step: "P5", keywords: ["jwt"], limit: 3 });
    expect(q.items[0]?.applies_when.keywords).toContain("jwt");
    expect(q.total).toBe(3);
  });

  it("merge increments hotness and unions applies_when", async () => {
    const srv = newServer();
    const created = await srv.upsert({
      batch: [
        {
          operation: "create",
          correction: {
            ...buildCorrection({
              step: "P1",
              unit: "intent",
              section: "ambiguous",
              subsection: "single",
              lesson: "ask",
              applies_when: { keywords: ["question"] },
              source: "user",
            }),
            id: "corr-fixed",
          },
        },
      ],
    });
    const id = created.written_ids[0];
    expect(id).toBe("corr-fixed");
    const merged = await srv.upsert({
      batch: [
        {
          operation: "merge",
          match_id: id,
          correction: {
            ...buildCorrection({
              step: "P1",
              unit: "intent",
              section: "ambiguous",
              subsection: "single",
              lesson: "ask",
              applies_when: { keywords: ["new-keyword"] },
              source: "distiller",
            }),
            linked_interventions: [{ ts: "2026-06-10T01:00:00Z", text: "be specific" }],
          },
        },
      ],
    });
    expect(merged.merged_count).toBe(1);
    const all = await listAllCorrections(root);
    expect(all).toHaveLength(1);
    expect(all[0]?.correction.hotness).toBe(2);
    expect(all[0]?.correction.applies_when.keywords).toContain("new-keyword");
    expect(all[0]?.correction.applies_when.keywords).toContain("question");
    expect(all[0]?.correction.linked_interventions).toHaveLength(1);
  });

  it("per-section cap freezes lowest-hotness peers when exceeded", async () => {
    const srv = newServer({ perSectionCap: 2 });
    const mk = (lessonId: string, hotness: number): typeof base.correction => ({
      ...buildCorrection({
        step: "P5",
        unit: "node",
        section: "cap-test",
        subsection: lessonId,
        lesson: `lesson ${lessonId}`,
        applies_when: { keywords: [lessonId] },
        source: "distiller",
      }),
      hotness,
    });
    const base = { operation: "create" as const, correction: mk("a", 5) };
    await srv.upsert({ batch: [base] });
    await srv.upsert({ batch: [{ operation: "create", correction: mk("b", 3) }] });
    const resp = await srv.upsert({
      batch: [{ operation: "create", correction: mk("c", 10) }],
    });
    expect(resp.frozen_ids.length).toBeGreaterThanOrEqual(1);
    const active = await listCorrectionsByStep(root, "P5");
    expect(active.length).toBeLessThanOrEqual(2);
  });

  it("upsert skips invalid items with reason", async () => {
    const srv = newServer();
    const resp = await srv.upsert({
      batch: [
        {
          operation: "create",
          correction: {
            ...buildCorrection({
              step: "P1",
              unit: "u",
              section: "s",
              subsection: "ss",
              lesson: "",
              applies_when: { keywords: [] },
              source: "user",
            }),
          },
        },
      ],
    });
    expect(resp.skipped_count).toBe(1);
    expect(resp.skip_reasons[0]).toContain("lesson required");
  });

  it("findSimilar returns null when no peer crosses threshold", async () => {
    const srv = newServer();
    await srv.upsert({
      batch: [
        {
          operation: "create",
          correction: buildCorrection({
            step: "P3",
            unit: "u",
            section: "s",
            subsection: "ss",
            lesson: "completely different topic",
            applies_when: { keywords: ["alpha"] },
            source: "distiller",
          }),
        },
      ],
    });
    const m = await srv.findSimilar("P3", {
      keywords: ["unrelated"],
      lesson: "totally other lesson",
      applies_when: { keywords: ["unrelated"] },
    });
    expect(m).toBeNull();
  });

  it("seed source upgrades to user on merge", async () => {
    const srv = newServer();
    const seeded = await srv.upsert({
      batch: [
        {
          operation: "create",
          correction: {
            ...buildCorrection({
              step: "P2",
              unit: "u",
              section: "s",
              subsection: "ss",
              lesson: "seeded",
              applies_when: { keywords: ["seed"] },
              source: "seed",
            }),
            id: "corr-seed",
          },
        },
      ],
    });
    expect(seeded.written_ids[0]).toBe("corr-seed");
    await srv.upsert({
      batch: [
        {
          operation: "merge",
          match_id: "corr-seed",
          correction: buildCorrection({
            step: "P2",
            unit: "u",
            section: "s",
            subsection: "ss",
            lesson: "seeded",
            applies_when: { keywords: ["confirmed"] },
            source: "user",
          }),
        },
      ],
    });
    const all = await listAllCorrections(root);
    expect(all[0]?.correction.source).toBe("user");
  });

  it("loading from disk round-trips", async () => {
    const c: Correction = {
      ...buildCorrection({
        step: "P4",
        unit: "u",
        section: "s",
        subsection: "ss",
        lesson: "brief should reference X",
        applies_when: { keywords: ["brief", "x"] },
        source: "user" as StepId extends never ? never : "user",
      }),
      id: "corr-disk",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    await saveCorrection(root, c);
    const all = await listAllCorrections(root);
    expect(all).toHaveLength(1);
    expect(all[0]?.correction.id).toBe("corr-disk");
  });
});
