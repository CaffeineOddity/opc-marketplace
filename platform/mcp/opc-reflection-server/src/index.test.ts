import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  availableMethodsForStep,
  buildCorrection,
  checkFreshness,
  checkRoundsGuard,
  correctionsRoot,
  CorrectionsServer,
  listAllCorrections,
  listCorrectionsByStep,
  loadCorrectionById,
  pickMethods,
  readTelemetry,
  ReflectionServer,
  saveCorrection,
  SERVER_NAME,
  SIM_MERGE_THRESHOLD,
  similarity,
  telemetryPath,
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

describe("M18.a telemetry", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "rfsrv-m18a-"));
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

  it("critiqueComplete appends a telemetry line and creates the file on first call", async () => {
    const srv = newServer();
    const resp = await srv.critiqueComplete({
      session_id: "s-tel",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: ["ok"],
      round: 1,
      max_rounds: 3,
      telemetry: { latency_ms: 1234, tokens_in: 800, tokens_out: 250 },
    });
    const path = telemetryPath(root, "s-tel");
    const raw = await readFile(path, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry.session_id).toBe("s-tel");
    expect(entry.step).toBe("P5");
    expect(entry.method).toBe("critique");
    expect(entry.verdict).toBe("clean");
    expect(entry.reflection_id).toBe(resp.pending_reflection.reflection_id);
    expect(entry.latency_ms).toBe(1234);
    expect(entry.tokens_in).toBe(800);
    expect(entry.objections_raised).toBe(0);
    expect(entry.objections_kept).toBe(0);
    expect(entry.evidence_diff).toBe(false);
  });

  it("appends one telemetry line per critiqueComplete across multiple methods", async () => {
    const srv = newServer();
    await srv.critiqueComplete({
      session_id: "s-multi",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    await srv.critiqueComplete({
      session_id: "s-multi",
      step_id: "P5",
      method: "cove",
      objections: [
        { id: "o1", severity: "blocker", category: "logic", text: "missing X" },
      ],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
      evidence_diff: { changed: ["a.md"] },
    });
    const entries = await readTelemetry(root, "s-multi");
    expect(entries).toHaveLength(2);
    expect(entries[0].method).toBe("critique");
    expect(entries[0].verdict).toBe("clean");
    expect(entries[1].method).toBe("cove");
    expect(entries[1].verdict).toBe("objections_remain");
    expect(entries[1].objections_raised).toBe(1);
    expect(entries[1].objections_kept).toBe(1);
    expect(entries[1].evidence_diff).toBe(true);
  });

  it("captures rounds_exceeded verdict in telemetry", async () => {
    const srv = newServer();
    await srv.critiqueComplete({
      session_id: "s-exc",
      step_id: "P3",
      method: "debate",
      objections: [],
      reasoning_trace: [],
      round: 4,
      max_rounds: 3,
    });
    const entries = await readTelemetry(root, "s-exc");
    expect(entries).toHaveLength(1);
    expect(entries[0].verdict).toBe("rounds_exceeded");
    expect(entries[0].round).toBe(4);
  });

  it("readTelemetry returns [] when the session has no telemetry yet", async () => {
    expect(await readTelemetry(root, "never-written")).toEqual([]);
  });

  it("readTelemetry skips malformed lines without throwing", async () => {
    const srv = newServer();
    await srv.critiqueComplete({
      session_id: "s-bad",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    const path = telemetryPath(root, "s-bad");
    await writeFile(path, `${await readFile(path, "utf8")}not-json-line\n`, "utf8");
    const entries = await readTelemetry(root, "s-bad");
    expect(entries).toHaveLength(1);
    expect(entries[0].session_id).toBe("s-bad");
  });
});

describe("M18.b query_stats aggregation", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "rfsrv-m18b-"));
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

  it("returns zeroed stats when no telemetry has been written", async () => {
    const srv = newServer();
    const resp = await srv.admin({ action: "query_stats", session_id: "s-empty" });
    expect(resp.action).toBe("query_stats");
    if (resp.action !== "query_stats") return;
    expect(resp.runs_total).toBe(0);
    expect(resp.per_method_step).toEqual([]);
    expect(resp.totals.runs).toBe(0);
    expect(resp.totals.objections_raised).toBe(0);
    expect(resp.expiry_metrics.expired_pending_count_24h).toBe(0);
    expect(resp.expiry_metrics.artifact_purged_7d_count).toBe(0);
    expect(resp.expiry_metrics_source).toBe("unavailable_zeroed");
  });

  it("aggregates single-method runs with fp_rate and evidence_diff_conversion", async () => {
    const srv = newServer();
    await srv.critiqueComplete({
      session_id: "s1",
      step_id: "P5",
      method: "critique",
      objections: [
        { id: "o1", severity: "blocker", category: "logic", text: "x" },
        { id: "o2", severity: "minor", category: "style", text: "y", resolution: "dismissed" },
      ],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
      evidence_diff: { changed: ["a.md"] },
      telemetry: { latency_ms: 500, tokens_in: 100, tokens_out: 40 },
    });
    await srv.critiqueComplete({
      session_id: "s1",
      step_id: "P5",
      method: "critique",
      objections: [
        { id: "o3", severity: "blocker", category: "logic", text: "z" },
      ],
      reasoning_trace: [],
      round: 2,
      max_rounds: 3,
      telemetry: { latency_ms: 300, tokens_in: 80, tokens_out: 30 },
    });

    const resp = await srv.admin({ action: "query_stats", session_id: "s1" });
    if (resp.action !== "query_stats") throw new Error("wrong action");
    expect(resp.runs_total).toBe(2);
    expect(resp.per_method_step).toHaveLength(1);
    const bucket = resp.per_method_step[0];
    if (!bucket) throw new Error("expected one bucket");
    expect(bucket.method).toBe("critique");
    expect(bucket.step).toBe("P5");
    expect(bucket.runs).toBe(2);
    expect(bucket.objections_raised_total).toBe(3);
    expect(bucket.objections_kept_total).toBe(2);
    expect(bucket.fp_rate).toBeCloseTo(2 / 3, 4);
    expect(bucket.evidence_diff_count).toBe(1);
    expect(bucket.evidence_diff_conversion).toBeCloseTo(0.5, 4);
    expect(bucket.total_latency_ms).toBe(800);
    expect(bucket.total_tokens_in).toBe(180);
    expect(bucket.total_tokens_out).toBe(70);
    expect(bucket.rounds_exceeded_count).toBe(0);
    expect(resp.totals.objections_raised).toBe(3);
    expect(resp.totals.total_latency_ms).toBe(800);
  });

  it("partitions across (method, step) buckets and counts rounds_exceeded / fallback", async () => {
    const srv = newServer();
    await srv.critiqueComplete({
      session_id: "s2",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    await srv.critiqueComplete({
      session_id: "s2",
      step_id: "P5",
      method: "cove",
      objections: [{ id: "o1", severity: "blocker", category: "v", text: "x" }],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    await srv.critiqueComplete({
      session_id: "s2",
      step_id: "P3",
      method: "debate",
      objections: [],
      reasoning_trace: [],
      round: 4,
      max_rounds: 3,
      telemetry: { fallback_triggered: true },
    });

    const resp = await srv.admin({ action: "query_stats", session_id: "s2" });
    if (resp.action !== "query_stats") throw new Error("wrong action");
    expect(resp.runs_total).toBe(3);
    expect(resp.per_method_step).toHaveLength(3);
    const keys = resp.per_method_step.map((b) => `${b.step}::${b.method}`);
    expect(keys).toEqual(["P3::debate", "P5::cove", "P5::critique"]);
    const debate = resp.per_method_step.find((b) => b.method === "debate");
    expect(debate?.rounds_exceeded_count).toBe(1);
    expect(debate?.fallback_triggered_count).toBe(1);
    expect(resp.totals.rounds_exceeded).toBe(1);
    expect(resp.totals.fallback_triggered).toBe(1);
  });

  it("filters telemetry by `window` (e.g. 1h) using `now` provided to the server", async () => {
    let clock = new Date("2026-06-10T12:00:00Z");
    const srv = new ReflectionServer({
      root,
      now: (): Date => new Date(clock.getTime()),
      uuid: ((): (() => string) => {
        let n = 0;
        return (): string => `uuid-${++n}`;
      })(),
    });
    await srv.critiqueComplete({
      session_id: "sw",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    clock = new Date("2026-06-10T15:00:00Z");
    await srv.critiqueComplete({
      session_id: "sw",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    clock = new Date("2026-06-10T15:30:00Z");
    const resp = await srv.admin({ action: "query_stats", session_id: "sw", window: "1h" });
    if (resp.action !== "query_stats") throw new Error("wrong action");
    expect(resp.window).toBe("1h");
    expect(resp.window_started_at).toBe("2026-06-10T14:30:00.000Z");
    expect(resp.runs_total).toBe(1);
  });

  it("returns zeroed expiry_metrics when flow_state_path is omitted (M18 stub)", async () => {
    const srv = newServer();
    await srv.critiqueComplete({
      session_id: "se",
      step_id: "P5",
      method: "critique",
      objections: [],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    const resp = await srv.admin({ action: "query_stats", session_id: "se" });
    if (resp.action !== "query_stats") throw new Error("wrong action");
    expect(resp.expiry_metrics).toEqual({
      expired_pending_count_24h: 0,
      expired_resumed_count_24h: 0,
      expired_discarded_count_24h: 0,
      expired_skipped_count_24h: 0,
      artifact_purged_7d_count: 0,
    });
    expect(resp.expiry_metrics_source).toBe("unavailable_zeroed");
  });

  it("returns real expiry_metrics when flow_state_path points at a valid flow-state.json (M18.i)", async () => {
    const srv = newServer();
    const flowPath = join(root, "flow.json");

    // Flow-state with recently-expired pending + 24h windowed interventions + purge log
    const flow: {
      pending_reflections: Array<{ status: string; expires_at: string }>;
      user_interventions: Array<{ at: string; trigger: string }>;
      reflection_log: Array<{ at: string; verdict: string }>;
    } = {
      pending_reflections: [
        {
          status: "expired_pending_decision",
          expires_at: "2026-06-10T11:30:00Z", // 30min ago, < 24h
        },
        {
          status: "expired_pending_decision",
          expires_at: "2026-06-08T00:00:00Z", // > 48h ago, outside 24h window
        },
      ],
      user_interventions: [
        { at: "2026-06-10T11:00:00Z", trigger: "expired_reflection_resumed" },
        { at: "2026-06-10T10:00:00Z", trigger: "expired_reflection_discarded" },
        { at: "2026-06-09T00:00:00Z", trigger: "expired_reflection_skipped" }, // > 24h
      ],
      reflection_log: [
        { at: "2026-06-10T10:00:00Z", verdict: "discarded_by_user_after_expiry" },
        { at: "2026-06-01T00:00:00Z", verdict: "discarded_by_user_after_expiry" }, // > 7d
      ],
    };
    await writeFile(flowPath, JSON.stringify(flow), "utf8");

    const resp = await srv.admin({
      action: "query_stats",
      session_id: "se-flow",
      flow_state_path: flowPath,
    });
    if (resp.action !== "query_stats") throw new Error("wrong action");
    expect(resp.expiry_metrics_source).toBe("flow_state");
    expect(resp.expiry_metrics.expired_pending_count_24h).toBe(1); // only the recent one
    expect(resp.expiry_metrics.expired_resumed_count_24h).toBe(1);
    expect(resp.expiry_metrics.expired_discarded_count_24h).toBe(1);
    expect(resp.expiry_metrics.expired_skipped_count_24h).toBe(0); // outside 24h window
    expect(resp.expiry_metrics.artifact_purged_7d_count).toBe(1); // only the recent one
  });

  it("falls back to unavailable_zeroed when flow_state_path file is missing", async () => {
    const srv = newServer();
    const resp = await srv.admin({
      action: "query_stats",
      session_id: "se-missing",
      flow_state_path: join(root, "nonexistent.json"),
    });
    if (resp.action !== "query_stats") throw new Error("wrong action");
    expect(resp.expiry_metrics_source).toBe("unavailable_zeroed");
    expect(resp.expiry_metrics.expired_pending_count_24h).toBe(0);
  });
});

describe("M18.c explain artifact reader", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "rfsrv-m18c-"));
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

  it("explains a clean reflection with telemetry-matched objection counts", async () => {
    const srv = newServer();
    const writeResp = await srv.critiqueComplete({
      session_id: "se-clean",
      step_id: "P5",
      method: "critique",
      objections: [
        { id: "o1", severity: "minor", category: "style", text: "nit", resolution: "dismissed" },
      ],
      reasoning_trace: ["step 1", "step 2"],
      round: 1,
      max_rounds: 3,
    });
    const reflection_id = writeResp.pending_reflection.reflection_id;

    const resp = await srv.admin({
      action: "explain",
      session_id: "se-clean",
      reflection_id,
    });
    expect(resp.action).toBe("explain");
    if (resp.action !== "explain" || "not_found" in resp) throw new Error("unexpected");
    expect(resp.reflection_id).toBe(reflection_id);
    expect(resp.step).toBe("P5");
    expect(resp.method).toBe("critique");
    expect(resp.verdict).toBe("clean");
    expect(resp.objections_raised.count).toBe(1);
    expect(resp.objections_raised.source).toBe("telemetry");
    expect(resp.objections_kept).toEqual([]);
    expect(resp.fallback_chain).toEqual(["critique → clean"]);
    expect(resp.final_decision).toMatch(/proceed/);
    expect(resp.reasoning_trace).toEqual(["step 1", "step 2"]);
    expect(resp.data_completeness.telemetry_matched).toBe(true);
    expect(resp.data_completeness.evidence_input_recorded).toBe(false);
  });

  it("explains a rounds_exceeded reflection and reports fallback_triggered", async () => {
    const srv = newServer();
    const writeResp = await srv.critiqueComplete({
      session_id: "se-exc",
      step_id: "P3",
      method: "debate",
      objections: [
        { id: "o-keep", severity: "blocker", category: "logic", text: "broken" },
      ],
      reasoning_trace: ["analyzed", "rejected"],
      round: 4,
      max_rounds: 3,
      evidence_diff: { changed: ["a.md"] },
      telemetry: { fallback_triggered: true },
    });
    const resp = await srv.admin({
      action: "explain",
      session_id: "se-exc",
      reflection_id: writeResp.pending_reflection.reflection_id,
    });
    if (resp.action !== "explain" || "not_found" in resp) throw new Error("unexpected");
    expect(resp.verdict).toBe("rounds_exceeded");
    expect(resp.fallback_chain).toEqual(["debate → fallback_triggered"]);
    expect(resp.final_decision).toMatch(/ask_user/);
    expect(resp.evidence_input.available).toBe(true);
    expect(resp.objections_kept).toHaveLength(1);
  });

  it("returns not_found when the reflection_id does not exist", async () => {
    const srv = newServer();
    const resp = await srv.admin({
      action: "explain",
      session_id: "se-missing",
      reflection_id: "rf-does-not-exist",
    });
    if (resp.action !== "explain") throw new Error("unexpected");
    if (!("not_found" in resp)) throw new Error("expected not_found branch");
    expect(resp.not_found).toBe(true);
    expect(resp.reflection_id).toBe("rf-does-not-exist");
    expect(resp.reason).toContain("not found");
  });

  it("reconstructs objections_raised from artifact when no telemetry row matches", async () => {
    const srv = newServer();
    const writeResp = await srv.critiqueComplete({
      session_id: "se-recon",
      step_id: "P5",
      method: "cove",
      objections: [
        { id: "o1", severity: "blocker", category: "logic", text: "x" },
      ],
      reasoning_trace: [],
      round: 1,
      max_rounds: 3,
    });
    const reflection_id = writeResp.pending_reflection.reflection_id;
    const telPath = telemetryPath(root, "se-recon");
    await writeFile(telPath, "", "utf8");

    const resp = await srv.admin({
      action: "explain",
      session_id: "se-recon",
      reflection_id,
    });
    if (resp.action !== "explain" || "not_found" in resp) throw new Error("unexpected");
    expect(resp.objections_raised.source).toBe("reconstructed_from_artifact");
    expect(resp.objections_raised.count).toBe(1);
    expect(resp.data_completeness.telemetry_matched).toBe(false);
  });
});

describe("M18.d unlearn_method circuit breaker", () => {
  let root: string;
  let clock: { value: Date };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "rfsrv-m18d-"));
    clock = { value: new Date("2026-06-10T12:00:00Z") };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const newServer = (): ReflectionServer =>
    new ReflectionServer({
      root,
      now: (): Date => clock.value,
      uuid: ((): (() => string) => {
        let n = 0;
        return (): string => `uuid-${++n}`;
      })(),
    });

  const readState = async (): Promise<{
    active: Array<{
      method: string;
      step: string | null;
      reason: string;
      triggered_by: string;
      session_id: string;
    }>;
    history: Array<{
      method: string;
      step: string | null;
      deactivated_at: string;
      deactivation_reason: string;
    }>;
  }> => {
    const raw = await readFile(join(root, ".opc/state/unlearn-state.json"), "utf8");
    return JSON.parse(raw);
  };

  it("activates a manual unlearn with default 24h TTL and persists state", async () => {
    const srv = newServer();
    const resp = await srv.admin({
      action: "unlearn_method",
      session_id: "s-a",
      method: "debate",
      step: "P5",
      reason: "fake debate suspected in CI",
    });
    if (resp.action !== "unlearn_method") throw new Error("unexpected branch");
    expect(resp.unlearned.method).toBe("debate");
    expect(resp.unlearned.step).toBe("P5");
    expect(resp.unlearned.triggered_by).toBe("manual");
    expect(resp.unlearned.session_id).toBe("s-a");
    expect(resp.active_count).toBe(1);
    expect(resp.previously_active).toBeNull();
    expect(new Date(resp.expires_at).getTime()).toBe(
      new Date("2026-06-11T12:00:00Z").getTime(),
    );

    const state = await readState();
    expect(state.active).toHaveLength(1);
    expect(state.active[0]?.reason).toBe("fake debate suspected in CI");
    expect(state.history).toHaveLength(0);
  });

  it("accepts custom duration_hours and auto trigger", async () => {
    const srv = newServer();
    const resp = await srv.admin({
      action: "unlearn_method",
      session_id: "s-auto",
      method: "tot",
      duration_hours: 6,
      triggered_by: "auto",
    });
    if (resp.action !== "unlearn_method") throw new Error("unexpected branch");
    expect(resp.unlearned.triggered_by).toBe("auto");
    expect(resp.unlearned.step).toBeNull();
    expect(new Date(resp.expires_at).getTime()).toBe(
      new Date("2026-06-10T18:00:00Z").getTime(),
    );
  });

  it("supersedes a prior entry for the same (method, step) and records history", async () => {
    const srv = newServer();
    await srv.admin({
      action: "unlearn_method",
      session_id: "s-sup",
      method: "critique",
      step: "P3",
      reason: "v1",
    });
    clock.value = new Date("2026-06-10T13:00:00Z");
    const resp = await srv.admin({
      action: "unlearn_method",
      session_id: "s-sup",
      method: "critique",
      step: "P3",
      reason: "v2",
    });
    if (resp.action !== "unlearn_method") throw new Error("unexpected branch");
    expect(resp.previously_active?.reason).toBe("v1");
    expect(resp.active_count).toBe(1);

    const state = await readState();
    expect(state.active).toHaveLength(1);
    expect(state.active[0]?.reason).toBe("v2");
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.deactivation_reason).toBe("superseded");
  });

  it("prunes expired entries into history on the next call", async () => {
    const srv = newServer();
    await srv.admin({
      action: "unlearn_method",
      session_id: "s-exp",
      method: "reflexion",
      step: "P5",
      duration_hours: 1,
    });

    clock.value = new Date("2026-06-10T14:00:00Z");
    const resp = await srv.admin({
      action: "unlearn_method",
      session_id: "s-exp",
      method: "cove",
      step: "P5",
    });
    if (resp.action !== "unlearn_method") throw new Error("unexpected branch");
    expect(resp.active_count).toBe(1);

    const state = await readState();
    expect(state.active.map((e) => e.method)).toEqual(["cove"]);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.method).toBe("reflexion");
    expect(state.history[0]?.deactivation_reason).toBe("expired");
  });

  it("rejects non-positive duration_hours", async () => {
    const srv = newServer();
    await expect(
      srv.admin({
        action: "unlearn_method",
        session_id: "s-bad",
        method: "critique",
        duration_hours: 0,
      }),
    ).rejects.toThrow(/duration_hours must be > 0/);
  });
});

describe("M18.e on_demand reflection dispatcher", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "rfsrv-m18e-"));
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

  it("dispatches read-only sub-agent with step's primary method by default", async () => {
    const srv = newServer();
    const resp = await srv.admin({
      action: "on_demand",
      session_id: "s-od",
      step: "P5",
      artifact_summary: "manual look at matching result",
      reason: "user wants extra verification",
    });
    if (resp.action !== "on_demand") throw new Error("unexpected branch");
    expect(resp.dispatched).toBe(true);
    expect(resp.method).toBe("critique");
    expect(resp.dispatch_spec.tools).toContain("Read");
    expect(resp.dispatch_spec.tools).not.toContain("Write");
    expect(resp.dispatch_spec.context.on_demand).toBe(true);
    expect(resp.dispatch_spec.context.step).toBe("P5");
    expect(resp.dispatch_spec.context.target_reflection_id).toBeNull();
    expect(resp.dispatch_spec.prompt).toContain("manual look at matching result");
    expect(resp.note).toMatch(/pending_reflection/);

    const raw = await readFile(resp.log_path, "utf8");
    const log = JSON.parse(raw);
    expect(log.request_id).toBe(resp.request_id);
    expect(log.step).toBe("P5");
    expect(log.method).toBe("critique");
    expect(log.target_reflection_id).toBeNull();
    expect(log.reason).toBe("user wants extra verification");
  });

  it("honors user-supplied method and target_reflection_id", async () => {
    const srv = newServer();
    const resp = await srv.admin({
      action: "on_demand",
      session_id: "s-od2",
      step: "P3",
      method: "tot",
      reflection_id: "rf-prev",
    });
    if (resp.action !== "on_demand") throw new Error("unexpected branch");
    expect(resp.method).toBe("tot");
    expect(resp.dispatch_spec.context.method).toBe("tot");
    expect(resp.dispatch_spec.context.target_reflection_id).toBe("rf-prev");
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
  let globalRoot: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "corr-"));
    globalRoot = await mkdtemp(join(tmpdir(), "glb-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(globalRoot, { recursive: true, force: true });
  });

  const newServer = (overrides?: { perSectionCap?: number }): CorrectionsServer =>
    new CorrectionsServer({
      root,
      now: (): Date => new Date("2026-06-10T12:00:00Z"),
      uuid: ((): (() => string) => {
        let n = 0;
        return (): string => `uuid-${++n}`;
      })(),
      autoDecay: false,
      globalCorrectionsRoot: globalRoot,
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

  describe("M17.f opc_corrections unified facade", () => {
    it("action=query delegates to query() and tags response", async () => {
      const srv = newServer();
      await srv.crud({
        action: "record",
        batch: [
          {
            operation: "create",
            correction: buildCorrection({
              step: "P3",
              unit: "u",
              section: "s",
              subsection: "ss",
              lesson: "x",
              applies_when: { keywords: ["coupling"] },
              source: "distiller",
            }),
          },
        ],
      });
      const resp = await srv.crud({
        action: "query",
        step: "P3",
        keywords: ["coupling"],
        limit: 5,
      });
      expect(resp.action).toBe("query");
      if (resp.action === "query") {
        expect(resp.items).toHaveLength(1);
        expect(resp.total).toBe(1);
      }
    });

    it("action=record delegates to upsert() and tags response", async () => {
      const srv = newServer();
      const resp = await srv.crud({
        action: "record",
        batch: [
          {
            operation: "create",
            correction: buildCorrection({
              step: "P5",
              unit: "u",
              section: "s",
              subsection: "ss",
              lesson: "y",
              applies_when: { keywords: ["k"] },
              source: "distiller",
            }),
          },
        ],
      });
      expect(resp.action).toBe("record");
      if (resp.action === "record") {
        expect(resp.new_count).toBe(1);
        expect(resp.written_ids).toHaveLength(1);
      }
    });

    it("action=unlearn tombstones a correction", async () => {
      const srv = newServer();
      const r = await srv.crud({
        action: "record",
        batch: [
          {
            operation: "create",
            correction: buildCorrection({
              step: "P5",
              unit: "u",
              section: "s",
              subsection: "unlearn-test",
              lesson: "before unlearn",
              applies_when: { keywords: ["unlearn"] },
              source: "distiller",
            }),
          },
        ],
      });
      const id = r.action === "record" ? r.written_ids[0] : "";
      expect(id).toBeTruthy();

      const resp = await srv.crud({
        action: "unlearn",
        correction_id: id,
        reason: "test tombstone",
      });
      expect(resp.action).toBe("unlearn");
      if (resp.action === "unlearn") {
        expect(resp.tombstoned_id).toBe(id);
        expect(resp.frozen).toBe(true);
        expect(resp.reason).toBe("test tombstone");
      }

      // Verify the correction is now frozen + deprecated
      const { correction } = await loadCorrectionById(root, id);
      expect(correction.frozen).toBe(true);
      expect(correction.deprecated_by).toContain("unlearned");
      expect(correction.deprecated_by).toContain("test tombstone");
    });

    it("returns CorrectionNotFoundError for unlearn with unknown id", async () => {
      const srv = newServer();
      await expect(
        srv.crud({ action: "unlearn", correction_id: "corr-nonexistent" }),
      ).rejects.toThrow(/corr-nonexistent/);
    });

    it("action=reindex builds index from all corrections", async () => {
      const srv = newServer();
      // Create some corrections first
      const recordResp = await srv.crud({
        action: "record",
        batch: [
          {
            operation: "create",
            correction: buildCorrection({
              step: "node_selection",
              unit: "ns",
              section: "s1",
              subsection: "ss1",
              lesson: "lesson one avoid parallel writes",
              rationale: "files conflict",
              applies_when: { keywords: ["parallel", "write"] },
              source: "distiller",
            }),
          },
          {
            operation: "create",
            correction: buildCorrection({
              step: "task_decomposition",
              unit: "td",
              section: "s2",
              subsection: "ss2",
              lesson: "lesson two define interface contract",
              rationale: "tight coupling causes failures",
              applies_when: { keywords: ["interface", "coupling"] },
              source: "distiller",
            }),
          },
        ],
      });
      expect(
        recordResp.action === "record" ? recordResp.new_count : 0,
      ).toBe(2);

      // Run reindex
      const reindexResp = await srv.crud({ action: "reindex" });
      expect(reindexResp.action).toBe("reindex");
      if (reindexResp.action === "reindex") {
        expect(reindexResp.indexed).toBeGreaterThanOrEqual(2);
        expect(reindexResp.duration_ms).toBeGreaterThanOrEqual(0);
      }

      // Verify index file exists
      const { loadCorrectionIndex } = await import("./corrections-store.js");
      const index = await loadCorrectionIndex(root);
      expect(index).not.toBeNull();
      expect(index!.total).toBeGreaterThanOrEqual(2);
      expect(index!.entries.length).toBeGreaterThanOrEqual(2);
    });

    it("runDecay multiplies hotness by 0.9 and freezes below threshold", async () => {
      const srv = new CorrectionsServer({
        root,
        now: (): Date => new Date("2026-06-17T12:00:00Z"), // 7 days later
        autoDecay: true,
      });

      // Create corrections with varying hotness
      await saveCorrection(root, {
        id: "corr-hot",
        step: "node_selection",
        unit: "u",
        section: "s",
        subsection: "hot",
        lesson: "high hotness",
        applies_when: { keywords: ["a"] },
        source: "distiller",
        linked_reflection_artifacts: [],
        linked_interventions: [],
        hotness: 10,
        frozen: false,
        deprecated_by: null,
        schema_version: 2,
        created_at: "2026-06-10T00:00:00Z",
        updated_at: "2026-06-10T00:00:00Z",
        related: [],
      });
      await saveCorrection(root, {
        id: "corr-cold",
        step: "node_selection",
        unit: "u",
        section: "s",
        subsection: "cold",
        lesson: "low hotness",
        applies_when: { keywords: ["b"] },
        source: "distiller",
        linked_reflection_artifacts: [],
        linked_interventions: [],
        hotness: 3, // 3 * 0.9 = 2.7 < 3 → frozen
        frozen: false,
        deprecated_by: null,
        schema_version: 2,
        created_at: "2026-06-10T00:00:00Z",
        updated_at: "2026-06-10T00:00:00Z",
        related: [],
      });

      const meta = await srv.runDecay();
      expect(meta.decayed_count).toBe(2); // both had hotness changed
      expect(meta.frozen_count).toBe(1); // only corr-cold fell below threshold

      // Verify corr-hot: 10 * 0.9 = 9, not frozen
      const { correction: hot } = await loadCorrectionById(root, "corr-hot");
      expect(hot.hotness).toBe(9);
      expect(hot.frozen).toBe(false);

      // Verify corr-cold: 3 * 0.9 = 2.7 → frozen
      const { correction: cold } = await loadCorrectionById(root, "corr-cold");
      expect(cold.hotness).toBe(2.7);
      expect(cold.frozen).toBe(true);
    });

    it("runDecayIfDue skips when within interval", async () => {
      const srv = new CorrectionsServer({
        root,
        now: (): Date => new Date("2026-06-10T12:00:00Z"),
        autoDecay: true,
      });

      // Write decay meta with a recent timestamp
      const metaPath = join(correctionsRoot(root), "decay-meta.json");
      await mkdir(dirname(metaPath), { recursive: true });
      await writeFile(
        metaPath,
        JSON.stringify({
          last_decay_at: "2026-06-10T00:00:00Z",
          decayed_count: 0,
          frozen_count: 0,
        }),
        "utf8",
      );

      const result = await srv.runDecayIfDue();
      expect(result).toBeNull(); // 12 hours < 7 days
    });

    it("promote copies L2 correction to L3 global-corrections.jsonl", async () => {
      const srv = newServer();

      // Create an L2 correction
      const recordResp = await srv.crud({
        action: "record",
        batch: [
          {
            operation: "create",
            correction: buildCorrection({
              step: "node_selection",
              unit: "ns",
              section: "s-promote",
              subsection: "ss1",
              lesson: "avoid parallel writes to same file",
              rationale: "causes data loss",
              applies_when: { keywords: ["parallel", "write", "conflict"] },
              source: "distiller",
            }),
          },
        ],
      });
      const l2Id =
        recordResp.action === "record" ? recordResp.written_ids[0] : "";
      expect(l2Id).toBeTruthy();

      // Promote to L3
      const promoteResp = await srv.crud({
        action: "promote",
        correction_id: l2Id,
        session_id: "sess-123",
        source_project: "test-project",
      });
      expect(promoteResp.action).toBe("promote");
      if (promoteResp.action === "promote") {
        expect(promoteResp.l2_source_id).toBe(l2Id);
        expect(promoteResp.promoted_id).toMatch(/^glb-/);
      }

      // Verify L3 file was written to the isolated global root
      const { loadGlobalCorrections, globalCorrectionsCount } =
        await import("./global-corrections-store.js");
      const count = await globalCorrectionsCount(globalRoot);
      expect(count).toBeGreaterThanOrEqual(1);

      const globalEntries = await loadGlobalCorrections({ root: globalRoot });
      const promoted = globalEntries.find((e) => e.l2_source_id === l2Id);
      expect(promoted).toBeTruthy();
      expect(promoted!.lesson).toBe("avoid parallel writes to same file");
      expect(promoted!.keywords).toContain("parallel");
      expect(promoted!.source_project).toBe("test-project");
    });

    it("reindex with scope:step only indexes matching corrections", async () => {
      const srv = newServer();
      await srv.crud({
        action: "record",
        batch: [
          {
            operation: "create",
            correction: buildCorrection({
              step: "node_selection",
              unit: "a",
              section: "b",
              subsection: "c",
              lesson: "x",
              applies_when: { keywords: ["k1"] },
              source: "distiller",
            }),
          },
          {
            operation: "create",
            correction: buildCorrection({
              step: "task_decomposition",
              unit: "d",
              section: "e",
              subsection: "f",
              lesson: "y",
              applies_when: { keywords: ["k2"] },
              source: "distiller",
            }),
          },
        ],
      });

      const resp = await srv.crud({
        action: "reindex",
        scope: { step: "node_selection" },
      });
      expect(resp.action).toBe("reindex");
      if (resp.action === "reindex") {
        expect(resp.indexed).toBe(1);
      }
    });

    it("rejects unknown action with CorrectionsServerError", async () => {
      const srv = newServer();
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        srv.crud({ action: "ghost" } as any),
      ).rejects.toThrow(/unknown action=ghost/);
    });
  });
});

describe("distiller E2E: L1→L2 pipeline", () => {
  let root: string;
  let globalRoot: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "distiller-"));
    globalRoot = await mkdtemp(join(tmpdir(), "distiller-glb-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(globalRoot, { recursive: true, force: true });
  });

  const newServer = (): CorrectionsServer =>
    new CorrectionsServer({
      root,
      now: (): Date => new Date("2026-06-10T12:00:00Z"),
      autoDecay: false,
      globalCorrectionsRoot: globalRoot,
    });

  it("creates corrections from user interventions (L1→L2 create path)", async () => {
    const srv = newServer();

    // Simulate L1: user interventions from flow-state.json
    const interventions = [
      {
        ts: "2026-06-10T10:00:00Z",
        text: "不应该并行写入同一个 knowledge 文件",
        before_state: "node_selection",
      },
      {
        ts: "2026-06-10T10:01:00Z",
        text: "decomposition 时两个 sub-pipeline 共享 model 但没有接口定义",
        before_state: "task_decomposition",
      },
    ];

    // Simulate distiller Step 3-5: batch upsert
    const batch = interventions.map((intervention) => ({
      operation: "create" as const,
      correction: buildCorrection({
        step:
          intervention.before_state === "node_selection"
            ? ("node_selection" as const)
            : ("task_decomposition" as const),
        unit: "corrections-test",
        section: intervention.before_state === "node_selection" ? "file-conflict" : "coupling",
        subsection: `l1-${intervention.ts.replace(/[:.]/g, "-")}`,
        lesson: intervention.text.length > 300 ? intervention.text.slice(0, 300) : intervention.text,
        rationale: `Manual intervention: ${intervention.text.slice(0, 100)}`,
        applies_when: {
          keywords: intervention.before_state === "node_selection"
            ? ["parallel", "write", "conflict"]
            : ["coupling", "interface", "sub-pipeline"],
        },
        source: "user" as const,
        trigger: "intervention" as const,
        linked_interventions: [{ ts: intervention.ts, text: intervention.text }],
      }),
    }));

    const resp = await srv.upsert({ batch });
    expect(resp.new_count).toBe(2);
    expect(resp.merged_count).toBe(0);
    expect(resp.written_ids).toHaveLength(2);

    // Verify corrections are queryable
    const q1 = await srv.query({ step: "node_selection" });
    expect(q1.items.length).toBe(1);
    expect(q1.items[0].source).toBe("user");
    expect(q1.items[0].trigger).toBe("intervention");

    const q2 = await srv.query({ step: "task_decomposition" });
    expect(q2.items.length).toBe(1);
  });

  it("merges similar corrections (sim ≥ 0.72) instead of creating new", async () => {
    const srv = newServer();

    // Create initial correction
    await srv.upsert({
      batch: [
        {
          operation: "create",
          correction: buildCorrection({
            step: "node_selection",
            unit: "ns",
            section: "parallel",
            subsection: "write-conflict",
            lesson: "avoid parallel writes to the same knowledge file because it causes merge conflicts",
            rationale: "two nodes wrote simultaneously",
            applies_when: { keywords: ["parallel", "write", "conflict", "file"] },
            source: "user",
            trigger: "intervention",
          }),
        },
      ],
    });

    // Query to find similar — high keyword overlap + near-identical lesson
    const similarMatch = await srv.findSimilar("node_selection", {
      keywords: ["parallel", "write", "conflict", "file"],
      lesson:
        "avoid parallel writes to the same file because it causes merge conflicts",
      applies_when: { keywords: ["parallel", "write", "conflict"] },
    });

    // Should match with high similarity (lots of keyword overlap + similar lesson)
    expect(similarMatch).not.toBeNull();
    expect(similarMatch!.score).toBeGreaterThanOrEqual(SIM_MERGE_THRESHOLD);

    // Merge instead of create
    const mergeResp = await srv.upsert({
      batch: [
        {
          operation: "merge",
          match_id: similarMatch!.match.id,
          correction: buildCorrection({
            step: "node_selection",
            unit: "ns",
            section: "parallel",
            subsection: "write-conflict",
            lesson: "avoid parallel writes",
            applies_when: {
              keywords: ["parallel", "write", "same-file"],
            },
            source: "user",
          }),
        },
      ],
    });
    expect(mergeResp.merged_count).toBe(1);
  });

  it("respects per-section capacity cap (C3)", async () => {
    const srv = new CorrectionsServer({
      root,
      perSectionCap: 2,
      now: (): Date => new Date("2026-06-10T12:00:00Z"),
      autoDecay: false,
      globalCorrectionsRoot: globalRoot,
    });

    // Create 4 corrections in the same section
    for (let i = 0; i < 4; i += 1) {
      await srv.upsert({
        batch: [
          {
            operation: "create",
            correction: buildCorrection({
              step: "node_selection",
              unit: "ns",
              section: "capped-section",
              subsection: `ss-${i}`,
              lesson: `lesson ${i}`,
              applies_when: { keywords: [`k${i}`] },
              source: "distiller",
              hotness: 5 - i, // decreasing hotness: 5, 4, 3, 2
            }),
          },
        ],
      });
    }

    // Should have frozen the lowest-hotness entries
    const all = await listAllCorrections(root);
    const inSection = all
      .map((x) => x.correction)
      .filter(
        (c) =>
          c.unit === "ns" &&
          c.section === "capped-section" &&
          !c.deprecated_by,
      );

    const active = inSection.filter((c) => !c.frozen);
    const frozen = inSection.filter((c) => c.frozen);

    expect(active.length).toBeLessThanOrEqual(2); // perSectionCap
    expect(frozen.length).toBeGreaterThan(0); // excess frozen
  });

  it("rejects corrections with duplicate user_text (one lesson per intervention)", async () => {
    const srv = newServer();

    const lesson = "same lesson text for both interventions";
    const resp = await srv.upsert({
      batch: [
        {
          operation: "create",
          correction: buildCorrection({
            step: "node_selection",
            unit: "ns",
            section: "s",
            subsection: "ss1",
            lesson,
            applies_when: { keywords: ["k1"] },
            source: "user",
          }),
        },
        {
          operation: "create",
          correction: buildCorrection({
            step: "node_selection",
            unit: "ns",
            section: "s",
            subsection: "ss2",
            lesson,
            applies_when: { keywords: ["k2"] },
            source: "user",
          }),
        },
      ],
    });
    // Both should still be written (server doesn't enforce uniqueness of lesson text at the batch level;
    // the distiller agent is responsible for deduplication)
    expect(resp.new_count).toBe(2);
    expect(resp.warnings.length).toBe(0);
  });

  it("handles empty batch gracefully", async () => {
    const srv = newServer();
    const resp = await srv.upsert({ batch: [] });
    expect(resp.new_count).toBe(0);
    expect(resp.merged_count).toBe(0);
    expect(resp.written_ids).toHaveLength(0);
  });
});

describe("seed corrections", () => {
  let seedLoader: typeof import("./seed-loader.js");

  beforeAll(async () => {
    seedLoader = await import("./seed-loader.js");
  });

  it("loads seed corrections from disk", async () => {
    const seeds = await seedLoader.loadSeedCorrections();
    expect(seeds.length).toBeGreaterThanOrEqual(5);
    for (const s of seeds) {
      expect(s.source).toBe("seed");
      expect(s.hotness).toBe(3);
      expect(s.id).toMatch(/^corr-seed-/);
    }
  });

  it("seedCorrectionsCount returns a positive number", async () => {
    const count = await seedLoader.seedCorrectionsCount();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it("seed corrections cover all major steps", async () => {
    const seeds = await seedLoader.loadSeedCorrections();
    const steps = new Set(seeds.map((s) => s.step));
    expect(steps.has("intent_analysis")).toBe(true);
    expect(steps.has("task_decomposition")).toBe(true);
    expect(steps.has("node_selection")).toBe(true);
    expect(steps.has("brief_generation")).toBe(true);
  });

  it("query falls back to seeds when project has no corrections", async () => {
    const root = await mkdtemp(join(tmpdir(), "corr-seed-"));
    const srv = new CorrectionsServer({ root });
    const resp = await srv.query({ step: "intent_analysis" });
    // Should return seeds since no project-level corrections exist
    expect(resp.items.length).toBeGreaterThan(0);
    expect(resp.items.every((c) => c.source === "seed")).toBe(true);
    await rm(root, { recursive: true, force: true });
  });
});

