import { randomUUID } from "node:crypto";

import { loadFlowState, saveFlowState } from "./flow-state.js";
import {
  loadPipelinePlan,
  savePipelinePlan,
  type PipelinePlan,
  type SubPipeline,
} from "./pipeline-plan.js";
import {
  loadStateJson,
  saveStateJson,
  type IoArtifact,
  type PhaseState,
  type StateJson,
} from "./state-json.js";
import { aggregatePipelineStatus } from "./pipeline-server.js";
import { computeNextSubPipeline } from "./topology.js";

export interface PhaseServerOptions {
  root: string;
  now?: () => Date;
  uuid?: () => string;
  pid?: () => number;
}

export class PhaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseValidationError";
  }
}

export interface PhaseStartRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
}

export interface PhaseStartResponse {
  phase: string;
  status: "in_progress";
  sub_pipeline_id: string;
  state: StateJson;
  flow_next: { tool: string; args?: Record<string, unknown> };
}

export interface PhaseCompleteRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
  confirm_commit_ref?: string;
}

export interface PhaseCompleteResponse {
  phase: string;
  status: "completed";
  next_phase: string | null;
  auto_advance: boolean;
  pipeline_progress: {
    current_sub: string;
    current_sub_status: SubPipeline["status"];
    next_sub_pipeline:
      | { id: string; reason: string; resumed_from_paused: boolean }
      | null;
    pending_sub_pipelines: Array<{ id: string; status: SubPipeline["status"] }>;
  };
  flow_next: { tool: string; args?: Record<string, unknown>; why?: string };
}

export interface PhaseResetRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
}

export interface PhaseResetResponse {
  reset_phase: string;
  reset_downstream: string[];
  knowledge_revert_plan: Array<{ path: string; confirm_commit_ref?: string }>;
  next_phase_status: "pending";
  state: StateJson;
}

export class PhaseServer {
  readonly root: string;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly pid: () => number;

  constructor(opts: PhaseServerOptions) {
    this.root = opts.root;
    this.now = opts.now ?? ((): Date => new Date());
    this.uuid = opts.uuid ?? ((): string => randomUUID());
    this.pid = opts.pid ?? ((): number => process.pid);
  }

  async start(req: PhaseStartRequest): Promise<PhaseStartResponse> {
    const { plan, sub } = await this.loadAndValidatePipeline(req.session_id, req.pipeline_id, req.sub_pipeline_id);
    const state = await loadStateJson(this.root, req.session_id, req.pipeline_id, req.sub_pipeline_id);
    this.validatePhaseStart(state, req.phase);

    const phase = state.phases.find((p) => p.phase === req.phase);
    if (!phase) throw new PhaseValidationError(`phase ${req.phase} not found in state.json`);
    phase.status = "in_progress";
    if (sub.status === "pending") sub.status = "in_progress";
    state.status = "in_progress";

    const now = this.now();
    await saveStateJson(this.root, req.session_id, req.pipeline_id, state, now);
    await savePipelinePlan(this.root, req.session_id, plan, now);

    const flow = await loadFlowState(this.root, req.session_id);
    flow.current_step = "phase_execution";
    flow.current_pipeline_pointer = {
      pipeline_id: req.pipeline_id,
      sub_pipeline_id: req.sub_pipeline_id,
      phase: req.phase,
    };
    flow.history.push({
      step: "phase_start",
      tool: "opc_phase_start",
      input: req,
      output: { phase: req.phase },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);
    void this.pid;

    return {
      phase: req.phase,
      status: "in_progress",
      sub_pipeline_id: req.sub_pipeline_id,
      state,
      flow_next: {
        tool: "opc_phase_confirm",
        args: { pipeline_id: req.pipeline_id, sub_pipeline_id: req.sub_pipeline_id, phase: req.phase },
      },
    };
  }

  async complete(req: PhaseCompleteRequest): Promise<PhaseCompleteResponse> {
    const { plan, sub } = await this.loadAndValidatePipeline(req.session_id, req.pipeline_id, req.sub_pipeline_id);
    const state = await loadStateJson(this.root, req.session_id, req.pipeline_id, req.sub_pipeline_id);

    const phase = state.phases.find((p) => p.phase === req.phase);
    if (!phase) throw new PhaseValidationError(`phase ${req.phase} not found`);
    if (phase.status !== "in_progress") {
      throw new PhaseValidationError(
        `phase ${req.phase} cannot complete from status=${phase.status}`,
      );
    }

    const flow = await loadFlowState(this.root, req.session_id);
    if (flow.pending_reflections.length > 0) {
      const ids = flow.pending_reflections.map((p) => p.reflection_id).join(",");
      throw new PhaseValidationError(
        `reflection-registry-guard: opc_phase_complete blocked; pending_reflections=[${ids}]`,
      );
    }
    const incompleteNodes = phase.nodes.filter((n) => n.status !== "completed");
    const allNodesDone = incompleteNodes.length === 0;

    phase.status = "completed";
    if (req.confirm_commit_ref) phase.confirm_commit_ref = req.confirm_commit_ref;

    const selectedIdx = state.phase_plan.selected.indexOf(req.phase);
    const nextPhase =
      selectedIdx >= 0 && selectedIdx + 1 < state.phase_plan.selected.length
        ? state.phase_plan.selected[selectedIdx + 1] ?? null
        : null;
    const isLastPhase = nextPhase === null;

    if (isLastPhase) {
      state.status = "completed";
      sub.status = "completed";
    }

    const isHigh = state.task.complexity === "high";
    const auto_advance = !isLastPhase && allNodesDone && !isHigh && nextPhase !== null;

    const now = this.now();
    await saveStateJson(this.root, req.session_id, req.pipeline_id, state, now);
    plan.status = aggregatePipelineStatus(plan.sub_pipelines);
    await savePipelinePlan(this.root, req.session_id, plan, now);

    let next: { id: string; reason: string; resumed_from_paused: boolean } | null = null;
    if (isLastPhase) {
      const paused = plan.sub_pipelines.find((s) => s.status === "paused");
      if (paused) {
        next = {
          id: paused.id,
          reason: "auto-resume paused sub_pipeline after insertion completion",
          resumed_from_paused: true,
        };
      } else {
        const candidate = computeNextSubPipeline(plan.sub_pipelines, plan.execution_order);
        if (candidate) next = { ...candidate, resumed_from_paused: false };
      }
    }

    let flow_next: PhaseCompleteResponse["flow_next"];
    if (!isLastPhase && nextPhase && auto_advance) {
      flow_next = {
        tool: "opc_phase_start",
        args: { pipeline_id: req.pipeline_id, sub_pipeline_id: req.sub_pipeline_id, phase: nextPhase },
        why: "auto_advance",
      };
      flow.current_pipeline_pointer = {
        pipeline_id: req.pipeline_id,
        sub_pipeline_id: req.sub_pipeline_id,
        phase: nextPhase,
      };
    } else if (!isLastPhase && nextPhase && !auto_advance) {
      flow_next = {
        tool: "opc_phase_start",
        args: { pipeline_id: req.pipeline_id, sub_pipeline_id: req.sub_pipeline_id, phase: nextPhase },
        why: isHigh ? "user confirmation required (complexity=high)" : "manual advance",
      };
    } else if (isLastPhase && next) {
      flow_next = {
        tool: "opc_phase_start",
        args: { pipeline_id: req.pipeline_id, sub_pipeline_id: next.id },
        why: next.resumed_from_paused ? "auto-resume paused sub" : "next sub_pipeline in execution_order",
      };
      flow.current_pipeline_pointer = {
        pipeline_id: req.pipeline_id,
        sub_pipeline_id: next.id,
      };
    } else {
      flow_next = { tool: "opc_pipeline_complete", args: { pipeline_id: req.pipeline_id } };
    }

    flow.history.push({
      step: "phase_complete",
      tool: "opc_phase_complete",
      input: req,
      output: { phase: req.phase, auto_advance, next_phase: nextPhase, last_phase: isLastPhase },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);

    return {
      phase: req.phase,
      status: "completed",
      next_phase: nextPhase,
      auto_advance,
      pipeline_progress: {
        current_sub: sub.id,
        current_sub_status: sub.status,
        next_sub_pipeline: next,
        pending_sub_pipelines: plan.sub_pipelines
          .filter((s) => s.status === "pending" || s.status === "paused")
          .map((s) => ({ id: s.id, status: s.status })),
      },
      flow_next,
    };
  }

  async reset(req: PhaseResetRequest): Promise<PhaseResetResponse> {
    const { plan } = await this.loadAndValidatePipeline(req.session_id, req.pipeline_id, req.sub_pipeline_id);
    const state = await loadStateJson(this.root, req.session_id, req.pipeline_id, req.sub_pipeline_id);

    const selectedIdx = state.phase_plan.selected.indexOf(req.phase);
    if (selectedIdx < 0) {
      throw new PhaseValidationError(`phase ${req.phase} is not in phase_plan.selected`);
    }
    const downstreamNames = state.phase_plan.selected.slice(selectedIdx + 1);

    const knowledgeRevert: Array<{ path: string; confirm_commit_ref?: string }> = [];
    const resetOne = (phase: PhaseState): void => {
      const outputs = collectKnowledgeOutputs(phase.nodes);
      for (const path of outputs) {
        const entry: { path: string; confirm_commit_ref?: string } = { path };
        if (phase.confirm_commit_ref) entry.confirm_commit_ref = phase.confirm_commit_ref;
        knowledgeRevert.push(entry);
      }
      phase.status = "pending";
      for (const node of phase.nodes) {
        node.status = "pending";
        node.retry_count = 0;
        node.error = null;
      }
    };

    for (const ph of state.phases) {
      if (ph.phase === req.phase || downstreamNames.includes(ph.phase)) resetOne(ph);
    }
    state.status = "in_progress";

    const now = this.now();
    await saveStateJson(this.root, req.session_id, req.pipeline_id, state, now);
    plan.status = aggregatePipelineStatus(plan.sub_pipelines);
    await savePipelinePlan(this.root, req.session_id, plan, now);

    const flow = await loadFlowState(this.root, req.session_id);
    flow.current_pipeline_pointer = {
      pipeline_id: req.pipeline_id,
      sub_pipeline_id: req.sub_pipeline_id,
      phase: req.phase,
    };
    flow.history.push({
      step: "phase_reset",
      tool: "opc_phase_reset",
      input: req,
      output: { reset_phase: req.phase, reset_downstream: downstreamNames, revert_count: knowledgeRevert.length },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);

    return {
      reset_phase: req.phase,
      reset_downstream: downstreamNames,
      knowledge_revert_plan: knowledgeRevert,
      next_phase_status: "pending",
      state,
    };
  }

  private async loadAndValidatePipeline(
    session_id: string,
    pipeline_id: string,
    sub_pipeline_id: string,
  ): Promise<{ plan: PipelinePlan; sub: SubPipeline }> {
    const plan = await loadPipelinePlan(this.root, session_id, pipeline_id);
    const sub = plan.sub_pipelines.find((s) => s.id === sub_pipeline_id);
    if (!sub) {
      throw new PhaseValidationError(`sub_pipeline ${sub_pipeline_id} not found in pipeline ${pipeline_id}`);
    }
    return { plan, sub };
  }

  private validatePhaseStart(state: StateJson, phase: string): void {
    const { phase_plan } = state;
    if (!phase_plan.selected.includes(phase)) {
      throw new PhaseValidationError(`V0.4: phase ${phase} not in phase_plan.selected`);
    }
    if (!phase_plan.selected_by) {
      throw new PhaseValidationError("V0.5: phase_plan.selected_by must be set");
    }
    if (!phase_plan.selection_rationale || phase_plan.selection_rationale.length === 0) {
      throw new PhaseValidationError("V0.6: phase_plan.selection_rationale must be non-empty");
    }
    const supersetOk = phase_plan.selected.every((s) => phase_plan.available.includes(s));
    if (!supersetOk) {
      throw new PhaseValidationError("V0.7: phase_plan.selected must be subset of available");
    }
    if (phase_plan.order_validated !== true) {
      throw new PhaseValidationError("V0.8: phase_plan.order_validated must be true");
    }
    const idx = phase_plan.selected.indexOf(phase);
    if (idx > 0) {
      const prev = phase_plan.selected[idx - 1];
      const prevState = state.phases.find((p) => p.phase === prev);
      if (!prevState || prevState.status !== "completed") {
        throw new PhaseValidationError(
          `V0.3: previous phase ${prev} must be completed before starting ${phase}`,
        );
      }
    }
    void this.uuid;
  }
}

function collectKnowledgeOutputs(nodes: PhaseState["nodes"]): string[] {
  const out = new Set<string>();
  for (const n of nodes) {
    for (const a of n.output) {
      if (isKnowledgeArtifact(a)) out.add(a.path);
    }
  }
  return [...out];
}

function isKnowledgeArtifact(a: IoArtifact): boolean {
  return a.type === "knowledge" || a.path.startsWith("opc-knowledge/");
}
