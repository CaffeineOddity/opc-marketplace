/**
 * opc-status snapshot loader (M18.h).
 *
 * Walks `.opc/sessions/<sid>/{flow-state.json, pipelines/<pid>/{pipeline-plan.json,
 * sub-pipelines/<sub>/state.json}}` and produces a normalised in-memory snapshot
 * used by the renderer and `--json` mode. Pure read-only; no writes anywhere.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type {
  FlowState,
  PendingReflection,
  PendingUserQuestion,
  PipelinePointer,
  ReflectionLogEntry,
  UserIntervention,
  PipelinePlan,
  SubPipeline,
  StateJson,
  PhaseState,
  NodeState,
} from "@opc/state-server";
import {
  FLOW_STATE_FILENAME,
  SESSIONS_SUBDIR,
  PIPELINE_PLAN_FILENAME,
  PIPELINES_SUBDIR,
  SUB_PIPELINES_SUBDIR,
  STATE_FILENAME,
  VALIDATOR_LOGS_DIR,
} from "@opc/state-server";

export interface SnapshotOptions {
  /** Project root (defaults to process.cwd() / CLAUDE_PROJECT_DIR). */
  root: string;
  /** Specific session id; if omitted, picks newest session by mtime. */
  session_id?: string;
  /** Optional clock injection for deterministic tests. */
  now?: () => Date;
  /** Reflection-log tail size for the rendered view. Default 5. */
  reflection_tail?: number;
  /** Validator-artifact tail size. Default 5. */
  validator_tail?: number;
}

export interface NodeSnapshot {
  name: string;
  status: NodeState["status"];
  agent: string;
  blocked_by: string[];
  retry_count: number;
  max_retries: number;
  error: NodeState["error"];
  is_current: boolean;
}

export interface PhaseSnapshot {
  phase: string;
  status: PhaseState["status"];
  nodes: NodeSnapshot[];
  completed_count: number;
  total_count: number;
  is_current: boolean;
}

export interface SubPipelineSnapshot {
  id: string;
  title: string;
  status: SubPipeline["status"];
  blocked_by: string[];
  is_current: boolean;
  phases: PhaseSnapshot[];
  /** Optional load error per sub (we still surface the sub even if state.json is unreadable). */
  state_error?: string;
}

export interface ValidatorArtifactRef {
  path: string;
  step: "node_execution" | "phase_completion";
  phase: string;
  node?: string;
  outcome_summary: string;
  ran_at: string;
}

export interface PipelineSnapshot {
  id: string;
  description: string;
  status: PipelinePlan["status"];
  complexity: PipelinePlan["complexity"];
  sub_pipelines: SubPipelineSnapshot[];
  pointer: PipelinePointer | null;
}

export interface ExpiryMetrics {
  expired_pending_count_24h: number;
  expired_resumed_count_24h: number;
  expired_discarded_count_24h: number;
  expired_skipped_count_24h: number;
  artifact_purged_7d_count: number;
}

export interface SessionSnapshot {
  session_id: string;
  flow_state_path: string;
  status: FlowState["status"];
  current_step: FlowState["current_step"];
  current_step_round: number | null;
  last_active_at: string;
  pipeline: PipelineSnapshot | null;
  pending_reflections: PendingReflection[];
  pending_user_question: PendingUserQuestion | null;
  reflection_log_tail: ReflectionLogEntry[];
  user_interventions_tail: UserIntervention[];
  validator_artifacts_tail: ValidatorArtifactRef[];
  expiry_metrics: ExpiryMetrics;
  /** Non-fatal load warnings (missing files, parse errors per sub). */
  warnings: string[];
}

/**
 * Empty-state snapshot — emitted when no session exists yet (the project has
 * not started an OPC flow). Distinct from `SessionSnapshot` so the renderer
 * can present a friendly "no sessions" view instead of erroring.
 */
export interface EmptySnapshot {
  empty: true;
  /** Why there is no session: "missing" = no .opc/sessions dir; "empty" = dir exists but no flow-state.json. */
  reason: "missing" | "empty";
  /** Absolute path of the sessions dir we looked at. */
  sessions_dir: string;
  /** Absolute project root the snapshot was loaded against. */
  root: string;
}

export class SnapshotError extends Error {
  constructor(
    msg: string,
    public readonly code:
      | "ROOT_MISSING"
      | "NO_SESSIONS"
      | "SESSION_NOT_FOUND"
      | "FLOW_STATE_UNREADABLE",
  ) {
    super(msg);
    this.name = "SnapshotError";
  }
}

/** Result of `pickNewestSession` when `.opc/sessions/` is absent or empty. */
export interface NoSessionsResult {
  /** "missing" = dir doesn't exist; "empty" = dir exists but no flow-state.json. */
  reason: "missing" | "empty";
  /** Absolute path of the sessions dir we looked at. */
  dir: string;
}

/**
 * Auto-pick the newest session under `.opc/sessions/` (by mtime of the
 * flow-state.json file, falling back to dir mtime).
 *
 * Returns `{ reason, dir }` instead of throwing when the sessions dir is
 * missing or empty — the caller renders a friendly empty state rather than
 * erroring. A truly empty project (no flow started yet) is a normal state,
 * not a failure.
 */
export async function pickNewestSession(
  root: string,
): Promise<string | NoSessionsResult> {
  const dir = join(root, SESSIONS_SUBDIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return { reason: "missing", dir };
    throw err;
  }
  if (entries.length === 0) return { reason: "empty", dir };

  const stamped: Array<{ id: string; mtime: number }> = [];
  for (const id of entries) {
    const flowPath = join(dir, id, FLOW_STATE_FILENAME);
    try {
      const st = await stat(flowPath);
      stamped.push({ id, mtime: st.mtimeMs });
    } catch {
      // ignore sessions without flow-state.json
    }
  }
  if (stamped.length === 0) return { reason: "empty", dir };
  stamped.sort((a, b) => b.mtime - a.mtime);
  return stamped[0]!.id;
}

export async function loadSnapshot(
  opts: SnapshotOptions,
): Promise<SessionSnapshot | EmptySnapshot> {
  const picked = opts.session_id ?? (await pickNewestSession(opts.root));
  if (typeof picked !== "string") {
    return {
      empty: true,
      reason: picked.reason,
      sessions_dir: picked.dir,
      root: opts.root,
    };
  }
  const sessionId = picked;
  const flowPath = join(opts.root, SESSIONS_SUBDIR, sessionId, FLOW_STATE_FILENAME);

  let flow: FlowState;
  try {
    const raw = await readFile(flowPath, "utf8");
    flow = JSON.parse(raw) as FlowState;
  } catch (err) {
    if (isENOENT(err))
      throw new SnapshotError(`session ${sessionId} not found`, "SESSION_NOT_FOUND");
    throw new SnapshotError(
      `flow-state.json unreadable: ${(err as Error).message}`,
      "FLOW_STATE_UNREADABLE",
    );
  }

  const warnings: string[] = [];
  let pipeline: PipelineSnapshot | null = null;
  if (flow.pipeline_id) {
    pipeline = await loadPipelineSnapshot(
      opts.root,
      sessionId,
      flow.pipeline_id,
      flow.current_pipeline_pointer,
      warnings,
    );
  }

  const validator_artifacts_tail = await loadValidatorTail(
    opts.root,
    sessionId,
    opts.validator_tail ?? 5,
    warnings,
  );

  const expiry_metrics = computeExpiryMetrics(
    flow,
    opts.now ? opts.now() : new Date(),
  );

  return {
    session_id: sessionId,
    flow_state_path: flowPath,
    status: flow.status,
    current_step: flow.current_step,
    current_step_round: flow.current_step_round,
    last_active_at: flow.last_active_at,
    pipeline,
    pending_reflections: [...flow.pending_reflections],
    pending_user_question: flow.pending_user_question,
    reflection_log_tail: tail(flow.reflection_log, opts.reflection_tail ?? 5),
    user_interventions_tail: tail(flow.user_interventions, opts.reflection_tail ?? 5),
    validator_artifacts_tail,
    expiry_metrics,
    warnings,
  };
}

async function loadPipelineSnapshot(
  root: string,
  sessionId: string,
  pipelineId: string,
  pointer: PipelinePointer | null,
  warnings: string[],
): Promise<PipelineSnapshot | null> {
  const planPath = join(
    root,
    SESSIONS_SUBDIR,
    sessionId,
    PIPELINES_SUBDIR,
    pipelineId,
    PIPELINE_PLAN_FILENAME,
  );
  let plan: PipelinePlan;
  try {
    plan = JSON.parse(await readFile(planPath, "utf8")) as PipelinePlan;
  } catch (err) {
    warnings.push(`pipeline-plan.json unreadable for ${pipelineId}: ${(err as Error).message}`);
    return null;
  }

  const currentSubId = pointer?.sub_pipeline_id ?? null;
  const subs: SubPipelineSnapshot[] = [];
  for (const sub of plan.sub_pipelines) {
    const subSnap = await loadSubPipelineSnapshot(
      root,
      sessionId,
      pipelineId,
      sub,
      pointer,
      currentSubId === sub.id,
      warnings,
    );
    subs.push(subSnap);
  }

  return {
    id: plan.id,
    description: plan.description,
    status: plan.status,
    complexity: plan.complexity,
    sub_pipelines: subs,
    pointer: pointer ?? null,
  };
}

async function loadSubPipelineSnapshot(
  root: string,
  sessionId: string,
  pipelineId: string,
  sub: SubPipeline,
  pointer: PipelinePointer | null,
  isCurrent: boolean,
  warnings: string[],
): Promise<SubPipelineSnapshot> {
  const statePath = join(
    root,
    SESSIONS_SUBDIR,
    sessionId,
    PIPELINES_SUBDIR,
    pipelineId,
    SUB_PIPELINES_SUBDIR,
    sub.id,
    STATE_FILENAME,
  );
  let state: StateJson | null = null;
  let stateError: string | undefined;
  try {
    state = JSON.parse(await readFile(statePath, "utf8")) as StateJson;
  } catch (err) {
    if (isENOENT(err)) {
      // pending sub may legitimately have no state.json yet — silent.
    } else {
      stateError = (err as Error).message;
      warnings.push(`state.json unreadable for ${sub.id}: ${stateError}`);
    }
  }

  const currentPhase = isCurrent ? (pointer?.phase ?? null) : null;
  const currentNode = isCurrent ? (pointer?.node ?? null) : null;

  const phases: PhaseSnapshot[] = (state?.phases ?? []).map((p) => {
    const nodes: NodeSnapshot[] = p.nodes.map((n) => ({
      name: n.name,
      status: n.status,
      agent: n.agent,
      blocked_by: [...n.blocked_by],
      retry_count: n.retry_count,
      max_retries: n.max_retries,
      error: n.error,
      is_current: isCurrent && p.phase === currentPhase && n.name === currentNode,
    }));
    const total = nodes.length;
    const completed = nodes.filter((n) => n.status === "completed").length;
    return {
      phase: p.phase,
      status: p.status,
      nodes,
      completed_count: completed,
      total_count: total,
      is_current: isCurrent && p.phase === currentPhase,
    };
  });

  const out: SubPipelineSnapshot = {
    id: sub.id,
    title: sub.title,
    status: sub.status,
    blocked_by: [...sub.blocked_by],
    is_current: isCurrent,
    phases,
  };
  if (stateError !== undefined) out.state_error = stateError;
  return out;
}

async function loadValidatorTail(
  root: string,
  sessionId: string,
  limit: number,
  warnings: string[],
): Promise<ValidatorArtifactRef[]> {
  const dir = join(root, VALIDATOR_LOGS_DIR, sessionId);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return [];
    warnings.push(`validator log dir unreadable: ${(err as Error).message}`);
    return [];
  }

  const refs: ValidatorArtifactRef[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    try {
      const raw = await readFile(path, "utf8");
      const a = JSON.parse(raw) as {
        step: "node_execution" | "phase_completion";
        phase: string;
        node?: string;
        validator_results: Record<string, "pass" | "fail">;
        ran_at: string;
      };
      const summary = Object.entries(a.validator_results)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
      const ref: ValidatorArtifactRef = {
        path,
        step: a.step,
        phase: a.phase,
        outcome_summary: summary,
        ran_at: a.ran_at,
      };
      if (a.node !== undefined) ref.node = a.node;
      refs.push(ref);
    } catch (err) {
      warnings.push(`validator artifact ${name} unreadable: ${(err as Error).message}`);
    }
  }
  refs.sort((a, b) => (a.ran_at < b.ran_at ? 1 : -1));
  return refs.slice(0, limit);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function computeExpiryMetrics(flow: FlowState, now: Date): ExpiryMetrics {
  const dayCutoff = now.getTime() - DAY_MS;
  const weekCutoff = now.getTime() - WEEK_MS;
  const m: ExpiryMetrics = {
    expired_pending_count_24h: 0,
    expired_resumed_count_24h: 0,
    expired_discarded_count_24h: 0,
    expired_skipped_count_24h: 0,
    artifact_purged_7d_count: 0,
  };

  for (const p of flow.pending_reflections) {
    if (p.status === "expired_pending_decision") {
      const expiredAt = Date.parse(p.expires_at);
      if (Number.isFinite(expiredAt) && expiredAt >= dayCutoff) {
        m.expired_pending_count_24h += 1;
      }
    }
  }

  for (const iv of flow.user_interventions) {
    const at = Date.parse(iv.at);
    if (!Number.isFinite(at) || at < dayCutoff) continue;
    if (iv.trigger === "expired_reflection_resumed") m.expired_resumed_count_24h += 1;
    if (iv.trigger === "expired_reflection_discarded") m.expired_discarded_count_24h += 1;
    if (iv.trigger === "expired_reflection_skipped") m.expired_skipped_count_24h += 1;
  }

  for (const e of flow.reflection_log) {
    const at = Date.parse(e.at);
    if (!Number.isFinite(at)) continue;
    if (e.verdict === "discarded_by_user_after_expiry" && at >= weekCutoff) {
      m.artifact_purged_7d_count += 1;
    }
  }

  return m;
}

function tail<T>(arr: T[], n: number): T[] {
  if (n <= 0 || arr.length === 0) return [];
  return arr.slice(Math.max(0, arr.length - n));
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
