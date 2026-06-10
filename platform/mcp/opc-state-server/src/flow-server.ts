import { randomUUID } from "node:crypto";

import {
  type Accumulated,
  type FlowState,
  type FlowStep,
  type HistoryEntry,
  type Intent,
  type PendingReflection,
  type PendingUserQuestion,
  type PipelinePointer,
  type ReflectionLogEntry,
  type SubPipelineSpec,
  type UserIntervention,
  loadFlowState,
  newFlowState,
  saveFlowState,
} from "./flow-state.js";
import { deriveSessionId, parseSessionId } from "./session-id.js";
import {
  type OrphanScanResult,
  type SuggestedAction,
  scanForOrphans,
} from "./orphan-scanner.js";
import {
  type KitWarning,
  type KitSuggestedAction,
  checkKitHealth,
} from "./kit-health.js";
import {
  type TransportMode,
  TransportArgError,
  resolveClaudePid,
} from "./transport.js";

export interface FlowServerOptions {
  root: string;
  now?: () => Date;
  pid?: () => number;
  uuid?: () => string;
  /**
   * Spec §06-host-contract §2.3 (C2): server-startup transport mode.
   * Defaults to "stdio". In "stdio" mode, `claude_pid` arguments on
   * `opc_flow_query` / `opc_flow_lifecycle` are rejected (server uses ppid).
   */
  transport?: TransportMode;
  ppid?: () => number;
  /**
   * Spec §06-host-contract §2.2 (C1 配套): orphan-detection aliveness probe
   * injectable for tests. Defaults to process.kill(pid, 0).
   */
  isAlive?: (pid: number) => boolean;
}

export type FlowNext =
  | { tool: "opc_flow_step_complete"; step: FlowStep }
  | { tool: "opc_flow_reflect" }
  | { tool: "opc_flow_user_reply" }
  | { tool: "opc_pipeline_create" }
  | { tool: "opc_phase_start" }
  | { tool: "completed" }
  | { tool: "aborted" };

export interface QueryRequest {
  session_id: string;
  /**
   * Spec §06-host-contract §2.3 (C2): HTTP/SSE callers MAY pass the Claude
   * Code pid here. In stdio mode this MUST be omitted — the server uses
   * `process.ppid` and rejects an explicit param (line 113).
   */
  claude_pid?: number;
}

export interface QueryResponse {
  state: FlowState;
  next: FlowNext;
  /**
   * Spec §06-host-contract §2.2 (C1 配套): in-progress sessions whose
   * owner.pid is dead on this host. Populated only in stdio mode (kill(pid,0)
   * carries truth). Each candidate has a matching entry in `suggested_actions`
   * recommending an `opc_flow_lifecycle({action:"recover"})` call.
   */
  orphan_candidates?: OrphanScanResult["orphan_candidates"];
  /**
   * Spec §06-host-contract §2.7.5 (A4): non-fatal warnings — currently
   * KIT_PROBABLY_NOT_LOADED, emitted when a kit was installed after the
   * current session started (almost certainly not loaded into the Claude
   * Code process). Surfaced so Claude can ask the user to restart instead
   * of failing inside a Task dispatch.
   */
  _warnings?: KitWarning[];
  suggested_actions?: Array<SuggestedAction | KitSuggestedAction>;
}

export type LifecycleRequest =
  | {
      action: "start";
      session_id?: string;
      initial_message?: string;
      /**
       * @deprecated test/internal override. External callers should pass
       * `claude_pid` (subject to transport guard, spec §06-host-contract §2.3).
       */
      pid?: number;
      claude_pid?: number;
    }
  | { action: "abort"; session_id: string; reason?: string }
  | { action: "recover"; session_id: string; pid?: number; claude_pid?: number };

export interface LifecycleResponse {
  state: FlowState;
  next: FlowNext;
}

export type StepCompleteRequest =
  | {
      step: "intent_analysis";
      session_id: string;
      intent: Intent;
      intent_evidence_ref?: string;
      reasoning?: string;
    }
  | {
      step: "task_analysis";
      session_id: string;
      analysis_result: Accumulated["analysis_result"];
      task_analysis_evidence_ref?: string;
    }
  | {
      step: "task_decomposition";
      session_id: string;
      sub_pipelines: SubPipelineSpec[];
      execution_order?: string[][];
      decomposition_evidence_ref?: string;
    }
  | {
      step: "brief_generation";
      session_id: string;
      brief_content: string;
      brief_evidence_ref?: string;
    };

export interface StepCompleteResponse {
  state: FlowState;
  next: FlowNext;
}

export interface ReflectRequest {
  session_id: string;
  reflection_id: string;
  artifact_path?: string;
  step_id?: string;
  round?: number;
  method?: string;
  evidence_diff?: ReflectionLogEntry["evidence_diff"];
  validator_result?: ReflectionLogEntry["validator_result"];
  objections_kept_by_meta?: number;
  notes?: string;
  verdict?: "ok" | "rounds_exceeded";
  rounds_exceeded_payload?: {
    reasoning_trace: string[];
    kept_objections: PendingUserQuestion["kept_objections"];
    context_artifacts: string[];
  };
  pipeline_pointer_ref?: PipelinePointer | null;
}

export interface ReflectResponse {
  state: FlowState;
  next: FlowNext;
  registered: boolean;
}

export interface UserReplyRequest {
  session_id: string;
  question_id: string;
  user_reply: string;
  resolution: UserIntervention["resolution"];
}

export interface UserReplyResponse {
  state: FlowState;
  next: FlowNext;
  intervention_id: string;
}

/**
 * Spec §07-three-server-seam-matrix §3.4 (Failure-degradation chain):
 *   Primary fail → Secondary → Validator-only (skip sub-agent)
 *     → ask_user → opc_flow_user_reply / opc_flow_correct
 *
 * Invoked by the host (or by any caller wiring) when the reflection-server
 * MCP transport is unreachable. State-server records a degradation entry
 * in reflection_log and — unless the calling step is in the documented
 * "warning-only" allow-list (P4 brief, P6 critique, P7 CoVe) — synthesizes
 * a pending_user_question (question_id prefix `uq-rs-unavailable-`) so the
 * next tool call is forced through opc_flow_user_reply. The warning-only
 * branch returns without blocking, matching the seam-matrix exceptions.
 */
export interface ReflectionUnavailableRequest {
  session_id: string;
  step_id: string;
  reason: string;
  validator_summary?: Record<string, "ok" | "fail" | "skip">;
  context_artifacts?: string[];
  pipeline_pointer_ref?: PipelinePointer | null;
  /**
   * "ask_user" (default) blocks the next write via pending_user_question.
   * "warning_only" logs the degradation but allows the caller to proceed —
   * matches the P4/P6/P7 exceptions in seam-matrix §3.4.
   */
  severity?: "ask_user" | "warning_only";
}

export interface ReflectionUnavailableResponse {
  state: FlowState;
  next: FlowNext;
  question_id: string | null;
  degraded: true;
}

export interface QuickDispatchRequest {
  session_id: string;
  intent: Intent;
  note?: string;
}

export interface QuickDispatchResponse {
  state: FlowState;
  next: FlowNext;
}

export type CorrectRequest =
  | {
      action: "revise";
      session_id: string;
      patch: Partial<Accumulated>;
      user_reply?: string;
      notes?: string | null;
    }
  | {
      action: "restart";
      session_id: string;
      reset_to_step: FlowStep;
      user_reply?: string;
      additional_input?: string;
    }
  | {
      action: "phase_reset";
      session_id: string;
      pipeline_pointer: PipelinePointer;
      user_reply?: string;
      notes?: string | null;
    };

export interface CorrectResponse {
  state: FlowState;
  next: FlowNext;
  intervention_id: string;
}

/**
 * Spec §06-host-contract §2.2 step ①: thrown by `opc_flow_lifecycle` when
 * a `recover` action targets a session whose existing owner.pid is still
 * alive on this host. Recovery is for orphan takeover only; stealing a
 * live owner would break the at-most-one-writer invariant.
 */
export class OwnerStillAliveError extends Error {
  readonly session_id: string;
  readonly owner_pid: number;
  readonly attempted_pid: number;
  constructor(session_id: string, owner_pid: number, attempted_pid: number) {
    super(
      `opc_flow_lifecycle(recover): refusing takeover of session ${session_id} — owner.pid ${owner_pid} is still alive (attempted_pid=${attempted_pid}). Recovery is only for orphan sessions whose owner is dead (spec §06-host-contract §2.2 step ①).`,
    );
    this.name = "OwnerStillAliveError";
    this.session_id = session_id;
    this.owner_pid = owner_pid;
    this.attempted_pid = attempted_pid;
  }
}

export class FlowServer {
  readonly root: string;
  private readonly now: () => Date;
  private readonly pid: () => number;
  private readonly uuid: () => string;
  private readonly transport: TransportMode;
  private readonly ppid: () => number;
  private readonly isAlive: (pid: number) => boolean;

  constructor(opts: FlowServerOptions) {
    this.root = opts.root;
    this.now = opts.now ?? ((): Date => new Date());
    this.pid = opts.pid ?? ((): number => process.pid);
    this.uuid = opts.uuid ?? ((): string => randomUUID());
    this.transport = opts.transport ?? "stdio";
    this.ppid = opts.ppid ?? ((): number => process.ppid);
    this.isAlive =
      opts.isAlive ??
      ((pid: number): boolean => {
        if (!Number.isInteger(pid) || pid <= 0) return false;
        try {
          process.kill(pid, 0);
          return true;
        } catch (err) {
          if (typeof err === "object" && err !== null && "code" in err) {
            if ((err as { code: unknown }).code === "EPERM") return true;
          }
          return false;
        }
      });
  }

  async query(req: QueryRequest): Promise<QueryResponse> {
    if (req.claude_pid !== undefined && this.transport === "stdio") {
      throw new TransportArgError(
        "opc_flow_query: claude_pid must not be passed in stdio mode (spec §06-host-contract §2.3)",
      );
    }
    const state = await loadFlowState(this.root, req.session_id);
    this.cleanupExpired(state);
    await saveFlowState(this.root, state, this.now());
    // Spec §06-host-contract §2.2 (C1 配套): in stdio mode, surface orphan
    // sessions (other in-progress sess-* directories whose owner.pid is dead)
    // so Claude can choose to opc_flow_recover them.
    const response: QueryResponse = { state, next: this.computeNext(state) };
    const aggregatedActions: Array<SuggestedAction | KitSuggestedAction> = [];
    if (this.transport === "stdio") {
      const currentPid = req.claude_pid ?? this.ppid();
      try {
        const scan = await scanForOrphans({
          root: this.root,
          currentPid,
          isAlive: this.isAlive,
        });
        if (scan.orphan_candidates.length > 0) {
          response.orphan_candidates = scan.orphan_candidates;
          for (const a of scan.suggested_actions) aggregatedActions.push(a);
        }
      } catch {
        // Orphan scan is best-effort; never let it block the query response.
      }
    }
    // Spec §06-host-contract §2.7.5 (A4): kit-health check — flag kits
    // installed AFTER session start. Runs in every transport; the heuristic
    // is `installed_at > owner.started_at`, which is transport-agnostic.
    try {
      const health = await checkKitHealth({
        root: this.root,
        sessionStartedAt: state.owner.started_at,
      });
      if (health.warnings.length > 0) {
        response._warnings = health.warnings;
        for (const a of health.suggested_actions) aggregatedActions.push(a);
      }
    } catch {
      // Kit-health is best-effort; never let it block the query response.
    }
    if (aggregatedActions.length > 0) response.suggested_actions = aggregatedActions;
    return response;
  }

  async lifecycle(req: LifecycleRequest): Promise<LifecycleResponse> {
    if (req.action === "start") return this.lifecycleStart(req);
    if (req.action === "abort") return this.lifecycleAbort(req);
    return this.lifecycleRecover(req);
  }

  async stepComplete(req: StepCompleteRequest): Promise<StepCompleteResponse> {
    const state = await loadFlowState(this.root, req.session_id);
    this.assertOpen(state);
    this.assertReflectionsClean(state, "opc_flow_step_complete");
    this.assertNoPendingQuestion(state, "opc_flow_step_complete");

    if (req.step === "intent_analysis") {
      this.assertCurrentStep(state, "intent_analysis");
      state.accumulated.intent = req.intent;
      state.accumulated.intent_evidence_ref = req.intent_evidence_ref ?? null;
      if (req.intent === "task") {
        state.current_step = "task_analysis";
      } else {
        state.status = "completed";
        state.current_step = "completed";
        state.completed_at = this.now().toISOString();
      }
    } else if (req.step === "task_analysis") {
      this.assertCurrentStep(state, "task_analysis");
      state.accumulated.analysis_result = req.analysis_result;
      state.accumulated.analysis_evidence_ref = req.task_analysis_evidence_ref ?? null;
      state.current_step = "task_decomposition";
    } else if (req.step === "task_decomposition") {
      this.assertCurrentStep(state, "task_decomposition");
      state.accumulated.decomposition_result = {
        sub_pipelines: req.sub_pipelines,
        ...(req.execution_order ? { execution_order: req.execution_order } : {}),
      };
      state.accumulated.decomposition_evidence_ref = req.decomposition_evidence_ref ?? null;
      state.current_step = "brief_generation";
    } else {
      this.assertCurrentStep(state, "brief_generation");
      state.accumulated.brief_content = req.brief_content;
      state.accumulated.brief_evidence_ref = req.brief_evidence_ref ?? null;
      state.current_step = "pipeline_execution";
    }

    state.history.push(this.entry(req.step, "opc_flow_step_complete", req, null));
    if (state.skip_reflection_once_for_step === req.step) {
      state.skip_reflection_once_for_step = null;
    }
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state) };
  }

  async reflect(req: ReflectRequest): Promise<ReflectResponse> {
    const state = await loadFlowState(this.root, req.session_id);
    this.assertOpen(state);

    let registered = false;
    const idx = state.pending_reflections.findIndex((p) => p.reflection_id === req.reflection_id);
    if (idx >= 0) {
      state.pending_reflections.splice(idx, 1);
      registered = true;
    }

    const entry: ReflectionLogEntry = {
      step_id: req.step_id ?? state.current_step,
      at: this.now().toISOString(),
      ...(req.round !== undefined ? { round: req.round } : {}),
      ...(req.method ? { method: req.method } : {}),
      ...(req.evidence_diff ? { evidence_diff: req.evidence_diff } : {}),
      ...(req.validator_result ? { validator_result: req.validator_result } : {}),
      ...(req.objections_kept_by_meta !== undefined
        ? { objections_kept_by_meta: req.objections_kept_by_meta }
        : {}),
      ...(req.notes ? { notes: req.notes } : {}),
      ...(req.pipeline_pointer_ref ? { pipeline_pointer_ref: req.pipeline_pointer_ref } : {}),
    };
    state.reflection_log.push(entry);

    if (req.verdict === "rounds_exceeded" && req.rounds_exceeded_payload) {
      const askedAt = this.now();
      const expires = new Date(askedAt.getTime() + 30 * 60_000);
      state.pending_user_question = {
        question_id: `uq-${this.uuid()}`,
        step_id: entry.step_id,
        round: req.round ?? 0,
        asked_at: askedAt.toISOString(),
        expires_at: expires.toISOString(),
        must_be_resolved_by: "opc_flow_user_reply",
        reasoning_trace: req.rounds_exceeded_payload.reasoning_trace,
        kept_objections: req.rounds_exceeded_payload.kept_objections,
        context_artifacts: req.rounds_exceeded_payload.context_artifacts,
        ...(req.pipeline_pointer_ref ? { pipeline_pointer_ref: req.pipeline_pointer_ref } : {}),
      };
    }

    state.history.push(this.entry("reflect", "opc_flow_reflect", req, { registered }));
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state), registered };
  }

  async userReply(req: UserReplyRequest): Promise<UserReplyResponse> {
    const state = await loadFlowState(this.root, req.session_id);
    this.assertOpen(state);
    const q = state.pending_user_question;
    if (!q || q.question_id !== req.question_id) {
      throw new Error(`no pending user question with id ${req.question_id}`);
    }
    const isExpiredFlow = q.question_id.startsWith("uq-expired-");
    const isUnavailableFlow = q.question_id.startsWith("uq-rs-unavailable-");
    const disposition = req.resolution?.disposition;
    if (isExpiredFlow) {
      return this.handleExpiredReflectionReply(state, q, req, disposition);
    }
    const intervention_id = `intv-${this.uuid()}`;
    const intervention: UserIntervention = {
      intervention_id,
      trigger: isUnavailableFlow
        ? "reflection_server_unavailable_acknowledged"
        : "ask_user_rounds_exceeded",
      step_id: q.step_id,
      question_id: q.question_id,
      user_reply: req.user_reply,
      ...(req.resolution ? { resolution: req.resolution } : {}),
      linked_reflection_artifacts: q.context_artifacts,
      at: this.now().toISOString(),
    };
    state.user_interventions.push(intervention);
    state.pending_user_question = null;
    if (req.resolution?.accumulated_patch) {
      Object.assign(state.accumulated, req.resolution.accumulated_patch);
    }
    state.skip_reflection_once_for_step = q.step_id;
    state.history.push(this.entry("user_reply", "opc_flow_user_reply", req, { intervention_id }));
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state), intervention_id };
  }

  /**
   * Spec §07-three-server-seam-matrix §3.4: degrade the reflection cycle
   * when the reflection-server MCP transport is unreachable. Writes a
   * reflection_log entry tagged `verdict: "validator_only_fallback"`. For
   * the default `severity: "ask_user"` path, synthesizes a pending
   * user-question (question_id prefix `uq-rs-unavailable-`) so the next
   * write tool is forced through `opc_flow_user_reply`. For the
   * `severity: "warning_only"` path (P4 brief / P6 critique / P7 CoVe per
   * seam-matrix exceptions), records the degradation but does NOT block
   * subsequent unblocked_nodes advancement or opc_phase_complete.
   */
  async reflectionUnavailable(
    req: ReflectionUnavailableRequest,
  ): Promise<ReflectionUnavailableResponse> {
    const state = await loadFlowState(this.root, req.session_id);
    this.assertOpen(state);

    const severity = req.severity ?? "ask_user";
    const now = this.now();
    const logEntry: ReflectionLogEntry = {
      step_id: req.step_id,
      method: "validator_only_fallback",
      verdict: "validator_only_fallback",
      notes: `reflection-server unavailable: ${req.reason}`,
      at: now.toISOString(),
      ...(req.validator_summary ? { validator_result: req.validator_summary } : {}),
      ...(req.pipeline_pointer_ref ? { pipeline_pointer_ref: req.pipeline_pointer_ref } : {}),
    };
    state.reflection_log.push(logEntry);

    let question_id: string | null = null;
    if (severity === "ask_user") {
      if (state.pending_user_question) {
        // Already paused on another question — preserve it; the degradation
        // log entry is enough to surface this event to the distiller.
        question_id = state.pending_user_question.question_id;
      } else {
        const askedAt = now;
        const expires = new Date(askedAt.getTime() + 30 * 60_000);
        const newQid = `uq-rs-unavailable-${this.uuid()}`;
        const validatorLine = req.validator_summary
          ? `validator summary: ${Object.entries(req.validator_summary)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}`
          : "validator summary not provided";
        state.pending_user_question = {
          question_id: newQid,
          step_id: req.step_id,
          round: 0,
          asked_at: askedAt.toISOString(),
          expires_at: expires.toISOString(),
          must_be_resolved_by: "opc_flow_user_reply",
          reasoning_trace: [
            `reflection-server unavailable for step ${req.step_id}: ${req.reason}`,
            validatorLine,
            "fell back to validator-only path (V1-V5 + L1/L2 ran in state-server); please acknowledge or correct via opc_flow_user_reply / opc_flow_correct",
          ],
          kept_objections: [],
          context_artifacts: req.context_artifacts ?? [],
          ...(req.pipeline_pointer_ref ? { pipeline_pointer_ref: req.pipeline_pointer_ref } : {}),
        };
        question_id = newQid;
      }
    }

    state.history.push(
      this.entry(
        "reflection_unavailable",
        "opc_flow_reflection_unavailable",
        req,
        { severity, question_id },
      ),
    );
    await saveFlowState(this.root, state, now);
    return { state, next: this.computeNext(state), question_id, degraded: true };
  }

  private async handleExpiredReflectionReply(
    state: FlowState,
    q: PendingUserQuestion,
    req: UserReplyRequest,
    disposition: "resume" | "discard" | "skip" | undefined,
  ): Promise<UserReplyResponse> {
    const reflection_id = q.question_id.replace(/^uq-expired-/, "");
    const target = state.pending_reflections.find((p) => p.reflection_id === reflection_id);
    if (!target) {
      throw new Error(
        `expired reflection ${reflection_id} not found in pending_reflections; question_id=${q.question_id} is stale`,
      );
    }
    if (!disposition) {
      throw new Error(
        `resolution.disposition is required for expired-reflection user_reply (one of: resume | discard | skip)`,
      );
    }
    const intervention_id = `intv-${this.uuid()}`;
    let trigger: UserIntervention["trigger"];
    const now = this.now();

    if (disposition === "resume") {
      target.status = "pending";
      target.expires_at = new Date(now.getTime() + 30 * 60_000).toISOString();
      trigger = "expired_reflection_resumed";
    } else if (disposition === "discard") {
      state.pending_reflections = state.pending_reflections.filter(
        (p) => p.reflection_id !== reflection_id,
      );
      trigger = "expired_reflection_discarded";
      state.reflection_log.push({
        step_id: target.step_id,
        reflection_id,
        artifact_path: target.artifact_path,
        verdict: "discarded_by_user_after_expiry",
        at: now.toISOString(),
      });
    } else {
      state.pending_reflections = state.pending_reflections.filter(
        (p) => p.reflection_id !== reflection_id,
      );
      trigger = "expired_reflection_skipped";
      state.reflection_log.push({
        step_id: target.step_id,
        reflection_id,
        artifact_path: target.artifact_path,
        verdict: "skipped_by_user_after_expiry",
        at: now.toISOString(),
      });
    }

    const intervention: UserIntervention = {
      intervention_id,
      trigger,
      step_id: q.step_id,
      question_id: q.question_id,
      user_reply: req.user_reply,
      ...(req.resolution ? { resolution: req.resolution } : {}),
      linked_reflection_artifacts: q.context_artifacts,
      at: now.toISOString(),
    };
    state.user_interventions.push(intervention);
    state.pending_user_question = null;
    if (disposition === "skip") {
      state.skip_reflection_once_for_step = q.step_id;
    }
    state.history.push(
      this.entry("user_reply", "opc_flow_user_reply", req, {
        intervention_id,
        disposition,
        reflection_id,
      }),
    );
    await saveFlowState(this.root, state, now);
    return { state, next: this.computeNext(state), intervention_id };
  }

  async quickDispatch(req: QuickDispatchRequest): Promise<QuickDispatchResponse> {
    const state = await loadFlowState(this.root, req.session_id);
    this.assertOpen(state);
    state.accumulated.intent = req.intent;
    state.status = "completed";
    state.current_step = "completed";
    state.completed_at = this.now().toISOString();
    state.history.push(this.entry("quick_dispatch", "opc_flow_quick_dispatch", req, null));
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state) };
  }

  async correct(req: CorrectRequest): Promise<CorrectResponse> {
    const state = await loadFlowState(this.root, req.session_id);
    this.assertOpen(state);
    const intervention_id = `intv-${this.uuid()}`;
    let trigger: UserIntervention["trigger"] = "user_initiated_revise";
    let step_id = state.current_step as string;

    if (req.action === "revise") {
      Object.assign(state.accumulated, req.patch);
      trigger = "user_initiated_revise";
    } else if (req.action === "restart") {
      this.clearDownstream(state.accumulated, req.reset_to_step);
      state.current_step = req.reset_to_step;
      step_id = req.reset_to_step;
      if (req.additional_input) state.user_message_history.push(req.additional_input);
      trigger = "user_initiated_restart";
    } else {
      state.current_pipeline_pointer = req.pipeline_pointer;
      trigger = "user_initiated_phase_reset";
      step_id = `phase_reset:${req.pipeline_pointer.phase ?? ""}`;
    }

    const intervention: UserIntervention = {
      intervention_id,
      trigger,
      step_id,
      ...(req.user_reply ? { user_reply: req.user_reply } : {}),
      ...(req.action !== "restart" && "notes" in req && req.notes != null
        ? { resolution: { notes: req.notes } }
        : {}),
      at: this.now().toISOString(),
    };
    state.user_interventions.push(intervention);
    state.history.push(this.entry(req.action, "opc_flow_correct", req, { intervention_id }));
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state), intervention_id };
  }

  // --- guards exposed for other servers ---

  /** Throws if pending_reflections has any entries. Used by other servers' write tools. */
  assertReflectionsClean(state: FlowState, callerTool: string): void {
    if (state.pending_reflections.length > 0) {
      const ids = state.pending_reflections.map((p) => p.reflection_id).join(",");
      throw new Error(
        `reflection-registry-guard: ${callerTool} blocked; pending_reflections=[${ids}]; register via opc_flow_reflect first`,
      );
    }
  }

  /** Throws if there is a pending user question. */
  assertNoPendingQuestion(state: FlowState, callerTool: string): void {
    if (state.pending_user_question) {
      throw new Error(
        `pending-question-guard: ${callerTool} blocked; resolve question_id=${state.pending_user_question.question_id} via opc_flow_user_reply`,
      );
    }
  }

  registerPendingReflection(state: FlowState, p: PendingReflection): void {
    if (state.pending_reflections.length > 0) {
      const existing = state.pending_reflections.map((x) => x.reflection_id).join(",");
      throw new Error(
        `pending_reflections_max_1_violated: cannot register ${p.reflection_id}; existing=[${existing}]; this indicates a reflection-server bug or missing opc_flow_reflect call`,
      );
    }
    state.pending_reflections.push(p);
  }

  // --- helpers ---

  private async lifecycleStart(
    req: Extract<LifecycleRequest, { action: "start" }>,
  ): Promise<LifecycleResponse> {
    // Spec §06-host-contract §2.3 (C2): resolve pid through the transport-aware
    // helper. `req.pid` remains an internal/test override that bypasses the
    // transport guard; external callers use `claude_pid`.
    let pid: number;
    if (req.pid !== undefined) {
      pid = req.pid;
    } else {
      const resolved = resolveClaudePid({
        transport: this.transport,
        ...(req.claude_pid !== undefined ? { claude_pid: req.claude_pid } : {}),
        ppid: this.ppid,
        serverPid: this.pid,
      });
      pid = resolved.pid;
    }
    const startedAt = this.now();
    const startedAtUnixTs = Math.floor(startedAt.getTime() / 1000);
    // Spec §06-host-contract §2.1 (C1): derive session_id from (pid, ts) so the
    // same Claude Code process resuming on the same second is idempotent, while
    // pid recycling after restart yields a fresh id. Honour caller-provided
    // session_id only when it parses as the same shape; otherwise auto-derive.
    let session_id: string;
    if (req.session_id) {
      session_id = req.session_id;
    } else {
      session_id = deriveSessionId({ pid, started_at_unix_ts: startedAtUnixTs });
    }
    const parsed = parseSessionId(session_id);
    const state = newFlowState({
      session_id,
      pid,
      now: startedAt,
      ...(req.initial_message ? { initialMessage: req.initial_message } : {}),
      started_at_unix_ts: parsed?.started_at_unix_ts ?? startedAtUnixTs,
      transport: this.transport,
    });
    state.history.push(this.entry("start", "opc_flow_lifecycle", req, { session_id }));
    await saveFlowState(this.root, state, startedAt);
    return { state, next: this.computeNext(state) };
  }

  private async lifecycleAbort(
    req: Extract<LifecycleRequest, { action: "abort" }>,
  ): Promise<LifecycleResponse> {
    const state = await loadFlowState(this.root, req.session_id);
    state.status = "aborted";
    state.current_step = "aborted";
    state.aborted_at = this.now().toISOString();
    state.abort_reason = req.reason ?? null;
    state.history.push(this.entry("abort", "opc_flow_lifecycle", req, null));
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state) };
  }

  private async lifecycleRecover(
    req: Extract<LifecycleRequest, { action: "recover" }>,
  ): Promise<LifecycleResponse> {
    // Spec §06-host-contract §2.3 (C2): same guard as lifecycleStart — in
    // stdio mode an explicit claude_pid is a hard error; recovery uses ppid.
    let newPid: number | undefined;
    if (req.pid !== undefined) {
      newPid = req.pid;
    } else {
      const resolved = resolveClaudePid({
        transport: this.transport,
        ...(req.claude_pid !== undefined ? { claude_pid: req.claude_pid } : {}),
        ppid: this.ppid,
        serverPid: this.pid,
      });
      newPid = resolved.pid;
    }
    const state = await loadFlowState(this.root, req.session_id);
    // Spec §06-host-contract §2.2 step ①: refuse takeover when the existing
    // owner.pid is still alive on this host AND distinct from the recovering
    // caller — that's not orphan recovery, that's a steal. Skip the check
    // when the prior owner is the same pid (idempotent re-recover after a
    // transient blip) or when running outside stdio (kill(pid,0) has no
    // meaning).
    if (
      newPid !== undefined &&
      state.owner.pid !== newPid &&
      this.transport === "stdio" &&
      this.isAlive(state.owner.pid)
    ) {
      throw new OwnerStillAliveError(req.session_id, state.owner.pid, newPid);
    }
    if (newPid !== undefined) state.owner.pid = newPid;
    state.owner.last_heartbeat_at = this.now().toISOString();
    state.history.push(this.entry("recover", "opc_flow_lifecycle", req, null));
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state) };
  }

  private cleanupExpired(state: FlowState): void {
    const nowMs = this.now().getTime();
    // Spec §六·补: pending_reflections MUST NOT be silently dropped on expiry.
    // Promote expired entries to `expired_pending_decision` and synthesize a
    // pending_user_question so opc_flow_user_reply can dispose of them.
    for (const p of state.pending_reflections) {
      const expiredMs = new Date(p.expires_at).getTime();
      if (expiredMs > nowMs) continue;
      if (p.status === "expired_pending_decision") continue;
      p.status = "expired_pending_decision";
      if (!state.pending_user_question) {
        const askedAt = this.now();
        const replyExpires = new Date(askedAt.getTime() + 24 * 60 * 60_000);
        state.pending_user_question = {
          question_id: `uq-expired-${p.reflection_id}`,
          step_id: p.step_id,
          round: 0,
          asked_at: askedAt.toISOString(),
          expires_at: replyExpires.toISOString(),
          must_be_resolved_by: "opc_flow_user_reply",
          reasoning_trace: [
            `pending reflection ${p.reflection_id} for step ${p.step_id} expired at ${p.expires_at}; choose disposition: resume | discard | skip`,
          ],
          kept_objections: [],
          context_artifacts: [p.artifact_path],
          ...(p.pipeline_pointer_ref ? { pipeline_pointer_ref: p.pipeline_pointer_ref } : {}),
        };
      }
    }
    // pending_user_question expiry continues to clear (it has its own 24h budget);
    // expired-reflection prompts get reissued on next query if user still hasn't replied.
    if (
      state.pending_user_question &&
      new Date(state.pending_user_question.expires_at).getTime() <= nowMs &&
      !state.pending_user_question.question_id.startsWith("uq-expired-")
    ) {
      state.pending_user_question = null;
    }
  }

  private assertOpen(state: FlowState): void {
    if (state.status !== "in_progress") {
      throw new Error(`session ${state.session_id} is ${state.status}`);
    }
  }

  private assertCurrentStep(state: FlowState, expected: FlowStep): void {
    if (state.current_step !== expected) {
      throw new Error(
        `expected current_step=${expected} but was ${state.current_step} (session ${state.session_id})`,
      );
    }
  }

  private clearDownstream(acc: Accumulated, resetTo: FlowStep): void {
    const order: FlowStep[] = [
      "intent_analysis",
      "task_analysis",
      "task_decomposition",
      "brief_generation",
    ];
    const idx = order.indexOf(resetTo);
    if (idx < 0) return;
    if (idx <= 0) {
      acc.intent = null;
      acc.intent_evidence_ref = null;
    }
    if (idx <= 1) {
      acc.analysis_result = null;
      acc.analysis_evidence_ref = null;
    }
    if (idx <= 2) {
      acc.decomposition_result = null;
      acc.decomposition_evidence_ref = null;
    }
    if (idx <= 3) {
      acc.brief_content = null;
      acc.brief_evidence_ref = null;
    }
  }

  private entry(step: string, tool: string, input: unknown, output: unknown): HistoryEntry {
    return {
      step,
      tool,
      input,
      output,
      at: this.now().toISOString(),
    };
  }

  private computeNext(state: FlowState): FlowNext {
    if (state.status === "aborted") return { tool: "aborted" };
    if (state.status === "completed") return { tool: "completed" };
    if (state.pending_user_question) return { tool: "opc_flow_user_reply" };
    if (state.pending_reflections.length > 0) return { tool: "opc_flow_reflect" };
    if (state.current_step === "pipeline_execution") return { tool: "opc_pipeline_create" };
    if (state.current_step === "phase_execution") return { tool: "opc_phase_start" };
    return { tool: "opc_flow_step_complete", step: state.current_step };
  }
}
