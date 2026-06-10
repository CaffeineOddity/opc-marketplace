/**
 * Tests for the opc-status CLI (M18.h).
 *
 * The fixtures here write `.opc/sessions/<sid>/...` skeletons by hand rather
 * than going through the state-server, so we exercise the snapshot loader and
 * renderer in isolation. The shape mirrors what the live servers persist
 * (flow-state.json, pipelines/<pid>/pipeline-plan.json,
 * pipelines/<pid>/sub-pipelines/<sub>/state.json, opc-logs/validator/<sid>/*).
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadSnapshot,
  pickNewestSession,
  renderSnapshot,
  parseArgs,
  run,
  SnapshotError,
  type SessionSnapshot,
} from "../src/opc-status/index.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opc-status-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface SessionFixture {
  session_id: string;
  flow_partial?: Record<string, unknown>;
  pipeline?: {
    id: string;
    description?: string;
    status?: string;
    sub_pipelines: Array<{
      id: string;
      title: string;
      status?: string;
      blocked_by?: string[];
      state?: Record<string, unknown>;
    }>;
  };
  validator_artifacts?: Array<{
    name: string;
    step: "node_execution" | "phase_completion";
    phase: string;
    node?: string;
    validator_results: Record<string, "pass" | "fail">;
    ran_at: string;
  }>;
}

async function writeFixture(fx: SessionFixture): Promise<string> {
  const sid = fx.session_id;
  const sessDir = join(root, ".opc/sessions", sid);
  await mkdir(sessDir, { recursive: true });

  const baseFlow = {
    session_id: sid,
    status: "in_progress",
    owner: { pid: 1, started_at: "2026-06-10T00:00:00.000Z", last_heartbeat_at: "2026-06-10T00:00:00.000Z" },
    created_at: "2026-06-10T00:00:00.000Z",
    last_active_at: "2026-06-10T00:00:00.000Z",
    aborted_at: null,
    abort_reason: null,
    completed_at: null,
    current_step: "intent_analysis",
    current_step_round: null,
    user_message_history: [],
    accumulated: {
      intent: null,
      intent_evidence_ref: null,
      analysis_result: null,
      analysis_evidence_ref: null,
      decomposition_result: null,
      decomposition_evidence_ref: null,
      brief_content: null,
      brief_evidence_ref: null,
    },
    history: [],
    reflection_log: [],
    pending_reflections: [],
    pending_user_question: null,
    user_interventions: [],
    pipeline_id: fx.pipeline?.id ?? null,
    current_pipeline_pointer: null,
    skip_reflection_once_for_step: null,
  };
  const flow = { ...baseFlow, ...(fx.flow_partial ?? {}) };
  await writeFile(join(sessDir, "flow-state.json"), JSON.stringify(flow, null, 2), "utf8");

  if (fx.pipeline) {
    const pipDir = join(sessDir, "pipelines", fx.pipeline.id);
    await mkdir(pipDir, { recursive: true });
    const plan = {
      id: fx.pipeline.id,
      description: fx.pipeline.description ?? "test pipeline",
      complexity: "medium",
      status: fx.pipeline.status ?? "in_progress",
      knowledge_unit: [],
      owner: { session_id: sid, pid: 1, since: "2026-06-10T00:00:00.000Z" },
      sub_pipelines: fx.pipeline.sub_pipelines.map((s) => ({
        id: s.id,
        title: s.title,
        knowledge_unit: [],
        status: s.status ?? "pending",
        blocked_by: s.blocked_by ?? [],
      })),
      execution_order: [],
      replan_history: [],
      created_at: "2026-06-10T00:00:00.000Z",
      last_active_at: "2026-06-10T00:00:00.000Z",
    };
    await writeFile(join(pipDir, "pipeline-plan.json"), JSON.stringify(plan, null, 2), "utf8");

    for (const sub of fx.pipeline.sub_pipelines) {
      if (!sub.state) continue;
      const subDir = join(pipDir, "sub-pipelines", sub.id);
      await mkdir(subDir, { recursive: true });
      await writeFile(join(subDir, "state.json"), JSON.stringify(sub.state, null, 2), "utf8");
    }
  }

  if (fx.validator_artifacts) {
    const valDir = join(root, "opc-logs/validator", sid);
    await mkdir(valDir, { recursive: true });
    for (const a of fx.validator_artifacts) {
      await writeFile(
        join(valDir, a.name),
        JSON.stringify(
          {
            step: a.step,
            session_id: sid,
            pipeline_id: fx.pipeline?.id ?? "",
            sub_pipeline_id: "",
            phase: a.phase,
            ...(a.node !== undefined ? { node: a.node } : {}),
            validator_results: a.validator_results,
            ran_at: a.ran_at,
            ran_by: "state-manager",
          },
          null,
          2,
        ),
        "utf8",
      );
    }
  }
  return sid;
}

function nodeState(args: {
  name: string;
  status: string;
  agent?: string;
  blocked_by?: string[];
  retry_count?: number;
  max_retries?: number;
  error?: { message: string; type: string } | null;
}): Record<string, unknown> {
  return {
    name: args.name,
    status: args.status,
    agent: args.agent ?? "",
    blocked_by: args.blocked_by ?? [],
    input: [],
    output: [],
    error: args.error ?? null,
    timeout_minutes: 30,
    retry_count: args.retry_count ?? 0,
    max_retries: args.max_retries ?? 2,
  };
}

function subState(args: {
  id: string;
  title: string;
  phases: Array<{ phase: string; status: string; nodes: Array<Record<string, unknown>> }>;
}): Record<string, unknown> {
  return {
    id: args.id,
    title: args.title,
    task: {
      description: args.title,
      tags: [],
      complexity: "medium",
      knowledge_unit: [],
      scenario_hints: [],
    },
    status: "in_progress",
    phase_plan: {
      available: args.phases.map((p) => p.phase),
      selected: args.phases.map((p) => p.phase),
      selected_by: "task_decomposition",
      selection_rationale: "",
      scenario_hints: [],
      order_validated: true,
    },
    phases: args.phases,
    created_at: "2026-06-10T00:00:00.000Z",
    last_active_at: "2026-06-10T00:00:00.000Z",
  };
}

describe("opc-status: parseArgs", () => {
  it("defaults json/help/session to falsy", () => {
    const a = parseArgs([]);
    expect(a).toEqual({ json: false, help: false, unknown: [] });
  });
  it("parses --json and --help", () => {
    expect(parseArgs(["--json"]).json).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });
  it("parses --session and --root", () => {
    const a = parseArgs(["--session", "s-1", "--root", "/tmp/x"]);
    expect(a.session_id).toBe("s-1");
    expect(a.root).toBe("/tmp/x");
  });
  it("throws on --session without value", () => {
    expect(() => parseArgs(["--session"])).toThrow(/--session requires a value/);
  });
  it("collects unknown flags", () => {
    const a = parseArgs(["--bogus"]);
    expect(a.unknown).toEqual(["--bogus"]);
  });
});

describe("opc-status: pickNewestSession", () => {
  it("throws NO_SESSIONS when .opc/sessions/ missing", async () => {
    await expect(pickNewestSession(root)).rejects.toBeInstanceOf(SnapshotError);
  });
  it("throws NO_SESSIONS when sessions exist but no flow-state.json", async () => {
    await mkdir(join(root, ".opc/sessions/empty-sess"), { recursive: true });
    await expect(pickNewestSession(root)).rejects.toMatchObject({ code: "NO_SESSIONS" });
  });
  it("returns the only session id", async () => {
    await writeFixture({ session_id: "s-only" });
    expect(await pickNewestSession(root)).toBe("s-only");
  });
});

describe("opc-status: loadSnapshot — empty session (no pipeline)", () => {
  it("returns snapshot with null pipeline + zero metrics", async () => {
    await writeFixture({ session_id: "s-empty" });
    const snap = await loadSnapshot({ root, session_id: "s-empty" });
    expect(snap.session_id).toBe("s-empty");
    expect(snap.pipeline).toBeNull();
    expect(snap.pending_reflections).toEqual([]);
    expect(snap.pending_user_question).toBeNull();
    expect(snap.expiry_metrics.expired_pending_count_24h).toBe(0);
    expect(snap.warnings).toEqual([]);
  });
  it("throws SESSION_NOT_FOUND for unknown session", async () => {
    await writeFixture({ session_id: "s-real" });
    await expect(loadSnapshot({ root, session_id: "s-missing" })).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
    });
  });
});

describe("opc-status: loadSnapshot — single sub-pipeline happy path", () => {
  it("renders phase + node tree, marks current node, computes counts", async () => {
    await writeFixture({
      session_id: "s-single",
      flow_partial: {
        pipeline_id: "pl-1",
        current_step: "phase_execution",
        current_pipeline_pointer: {
          pipeline_id: "pl-1",
          sub_pipeline_id: "sub-1",
          phase: "05-implement",
          node: "tdd-implementation",
        },
      },
      pipeline: {
        id: "pl-1",
        description: "user-auth",
        status: "in_progress",
        sub_pipelines: [
          {
            id: "sub-1",
            title: "认证模块",
            status: "in_progress",
            state: subState({
              id: "sub-1",
              title: "认证模块",
              phases: [
                {
                  phase: "04-implement-design",
                  status: "completed",
                  nodes: [
                    nodeState({ name: "api-design", status: "completed", agent: "backend-engineer" }),
                    nodeState({ name: "database-schema", status: "completed", agent: "database-engineer" }),
                  ],
                },
                {
                  phase: "05-implement",
                  status: "in_progress",
                  nodes: [
                    nodeState({ name: "tdd-implementation", status: "in_progress", agent: "backend-engineer" }),
                    nodeState({ name: "auth-integration", status: "pending", agent: "", blocked_by: ["tdd-implementation"] }),
                  ],
                },
              ],
            }),
          },
        ],
      },
    });
    const snap = await loadSnapshot({ root, session_id: "s-single" });
    expect(snap.pipeline).not.toBeNull();
    const sub = snap.pipeline!.sub_pipelines[0]!;
    expect(sub.id).toBe("sub-1");
    expect(sub.is_current).toBe(true);
    expect(sub.phases).toHaveLength(2);

    const phase4 = sub.phases[0]!;
    expect(phase4.completed_count).toBe(2);
    expect(phase4.total_count).toBe(2);

    const phase5 = sub.phases[1]!;
    expect(phase5.is_current).toBe(true);
    const tddNode = phase5.nodes.find((n) => n.name === "tdd-implementation");
    expect(tddNode?.is_current).toBe(true);

    const rendered = renderSnapshot(snap);
    expect(rendered).toContain("user-auth");
    expect(rendered).toContain("✓");
    expect(rendered).toContain("⟳");
    expect(rendered).toContain("← 当前");
    expect(rendered).toContain("tdd-implementation");
  });
});

describe("opc-status: loadSnapshot — multi-sub split with blocked subs", () => {
  it("expands current sub, collapses pending subs with dependency hints", async () => {
    await writeFixture({
      session_id: "s-multi",
      flow_partial: {
        pipeline_id: "pl-shop",
        current_step: "phase_execution",
        current_pipeline_pointer: {
          pipeline_id: "pl-shop",
          sub_pipeline_id: "sub-2",
          phase: "05-implement",
          node: "tdd-implementation",
        },
      },
      pipeline: {
        id: "pl-shop",
        description: "电商系统",
        sub_pipelines: [
          { id: "sub-1", title: "商品管理", status: "completed" },
          {
            id: "sub-2",
            title: "用户中心",
            status: "in_progress",
            state: subState({
              id: "sub-2",
              title: "用户中心",
              phases: [
                {
                  phase: "05-implement",
                  status: "in_progress",
                  nodes: [nodeState({ name: "tdd-implementation", status: "in_progress", agent: "backend-engineer" })],
                },
              ],
            }),
          },
          { id: "sub-3", title: "购物车", status: "pending", blocked_by: ["sub-1", "sub-2"] },
        ],
      },
    });
    const snap = await loadSnapshot({ root, session_id: "s-multi" });
    const rendered = renderSnapshot(snap);
    expect(rendered).toContain("sub-1: 商品管理");
    expect(rendered).toContain("sub-2: 用户中心");
    expect(rendered).toContain("← 当前");
    expect(rendered).toContain("等待 sub-1, sub-2");
    expect(rendered).toContain("tdd-implementation");
  });
});

describe("opc-status: loadSnapshot — failed node + warnings", () => {
  it("shows error type and surfaces missing state.json warning", async () => {
    await writeFixture({
      session_id: "s-failed",
      flow_partial: {
        pipeline_id: "pl-x",
        current_pipeline_pointer: {
          pipeline_id: "pl-x",
          sub_pipeline_id: "sub-bad",
          phase: "05-implement",
          node: "broken",
        },
      },
      pipeline: {
        id: "pl-x",
        sub_pipelines: [
          {
            id: "sub-bad",
            title: "broken sub",
            status: "failed",
            state: subState({
              id: "sub-bad",
              title: "broken sub",
              phases: [
                {
                  phase: "05-implement",
                  status: "blocked",
                  nodes: [
                    nodeState({
                      name: "broken",
                      status: "failed",
                      agent: "x",
                      retry_count: 2,
                      max_retries: 2,
                      error: { message: "boom", type: "RUNTIME" },
                    }),
                  ],
                },
              ],
            }),
          },
        ],
      },
    });
    // Corrupt state.json so we exercise the warning path on another sub
    // (here we only have one sub; instead corrupt the validator dir)
    const snap = await loadSnapshot({ root, session_id: "s-failed" });
    const out = renderSnapshot(snap);
    expect(out).toContain("✗");
    expect(out).toContain("err=RUNTIME");
    expect(out).toContain("retry 2/2");
  });
});

describe("opc-status: validator artifact tail", () => {
  it("includes most recent validator artifacts sorted desc", async () => {
    await writeFixture({
      session_id: "s-val",
      validator_artifacts: [
        {
          name: "node_execution-1.json",
          step: "node_execution",
          phase: "05-implement",
          node: "n1",
          validator_results: { v1: "pass", v2: "pass" },
          ran_at: "2026-06-10T10:00:00.000Z",
        },
        {
          name: "phase_completion-1.json",
          step: "phase_completion",
          phase: "05-implement",
          validator_results: { v3: "pass", l2: "fail" },
          ran_at: "2026-06-10T11:00:00.000Z",
        },
      ],
    });
    const snap = await loadSnapshot({ root, session_id: "s-val", validator_tail: 5 });
    expect(snap.validator_artifacts_tail).toHaveLength(2);
    expect(snap.validator_artifacts_tail[0]!.ran_at).toBe("2026-06-10T11:00:00.000Z");
    expect(snap.validator_artifacts_tail[0]!.outcome_summary).toContain("l2=fail");
    const out = renderSnapshot(snap);
    expect(out).toContain("Validator 产物");
    expect(out).toContain("l2=fail");
  });
});

describe("opc-status: expiry metrics from flow-state", () => {
  it("counts expired/resumed/discarded/skipped within 24h window", async () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    await writeFixture({
      session_id: "s-exp",
      flow_partial: {
        pending_reflections: [
          {
            reflection_id: "ref-1",
            artifact_path: "/x",
            step_id: "P5",
            issued_by: "tool",
            issued_at: "2026-06-10T08:00:00.000Z",
            expires_at: "2026-06-10T08:30:00.000Z",
            must_be_registered_by: "opc_flow_reflect",
            status: "expired_pending_decision",
          },
        ],
        user_interventions: [
          { intervention_id: "iv-1", trigger: "expired_reflection_resumed", step_id: "P5", at: "2026-06-10T09:00:00.000Z" },
          { intervention_id: "iv-2", trigger: "expired_reflection_discarded", step_id: "P5", at: "2026-06-10T09:05:00.000Z" },
          { intervention_id: "iv-3", trigger: "expired_reflection_skipped", step_id: "P6", at: "2026-06-10T09:10:00.000Z" },
          { intervention_id: "iv-old", trigger: "expired_reflection_resumed", step_id: "P5", at: "2026-06-05T09:00:00.000Z" },
        ],
        reflection_log: [
          { step_id: "P5", verdict: "discarded_by_user_after_expiry", at: "2026-06-09T08:00:00.000Z" },
          { step_id: "P5", verdict: "discarded_by_user_after_expiry", at: "2026-05-15T08:00:00.000Z" },
        ],
      },
    });
    const snap = await loadSnapshot({ root, session_id: "s-exp", now: () => now });
    expect(snap.expiry_metrics).toEqual({
      expired_pending_count_24h: 1,
      expired_resumed_count_24h: 1,
      expired_discarded_count_24h: 1,
      expired_skipped_count_24h: 1,
      artifact_purged_7d_count: 1,
    });
  });
});

describe("opc-status: CLI run() — text vs JSON output", () => {
  function fakeIO(overrides: Partial<{ env: NodeJS.ProcessEnv }> = {}): {
    out: string;
    err: string;
    code: number | null;
    io: Parameters<typeof run>[1];
  } {
    const captured = { out: "", err: "", code: null as number | null };
    return {
      get out() { return captured.out; },
      get err() { return captured.err; },
      get code() { return captured.code; },
      io: {
        stdout: (s: string) => { captured.out += s; },
        stderr: (s: string) => { captured.err += s; },
        exit: (code: number) => { captured.code = code; },
        cwd: () => root,
        env: overrides.env ?? {},
      },
    };
  }

  it("renders help with --help and exits 0", async () => {
    const ctx = fakeIO();
    await run(["--help"], ctx.io);
    expect(ctx.out).toContain("opc-status — read-only health snapshot");
    expect(ctx.code).toBe(0);
  });

  it("exits 1 when no sessions exist", async () => {
    const ctx = fakeIO();
    await run([], ctx.io);
    expect(ctx.code).toBe(1);
    expect(ctx.err).toContain("opc-status:");
  });

  it("exits 2 on unknown flag", async () => {
    const ctx = fakeIO();
    await run(["--bogus"], ctx.io);
    expect(ctx.code).toBe(2);
    expect(ctx.err).toContain("unknown args");
  });

  it("renders default human output for an existing session", async () => {
    await writeFixture({ session_id: "s-cli" });
    const ctx = fakeIO();
    await run(["--session", "s-cli"], ctx.io);
    expect(ctx.code).toBe(0);
    expect(ctx.out).toContain("会话: s-cli");
    expect(ctx.out).toContain("管线: <未创建>");
  });

  it("emits JSON snapshot with --json", async () => {
    await writeFixture({ session_id: "s-json" });
    const ctx = fakeIO();
    await run(["--session", "s-json", "--json"], ctx.io);
    expect(ctx.code).toBe(0);
    const parsed: SessionSnapshot = JSON.parse(ctx.out);
    expect(parsed.session_id).toBe("s-json");
    expect(parsed.pipeline).toBeNull();
    expect(parsed.expiry_metrics).toBeDefined();
  });

  it("auto-picks newest session when --session omitted", async () => {
    await writeFixture({ session_id: "s-older" });
    // Sleep to ensure mtime differs; on darwin tmpfs this is usually enough.
    await new Promise((r) => setTimeout(r, 10));
    await writeFixture({ session_id: "s-newer" });
    const ctx = fakeIO();
    await run([], ctx.io);
    expect(ctx.code).toBe(0);
    expect(ctx.out).toContain("会话: s-newer");
  });

  it("--root overrides CWD discovery", async () => {
    await writeFixture({ session_id: "s-root" });
    const ctx = fakeIO({ env: {} });
    await run(["--root", root, "--session", "s-root"], ctx.io);
    expect(ctx.code).toBe(0);
    expect(ctx.out).toContain("会话: s-root");
  });
});

describe("opc-status: pending reflections + user questions surfacing", () => {
  it("lists pending reflections with EXPIRED flag", async () => {
    await writeFixture({
      session_id: "s-pend",
      flow_partial: {
        pending_reflections: [
          {
            reflection_id: "ref-1",
            artifact_path: "/x",
            step_id: "P5",
            issued_by: "tool",
            issued_at: "2026-06-10T08:00:00.000Z",
            expires_at: "2026-06-10T08:30:00.000Z",
            must_be_registered_by: "opc_flow_reflect",
            status: "expired_pending_decision",
          },
        ],
        pending_user_question: {
          question_id: "uq-rs-unavailable-abc",
          step_id: "P5",
          round: 0,
          asked_at: "2026-06-10T09:00:00.000Z",
          expires_at: "2026-06-10T09:30:00.000Z",
          must_be_resolved_by: "opc_flow_user_reply",
          reasoning_trace: [],
          kept_objections: [],
          context_artifacts: [],
        },
      },
    });
    const snap = await loadSnapshot({ root, session_id: "s-pend" });
    const out = renderSnapshot(snap);
    expect(out).toContain("待办反思");
    expect(out).toContain("[EXPIRED]");
    expect(out).toContain("待回复问题");
    expect(out).toContain("uq-rs-unavailable-abc");
  });
});
