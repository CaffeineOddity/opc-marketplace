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

export interface FlowServerOptions {
  root: string;
  now?: () => Date;
  pid?: () => number;
  uuid?: () => string;
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
}

export interface QueryResponse {
  state: FlowState;
  next: FlowNext;
}

export type LifecycleRequest =
  | {
      action: "start";
      session_id?: string;
      initial_message?: string;
      pid?: number;
    }
  | { action: "abort"; session_id: string; reason?: string }
  | { action: "recover"; session_id: string; pid?: number };

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

export class FlowServer {
  readonly root: string;
  private readonly now: () => Date;
  private readonly pid: () => number;
  private readonly uuid: () => string;

  constructor(opts: FlowServerOptions) {
    this.root = opts.root;
    this.now = opts.now ?? ((): Date => new Date());
    this.pid = opts.pid ?? ((): number => process.pid);
    this.uuid = opts.uuid ?? ((): string => randomUUID());
  }

  async query(req: QueryRequest): Promise<QueryResponse> {
    const state = await loadFlowState(this.root, req.session_id);
    this.cleanupExpired(state);
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state) };
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
    const intervention_id = `intv-${this.uuid()}`;
    const intervention: UserIntervention = {
      intervention_id,
      trigger: "ask_user_rounds_exceeded",
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
    state.history.push(this.entry("user_reply", "opc_flow_user_reply", req, { intervention_id }));
    await saveFlowState(this.root, state, this.now());
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
    state.pending_reflections.push(p);
  }

  // --- helpers ---

  private async lifecycleStart(
    req: Extract<LifecycleRequest, { action: "start" }>,
  ): Promise<LifecycleResponse> {
    const session_id = req.session_id ?? `sess-${this.uuid()}`;
    const pid = req.pid ?? this.pid();
    const state = newFlowState({
      session_id,
      pid,
      now: this.now(),
      ...(req.initial_message ? { initialMessage: req.initial_message } : {}),
    });
    state.history.push(this.entry("start", "opc_flow_lifecycle", req, { session_id }));
    await saveFlowState(this.root, state, this.now());
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
    const state = await loadFlowState(this.root, req.session_id);
    if (req.pid !== undefined) state.owner.pid = req.pid;
    state.owner.last_heartbeat_at = this.now().toISOString();
    state.history.push(this.entry("recover", "opc_flow_lifecycle", req, null));
    await saveFlowState(this.root, state, this.now());
    return { state, next: this.computeNext(state) };
  }

  private cleanupExpired(state: FlowState): void {
    const nowMs = this.now().getTime();
    state.pending_reflections = state.pending_reflections.filter(
      (p) => new Date(p.expires_at).getTime() > nowMs,
    );
    if (
      state.pending_user_question &&
      new Date(state.pending_user_question.expires_at).getTime() <= nowMs
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
