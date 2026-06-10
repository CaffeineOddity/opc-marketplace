import { readdirSync, existsSync } from "node:fs";
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
  type NodeState,
  type PhaseState,
  type StateJson,
} from "./state-json.js";
import { aggregatePipelineStatus } from "./pipeline-server.js";
import { computeNextSubPipeline } from "./topology.js";
import {
  resolve as resolveNodes,
  type ResolvedGroup,
  type ResolvedPlan,
} from "./node-resolver.js";
import { writeValidatorArtifact, type ValidatorResults } from "./validator-log.js";

export interface PhaseServerOptions {
  root: string;
  now?: () => Date;
  uuid?: () => string;
  pid?: () => number;
}

export class PhaseValidationError extends Error {
  public readonly required_action?: string;
  constructor(message: string, opts: { required_action?: string } = {}) {
    super(message);
    this.name = "PhaseValidationError";
    if (opts.required_action) this.required_action = opts.required_action;
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

export interface PhaseConfirmNodeOverride {
  name: string;
  blocked_by?: string[];
}

export interface PhaseConfirmRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
  nodes?: PhaseConfirmNodeOverride[];
  confirm_commit_ref?: string;
}

export interface PhaseConfirmResponse {
  phase: string;
  status: "confirmed";
  sub_pipeline_id: string;
  groups: ResolvedGroup[];
  confirm_commit_ref: string | null;
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
    if (!phase) throw new PhaseValidationError(`phase ${req.phase} not found in state.json`, { required_action: "verify the phase name against state.json phases array and phase_plan.selected" });
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

  async confirm(req: PhaseConfirmRequest): Promise<PhaseConfirmResponse> {
    const { plan } = await this.loadAndValidatePipeline(
      req.session_id,
      req.pipeline_id,
      req.sub_pipeline_id,
    );
    const state = await loadStateJson(
      this.root,
      req.session_id,
      req.pipeline_id,
      req.sub_pipeline_id,
    );

    const phase = state.phases.find((p) => p.phase === req.phase);
    if (!phase) {
      throw new PhaseValidationError(`phase ${req.phase} not found in state.json`, { required_action: "verify the phase name against state.json phases array and phase_plan.selected" });
    }
    if (phase.status !== "in_progress") {
      throw new PhaseValidationError(
        `phase ${req.phase} cannot confirm from status=${phase.status}`,
        { required_action: "ensure the phase is in_progress before confirming; if stuck, use opc_phase_reset to reset it" },
      );
    }

    const flow = await loadFlowState(this.root, req.session_id);
    if (flow.pending_reflections.length > 0) {
      const ids = flow.pending_reflections.map((p) => p.reflection_id).join(",");
      throw new PhaseValidationError(
        `reflection-registry-guard: opc_phase_confirm blocked; pending_reflections=[${ids}]`,
        { required_action: "call opc_flow_reflect to register pending reflections before confirming the phase" },
      );
    }
    if (flow.pending_user_question) {
      throw new PhaseValidationError(
        `pending-question-guard: opc_phase_confirm blocked; resolve question_id=${flow.pending_user_question.question_id} via opc_flow_user_reply`,
        { required_action: `resolve the pending user question via opc_flow_user_reply with question_id=${flow.pending_user_question.question_id}, then retry opc_phase_confirm` },
      );
    }

    if (req.nodes && req.nodes.length > 0) {
      this.applyNodeOverrides(phase, req.nodes);
    }

    const resolved = this.resolvePhase(phase);
    const overrideMap = new Map<string, string[]>();
    for (const ov of req.nodes ?? []) {
      if (ov.blocked_by) overrideMap.set(ov.name, ov.blocked_by);
    }
    for (const rn of resolved.nodes) {
      const ns = phase.nodes.find((n) => n.name === rn.name);
      if (ns) {
        const extra = overrideMap.get(rn.name) ?? [];
        const merged = new Set<string>([...rn.blocked_by, ...extra]);
        rn.blocked_by = [...merged];
        ns.blocked_by = [...merged];
        if (rn.mode) ns.mode = rn.mode;
      }
    }
    if (req.confirm_commit_ref) phase.confirm_commit_ref = req.confirm_commit_ref;

    const now = this.now();
    await saveStateJson(this.root, req.session_id, req.pipeline_id, state, now);
    plan.status = aggregatePipelineStatus(plan.sub_pipelines);
    await savePipelinePlan(this.root, req.session_id, plan, now);

    flow.current_step = "phase_confirmed";
    flow.current_pipeline_pointer = {
      pipeline_id: req.pipeline_id,
      sub_pipeline_id: req.sub_pipeline_id,
      phase: req.phase,
    };
    const firstReadyNode = resolved.groups[0]?.nodes[0] ?? null;
    flow.history.push({
      step: "phase_confirm",
      tool: "opc_phase_confirm",
      input: req,
      output: {
        phase: req.phase,
        groups_count: resolved.groups.length,
        first_node: firstReadyNode,
      },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);

    const flow_next: PhaseConfirmResponse["flow_next"] = firstReadyNode
      ? {
          tool: "opc_node_start",
          args: {
            pipeline_id: req.pipeline_id,
            sub_pipeline_id: req.sub_pipeline_id,
            phase: req.phase,
            node_name: firstReadyNode,
          },
          why: "first node of group 0",
        }
      : {
          tool: "opc_phase_complete",
          args: {
            pipeline_id: req.pipeline_id,
            sub_pipeline_id: req.sub_pipeline_id,
            phase: req.phase,
          },
          why: "phase has no nodes to execute",
        };

    return {
      phase: req.phase,
      status: "confirmed",
      sub_pipeline_id: req.sub_pipeline_id,
      groups: resolved.groups,
      confirm_commit_ref: phase.confirm_commit_ref ?? null,
      flow_next,
    };
  }

  async complete(req: PhaseCompleteRequest): Promise<PhaseCompleteResponse> {
    const { plan, sub } = await this.loadAndValidatePipeline(req.session_id, req.pipeline_id, req.sub_pipeline_id);
    const state = await loadStateJson(this.root, req.session_id, req.pipeline_id, req.sub_pipeline_id);

    const phase = state.phases.find((p) => p.phase === req.phase);
    if (!phase) throw new PhaseValidationError(`phase ${req.phase} not found`, { required_action: "verify the phase name against state.json phases array and phase_plan.selected" });
    if (phase.status !== "in_progress") {
      throw new PhaseValidationError(
        `phase ${req.phase} cannot complete from status=${phase.status}`,
        { required_action: "ensure the phase is in_progress before completing; if stuck, use opc_phase_reset to reset it" },
      );
    }

    const flow = await loadFlowState(this.root, req.session_id);
    if (flow.pending_reflections.length > 0) {
      const ids = flow.pending_reflections.map((p) => p.reflection_id).join(",");
      throw new PhaseValidationError(
        `reflection-registry-guard: opc_phase_complete blocked; pending_reflections=[${ids}]`,
        { required_action: "call opc_flow_reflect to register pending reflections before completing the phase" },
      );
    }
    if (flow.pending_user_question) {
      throw new PhaseValidationError(
        `pending-question-guard: opc_phase_complete blocked; resolve question_id=${flow.pending_user_question.question_id} via opc_flow_user_reply`,
        { required_action: `resolve the pending user question via opc_flow_user_reply with question_id=${flow.pending_user_question.question_id}, then retry opc_phase_complete` },
      );
    }
    const incompleteNodes = phase.nodes.filter((n) => n.status !== "completed");
    const allNodesDone = incompleteNodes.length === 0;

    const phaseValidatorResults: ValidatorResults = {
      l1: allNodesDone ? "pass" : "fail",
    };
    const phaseFailureReasons = allNodesDone
      ? []
      : [
          `L1: phase ${req.phase} has ${incompleteNodes.length} incomplete node(s): ${incompleteNodes
            .map((n) => `${n.name}(${n.status})`)
            .join(",")}`,
        ];
    await writeValidatorArtifact({
      root: this.root,
      session_id: req.session_id,
      step: "phase_completion",
      pipeline_id: req.pipeline_id,
      sub_pipeline_id: req.sub_pipeline_id,
      phase: req.phase,
      validator_results: phaseValidatorResults,
      failure_reasons: phaseFailureReasons,
      now: this.now,
    });

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
      flow_next = { tool: "opc_pipeline_lifecycle", args: { action: "complete", pipeline_id: req.pipeline_id } };
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
      throw new PhaseValidationError(`phase ${req.phase} is not in phase_plan.selected`, { required_action: "verify the phase name against phase_plan.selected array in state.json; only phases in the selected list can be reset" });
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
      throw new PhaseValidationError(`sub_pipeline ${sub_pipeline_id} not found in pipeline ${pipeline_id}`, { required_action: "verify the sub_pipeline_id against the pipeline plan's sub_pipelines array" });
    }
    return { plan, sub };
  }

  private applyNodeOverrides(
    phase: PhaseState,
    overrides: PhaseConfirmNodeOverride[],
  ): void {
    for (const ov of overrides) {
      const ns = phase.nodes.find((n) => n.name === ov.name);
      if (!ns) {
        throw new PhaseValidationError(
          `opc_phase_confirm: node ${ov.name} not found in phase ${phase.phase}`,
          { required_action: `verify the node name against phase.nodes in state.json for phase ${phase.phase}` },
        );
      }
      if (ov.blocked_by) ns.blocked_by = [...ov.blocked_by];
    }
  }

  private resolvePhase(phase: PhaseState): ResolvedPlan {
    const defs = phase.nodes.map((n) => toNodeDefinition(phase.phase, n));
    return resolveNodes(defs);
  }

  private validatePhaseStart(state: StateJson, phase: string): void {
    const { phase_plan } = state;
    if (!phase_plan.selected.includes(phase)) {
      throw new PhaseValidationError(`V0.4: phase ${phase} not in phase_plan.selected`, { required_action: "run opc_phase_confirm with a corrected phase plan that includes this phase in phase_plan.selected" });
    }
    if (!phase_plan.selected_by) {
      throw new PhaseValidationError("V0.5: phase_plan.selected_by must be set", { required_action: "set phase_plan.selected_by to a non-empty string identifying the selector (agent name or pipeline_id)" });
    }
    if (!phase_plan.selection_rationale || phase_plan.selection_rationale.length === 0) {
      throw new PhaseValidationError("V0.6: phase_plan.selection_rationale must be non-empty", { required_action: "set phase_plan.selection_rationale with a human-readable explanation of why these phases were selected" });
    }
    const supersetOk = phase_plan.selected.every((s) => phase_plan.available.includes(s));
    if (!supersetOk) {
      throw new PhaseValidationError("V0.7: phase_plan.selected must be subset of available", { required_action: "ensure all phases in phase_plan.selected also appear in phase_plan.available; remove any phases that are not available" });
    }
    if (phase_plan.order_validated !== true) {
      throw new PhaseValidationError("V0.8: phase_plan.order_validated must be true", { required_action: "set phase_plan.order_validated to true after verifying phase ordering satisfies all dependencies" });
    }
    // V0.9: validate available phases exist as directories on disk.
    // Only runs when phases/ or opc-nodes/ directories exist (skipped in
    // ephemeral test environments where these dirs are absent).
    if (existsSync(`${this.root}/phases`) || existsSync(`${this.root}/opc-nodes`)) {
      const onDisk = scanPhaseDirectories(this.root);
      const missing = phase_plan.available.filter((p) => !onDisk.includes(p));
      if (missing.length > 0) {
        throw new PhaseValidationError(
          `V0.9: phase(s) [${missing.join(",")}] not found in phases/ or opc-nodes/ directories`,
          { required_action: `remove unavailable phases [${missing.join(",")}] from phase_plan.available and phase_plan.selected. Available on disk: [${onDisk.join(", ") || "(none)"}]` },
        );
      }
    }
    const idx = phase_plan.selected.indexOf(phase);
    if (idx > 0) {
      const prev = phase_plan.selected[idx - 1];
      const prevState = state.phases.find((p) => p.phase === prev);
      if (!prevState || prevState.status !== "completed") {
        throw new PhaseValidationError(
          `V0.3: previous phase ${prev} must be completed before starting ${phase}`,
          { required_action: `complete phase ${prev} before starting ${phase}, or adjust phase ordering via opc_phase_confirm` },
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

function toNodeDefinition(
  phase: string,
  n: NodeState,
): import("./state-json.js").NodeDefinition {
  const def: import("./state-json.js").NodeDefinition = {
    name: n.name,
    phase,
    description: "",
    tags: [],
    mode: n.mode ?? "sequential",
    agents: { primary: n.agent ? [n.agent] : [] },
    input: n.node_input ?? [],
    output: n.node_output ?? [],
  };
  if (n.quality_gates) def.quality_gates = n.quality_gates;
  if (typeof n.timeout_minutes === "number") def.timeout_minutes = n.timeout_minutes;
  if (typeof n.max_retries === "number") def.max_retries = n.max_retries;
  return def;
}

/**
 * Scan `phases/` and `opc-nodes/` directories under root for available
 * phase ids. Returns the union of subdirectory names found in either
 * location (project-level `opc-nodes/` can supplement built-in `phases/`).
 */
export function scanPhaseDirectories(root: string): string[] {
  const ids = new Set<string>();
  for (const dir of ["phases", "opc-nodes"]) {
    const base = `${root}/${dir}`;
    if (!existsSync(base)) continue;
    try {
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          ids.add(entry.name);
        }
      }
    } catch {
      // Permission errors etc. — skip this directory.
    }
  }
  return [...ids].sort();
}
