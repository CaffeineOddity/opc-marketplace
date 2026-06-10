import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { loadFlowState, saveFlowState } from "./flow-state.js";
import {
  type ExecutionGroup,
  type ExecutionPriority,
  type PipelineComplexity,
  type PipelinePlan,
  type PipelineStatus,
  type ReplanEntry,
  type SubPipeline,
  type SubPipelineStatus,
  loadPipelinePlan,
  manifestPath,
  savePipelinePlan,
} from "./pipeline-plan.js";
import { loadStateJson, type IoArtifact, type NodeState, type PhaseState } from "./state-json.js";
import { newStateJson, saveStateJson, writeBrief } from "./state-json.js";
import {
  TopologyError,
  computeNextSubPipeline,
  generateExecutionOrder,
  listBlockedSubs,
  validateDag,
  validateExecutionOrder,
} from "./topology.js";
import { checkKitHealth, notLoadedAgents } from "./kit-health.js";

export interface PipelineServerOptions {
  root: string;
  now?: () => Date;
  uuid?: () => string;
  pid?: () => number;
}

export interface PipelineCreateRequest {
  session_id: string;
  description: string;
  brief_content: string;
  complexity: PipelineComplexity;
  knowledge_unit: string[];
  suggested_phases: string[];
  phase_selection_rationale: string;
  sub_pipelines?: SubPipelineCreateSpec[];
  execution_order?: ExecutionGroup[];
  tags?: string[];
  scenario?: string;
  /**
   * Spec §06-host-contract §2.7.5 (A4) hard gate: agents that the pipeline
   * plan will Task-dispatch. When provided, opc_pipeline_create intersects
   * with kits that are installed-but-not-loaded; if any required agent
   * belongs to such a kit, the call is rejected with
   * KIT_NOT_LOADED_PRE_FLIGHT instead of failing later inside Task spawn.
   * Optional: callers that omit it get warning-only treatment via
   * opc_flow_query.
   */
  required_agents?: string[];
}

export interface SubPipelineCreateSpec {
  id?: string;
  title: string;
  description?: string;
  knowledge_unit: string[];
  blocked_by?: string[];
  suggested_phases?: string[];
  phase_selection_rationale?: string;
  complexity?: "low" | "medium" | "high";
  brief_content?: string;
  tags?: string[];
  scenario_hints?: string[];
}

export interface PipelineCreateResponse {
  pipeline_id: string;
  created_at: string;
  plan: PipelinePlan;
  flow_next: { tool: string; args?: Record<string, unknown> };
}

export interface PipelineStatusRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id?: string;
}

export interface PipelineStatusResponse {
  pipeline_id: string;
  status: PipelineStatus;
  sub_pipelines: Array<{ id: string; status: SubPipelineStatus }>;
  next_sub_pipeline: null | {
    id: string;
    reason: string;
    next: { tool: string; args: Record<string, unknown> };
  };
  blocked_sub_pipelines: Array<{ id: string; waiting_for: string[] }>;
  sub?: SubPipeline;
}

export type PipelineReplanRequest = {
  session_id: string;
  pipeline_id: string;
  reason?: string;
  changes: {
    add_sub_pipeline?: AddSubPipelineSpec[];
  };
};

/**
 * Spec §07 §2.1: `opc_pipeline_lifecycle` discriminator facade. Folds
 * complete/abort/replan/resume into one tool entry while preserving the
 * existing underlying methods. The wire layer (M19) will route MCP
 * tool calls based on `action`.
 */
export type PipelineLifecycleRequest =
  | { action: "complete"; session_id: string; pipeline_id: string; reason?: string }
  | { action: "abort"; session_id: string; pipeline_id: string; reason?: string }
  | ({ action: "replan" } & PipelineReplanRequest)
  | {
      action: "resume";
      session_id: string;
      pipeline_id: string;
      sub_pipeline_id?: string;
    };

export interface ProducedUnit {
  type: "code" | "knowledge";
  path: string;
  version?: number;
  source_node: string;
  source_sub_pipeline: string;
}

export interface PipelineCompleteResponse {
  pipeline_id: string;
  status: "completed";
  completed_at: string;
  manifest_path: string;
  produced_units: ProducedUnit[];
  total_nodes: number;
  total_phases: number;
  flow_next: { tool: string; args?: Record<string, unknown> };
}

export interface PipelineAbortResponse {
  pipeline_id: string;
  status: "aborted";
  aborted_at: string;
  reason: string | null;
}

export interface PipelineResumeResponse {
  pipeline_id: string;
  resumed_sub_pipeline: string | null;
  flow_next: { tool: string; args?: Record<string, unknown>; why?: string };
}

export type PipelineLifecycleResponse =
  | ({ action: "complete" } & PipelineCompleteResponse)
  | ({ action: "abort" } & PipelineAbortResponse)
  | ({ action: "replan" } & PipelineReplanResponse)
  | ({ action: "resume" } & PipelineResumeResponse);

export interface AddSubPipelineSpec {
  id?: string;
  title: string;
  description?: string;
  knowledge_unit: string[];
  blocked_by?: string[];
  suggested_phases?: string[];
  phase_selection_rationale?: string;
  complexity?: "low" | "medium" | "high";
  execution_priority?: ExecutionPriority;
  brief_content?: string;
  tags?: string[];
  scenario_hints?: string[];
}

export interface PipelineReplanResponse {
  pipeline_id: string;
  applied_changes: unknown;
  rejected_changes: unknown[];
  replan_history_id: string;
  plan: PipelinePlan;
}

export class PipelineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineConflictError";
  }
}

/**
 * Spec §06-host-contract §2.7.5 (A4) hard gate: opc_pipeline_create
 * rejects when any required_agent belongs to a kit installed after
 * session start (=> not loaded in the running Claude Code process).
 * Surfaces the failure BEFORE Claude tries to Task-spawn the agent
 * and hits the opaque "Agent type not found" error.
 */
export class KitNotLoadedPreFlightError extends Error {
  readonly code = "KIT_NOT_LOADED_PRE_FLIGHT" as const;
  readonly required_agents: string[];
  readonly affected_kits: string[];
  readonly remediation: string;
  constructor(required_agents: string[], affected_kits: string[]) {
    super(
      `KIT_NOT_LOADED_PRE_FLIGHT: required agents [${required_agents.join(", ")}] belong to kit(s) [${affected_kits.join(", ")}] installed after the current session started. Exit current \`claude\` session and re-run \`claude\` in this directory.`,
    );
    this.name = "KitNotLoadedPreFlightError";
    this.required_agents = required_agents;
    this.affected_kits = affected_kits;
    this.remediation =
      "Exit current `claude` session and re-run `claude` in this directory.";
  }
}

export class PipelineServer {
  readonly root: string;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly pid: () => number;

  constructor(opts: PipelineServerOptions) {
    this.root = opts.root;
    this.now = opts.now ?? ((): Date => new Date());
    this.uuid = opts.uuid ?? ((): string => randomUUID());
    this.pid = opts.pid ?? ((): number => process.pid);
  }

  async create(req: PipelineCreateRequest): Promise<PipelineCreateResponse> {
    const flow = await loadFlowState(this.root, req.session_id);
    if (flow.status !== "in_progress") {
      throw new Error(`session ${req.session_id} is ${flow.status}; cannot create pipeline`);
    }
    if (flow.pending_reflections.length > 0) {
      const ids = flow.pending_reflections.map((p) => p.reflection_id).join(",");
      throw new PipelineConflictError(
        `reflection-registry-guard: opc_pipeline_create blocked; pending_reflections=[${ids}]; register via opc_flow_reflect first`,
      );
    }
    if (flow.pending_user_question) {
      throw new PipelineConflictError(
        `pending-question-guard: opc_pipeline_create blocked; resolve question_id=${flow.pending_user_question.question_id} via opc_flow_user_reply`,
      );
    }
    // Spec §06-host-contract §2.7.5 (A4) hard gate: reject when required
    // agents come from kits installed after the current session started.
    // Skipped silently when the caller does not declare required_agents.
    if (req.required_agents && req.required_agents.length > 0) {
      const health = await checkKitHealth({
        root: this.root,
        sessionStartedAt: flow.owner.started_at,
      });
      const notLoaded = notLoadedAgents(health);
      if (notLoaded.size > 0) {
        const blocked = req.required_agents.filter((a) => notLoaded.has(a));
        if (blocked.length > 0) {
          const kits = health.warnings
            .filter((w) => w.affected_agents.some((a) => blocked.includes(a)))
            .map((w) => w.kit);
          throw new KitNotLoadedPreFlightError(blocked, Array.from(new Set(kits)));
        }
      }
    }
    const pipeline_id = `pl-${this.uuid()}`;
    const now = this.now();
    const subs = this.materializeSubs(req, now);
    validateDag({ sub_pipelines: subs });
    const order =
      req.execution_order && req.execution_order.length > 0
        ? req.execution_order
        : generateExecutionOrder({ sub_pipelines: subs });
    validateExecutionOrder({ sub_pipelines: subs }, order);

    const plan: PipelinePlan = {
      id: pipeline_id,
      description: req.description,
      complexity: req.complexity,
      status: "in_progress",
      knowledge_unit: req.knowledge_unit,
      owner: {
        session_id: req.session_id,
        pid: this.pid(),
        since: now.toISOString(),
      },
      sub_pipelines: subs,
      execution_order: order,
      replan_history: [],
      created_at: now.toISOString(),
      last_active_at: now.toISOString(),
      ...(req.tags ? { tags: req.tags } : {}),
      ...(req.scenario ? { scenario: req.scenario } : {}),
      ...(req.suggested_phases ? { suggested_phases: req.suggested_phases } : {}),
      ...(req.phase_selection_rationale
        ? { phase_selection_rationale: req.phase_selection_rationale }
        : {}),
    };
    await savePipelinePlan(this.root, req.session_id, plan, now);

    for (const sub of subs) {
      const subSpec = req.sub_pipelines?.find((s) => (s.id ?? "") === sub.id) ?? null;
      const subPhases = sub.phases ?? req.suggested_phases;
      const state = newStateJson({
        sub_pipeline_id: sub.id,
        title: sub.title,
        description: subSpec?.description ?? sub.description ?? req.description,
        ...(subSpec?.tags ? { tags: subSpec.tags } : {}),
        complexity: subSpec?.complexity ?? (req.complexity === "simple" ? "low" : req.complexity),
        knowledge_unit: sub.knowledge_unit,
        ...(subSpec?.scenario_hints ? { scenario_hints: subSpec.scenario_hints } : {}),
        suggested_phases: subPhases,
        phase_selection_rationale:
          subSpec?.phase_selection_rationale ?? req.phase_selection_rationale,
        now,
      });
      await saveStateJson(this.root, req.session_id, pipeline_id, state, now);
      const brief = subSpec?.brief_content ?? req.brief_content;
      await writeBrief(this.root, req.session_id, pipeline_id, sub.id, brief);
    }

    flow.pipeline_id = pipeline_id;
    flow.current_step = "pipeline_execution";
    flow.history.push({
      step: "pipeline_create",
      tool: "opc_pipeline_create",
      input: { description: req.description, sub_count: subs.length },
      output: { pipeline_id },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);

    const next = computeNextSubPipeline(subs, order);
    const flow_next = next
      ? {
          tool: "opc_phase_start",
          args: { pipeline_id, sub_pipeline_id: next.id },
        }
      : { tool: "opc_pipeline_status", args: { pipeline_id } };

    return { pipeline_id, created_at: plan.created_at, plan, flow_next };
  }

  async status(req: PipelineStatusRequest): Promise<PipelineStatusResponse> {
    const plan = await loadPipelinePlan(this.root, req.session_id, req.pipeline_id);
    const subs = plan.sub_pipelines;
    const aggregateStatus = aggregatePipelineStatus(subs);
    const next = computeNextSubPipeline(subs, plan.execution_order);
    const blocked = listBlockedSubs(subs);
    const response: PipelineStatusResponse = {
      pipeline_id: plan.id,
      status: aggregateStatus,
      sub_pipelines: subs.map((s) => ({ id: s.id, status: s.status })),
      next_sub_pipeline: next
        ? {
            id: next.id,
            reason: next.reason,
            next: {
              tool: "opc_phase_start",
              args: { pipeline_id: plan.id, sub_pipeline_id: next.id },
            },
          }
        : null,
      blocked_sub_pipelines: blocked,
    };
    if (req.sub_pipeline_id) {
      const sub = subs.find((s) => s.id === req.sub_pipeline_id);
      if (!sub) throw new Error(`sub_pipeline ${req.sub_pipeline_id} not found`);
      response.sub = sub;
    }
    return response;
  }

  async replan(req: PipelineReplanRequest): Promise<PipelineReplanResponse> {
    const flow = await loadFlowState(this.root, req.session_id);
    if (flow.pending_reflections.length > 0) {
      const ids = flow.pending_reflections.map((p) => p.reflection_id).join(",");
      throw new PipelineConflictError(
        `reflection-registry-guard: opc_pipeline_replan blocked; pending_reflections=[${ids}]; register via opc_flow_reflect first`,
      );
    }
    if (flow.pending_user_question) {
      throw new PipelineConflictError(
        `pending-question-guard: opc_pipeline_replan blocked; resolve question_id=${flow.pending_user_question.question_id} via opc_flow_user_reply`,
      );
    }
    const plan = await loadPipelinePlan(this.root, req.session_id, req.pipeline_id);
    const now = this.now();
    const applied: AddSubPipelineSpec[] = [];
    const rejected: Array<{ spec: AddSubPipelineSpec; reason: string }> = [];

    for (const spec of req.changes.add_sub_pipeline ?? []) {
      try {
        this.applyAddSubPipeline(plan, spec, now);
        applied.push(spec);
      } catch (err) {
        rejected.push({
          spec,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const entry: ReplanEntry = {
      replan_history_id: `rp-${this.uuid()}`,
      at: now.toISOString(),
      ...(req.reason ? { reason: req.reason } : {}),
      applied_changes: { add_sub_pipeline: applied },
      ...(rejected.length > 0 ? { rejected_changes: rejected } : {}),
    };
    plan.replan_history.push(entry);
    await savePipelinePlan(this.root, req.session_id, plan, now);

    return {
      pipeline_id: plan.id,
      applied_changes: entry.applied_changes,
      rejected_changes: rejected,
      replan_history_id: entry.replan_history_id,
      plan,
    };
  }

  /**
   * Spec §07 §2.1 facade. Transitions an `in_progress` pipeline to
   * `completed` once every sub-pipeline has settled into `completed`.
   * registry-guard / pending-question-guard apply (`opc_pipeline_complete`
   * is a protected anchor per §4.1).
   */
  async complete(req: {
    session_id: string;
    pipeline_id: string;
    reason?: string;
  }): Promise<PipelineCompleteResponse> {
    const flow = await loadFlowState(this.root, req.session_id);
    if (flow.pending_reflections.length > 0) {
      const ids = flow.pending_reflections.map((p) => p.reflection_id).join(",");
      throw new PipelineConflictError(
        `reflection-registry-guard: opc_pipeline_complete blocked; pending_reflections=[${ids}]; register via opc_flow_reflect first`,
      );
    }
    if (flow.pending_user_question) {
      throw new PipelineConflictError(
        `pending-question-guard: opc_pipeline_complete blocked; resolve question_id=${flow.pending_user_question.question_id} via opc_flow_user_reply`,
      );
    }
    const plan = await loadPipelinePlan(this.root, req.session_id, req.pipeline_id);
    const unfinished = plan.sub_pipelines.filter(
      (s) => s.status !== "completed" && s.status !== "aborted" && s.status !== "failed",
    );
    if (unfinished.length > 0) {
      throw new PipelineConflictError(
        `cannot complete pipeline ${plan.id}: sub_pipelines [${unfinished
          .map((s) => `${s.id}=${s.status}`)
          .join(",")}] not settled`,
      );
    }
    const now = this.now();

    // Collect produced units from all sub-pipelines
    const produced_units: ProducedUnit[] = [];
    let total_nodes = 0;
    let total_phases = 0;
    const subManifests: Array<{
      sub_id: string;
      title: string;
      phases: string[];
      nodes: Array<{ name: string; status: string; output_count: number }>;
    }> = [];

    for (const sub of plan.sub_pipelines) {
      try {
        const state = await loadStateJson(
          this.root, req.session_id, req.pipeline_id, sub.id,
        );
        total_phases += state.phases.length;
        const subNodes: typeof subManifests[0]["nodes"] = [];
        for (const ph of state.phases) {
          for (const node of ph.nodes) {
            total_nodes += 1;
            let output_count = 0;
            for (const artifact of node.output) {
              const unitType = artifact.type === "knowledge" ? "knowledge" : "code";
              const entry: ProducedUnit = {
                type: unitType,
                path: artifact.path,
                source_node: node.name,
                source_sub_pipeline: sub.id,
              };
              if (artifact.version != null) entry.version = artifact.version;
              produced_units.push(entry);
              output_count += 1;
            }
            subNodes.push({
              name: node.name,
              status: node.status,
              output_count,
            });
          }
        }
        subManifests.push({
          sub_id: sub.id,
          title: sub.title,
          phases: state.phases.map((p) => p.phase),
          nodes: subNodes,
        });
      } catch {
        // sub-pipeline state not found — skip (may have been deleted)
      }
    }

    // Write manifest.md
    const mdPath = manifestPath(this.root, req.session_id, plan.id);
    const mdContent = renderManifest(plan, subManifests, produced_units, now);
    await writeFile(mdPath, mdContent, "utf8");

    plan.status = "completed";
    plan.last_active_at = now.toISOString();
    await savePipelinePlan(this.root, req.session_id, plan, now);
    flow.history.push({
      step: "pipeline_complete",
      tool: "opc_pipeline_lifecycle",
      input: { action: "complete", ...req },
      output: { pipeline_id: plan.id, manifest_path: mdPath, produced_units_count: produced_units.length },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);
    return {
      pipeline_id: plan.id,
      status: "completed",
      completed_at: now.toISOString(),
      manifest_path: mdPath,
      produced_units,
      total_nodes,
      total_phases,
      flow_next: {
        tool: "opc_flow_lifecycle",
        args: { action: "start" },
      },
    };
  }

  /**
   * Spec §07 §2.1 facade. Aborts an in_progress pipeline (registry-guard
   *豁免 per §4.4: abort is intentionally allowed even with pending
   * reflections — it short-circuits the loop). Marks unsettled
   * sub-pipelines as `aborted`.
   */
  async abort(req: {
    session_id: string;
    pipeline_id: string;
    reason?: string;
  }): Promise<PipelineAbortResponse> {
    const plan = await loadPipelinePlan(this.root, req.session_id, req.pipeline_id);
    const now = this.now();
    for (const sub of plan.sub_pipelines) {
      if (sub.status !== "completed" && sub.status !== "aborted") {
        sub.status = "aborted";
      }
    }
    plan.status = "aborted";
    plan.last_active_at = now.toISOString();
    await savePipelinePlan(this.root, req.session_id, plan, now);
    const flow = await loadFlowState(this.root, req.session_id);
    flow.history.push({
      step: "pipeline_abort",
      tool: "opc_pipeline_lifecycle",
      input: { action: "abort", ...req },
      output: { pipeline_id: plan.id, reason: req.reason ?? null },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);
    return {
      pipeline_id: plan.id,
      status: "aborted",
      aborted_at: now.toISOString(),
      reason: req.reason ?? null,
    };
  }

  /**
   * Spec §07 §2.1 facade. Resumes the first `paused` sub-pipeline (set
   * by add_sub_pipeline immediate insertions per memory
   * `project_phase_reset_and_insert.md`). When no `sub_pipeline_id` is
   * given, picks the earliest paused sub; otherwise validates the named
   * sub is paused. The state-manager normally calls this automatically
   * on node boundaries; the tool is exposed for manual recovery.
   */
  async resume(req: {
    session_id: string;
    pipeline_id: string;
    sub_pipeline_id?: string;
  }): Promise<PipelineResumeResponse> {
    const plan = await loadPipelinePlan(this.root, req.session_id, req.pipeline_id);
    const target = req.sub_pipeline_id
      ? plan.sub_pipelines.find((s) => s.id === req.sub_pipeline_id)
      : plan.sub_pipelines.find((s) => s.status === "paused");
    if (req.sub_pipeline_id && !target) {
      throw new PipelineConflictError(
        `sub_pipeline ${req.sub_pipeline_id} not found in pipeline ${plan.id}`,
      );
    }
    if (target && target.status !== "paused") {
      throw new PipelineConflictError(
        `cannot resume sub_pipeline ${target.id}: status=${target.status} (expected paused)`,
      );
    }
    const now = this.now();
    if (target) {
      target.status = "in_progress";
      delete target.paused_at;
      plan.status = "in_progress";
      plan.last_active_at = now.toISOString();
      await savePipelinePlan(this.root, req.session_id, plan, now);
    }
    const flow = await loadFlowState(this.root, req.session_id);
    flow.history.push({
      step: "pipeline_resume",
      tool: "opc_pipeline_lifecycle",
      input: { action: "resume", ...req },
      output: { resumed: target?.id ?? null },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);
    const flow_next = target
      ? {
          tool: "opc_phase_start",
          args: { pipeline_id: plan.id, sub_pipeline_id: target.id },
          why: "resumed from paused (sub_pipeline ready to advance)",
        }
      : {
          tool: "opc_pipeline_status",
          args: { pipeline_id: plan.id },
          why: "no paused sub_pipeline; inspect status to plan next move",
        };
    return {
      pipeline_id: plan.id,
      resumed_sub_pipeline: target?.id ?? null,
      flow_next,
    };
  }

  /**
   * Spec §07 §2.1 + §2.3: discriminator-routed facade for the four
   * pipeline lifecycle operations. The internal `complete/abort/replan/
   * resume` methods stay public so existing call sites and tests work
   * untouched; M19 wire layer will expose only `opc_pipeline_lifecycle`
   * + a deprecated alias for each old name.
   */
  async lifecycle(req: PipelineLifecycleRequest): Promise<PipelineLifecycleResponse> {
    switch (req.action) {
      case "complete": {
        const { action: _a, ...rest } = req;
        void _a;
        const r = await this.complete(rest);
        return { action: "complete", ...r };
      }
      case "abort": {
        const { action: _a, ...rest } = req;
        void _a;
        const r = await this.abort(rest);
        return { action: "abort", ...r };
      }
      case "replan": {
        const { action: _a, ...rest } = req;
        void _a;
        const r = await this.replan(rest);
        return { action: "replan", ...r };
      }
      case "resume": {
        const { action: _a, ...rest } = req;
        void _a;
        const r = await this.resume(rest);
        return { action: "resume", ...r };
      }
      default: {
        const exhaustive: never = req;
        throw new PipelineConflictError(
          `opc_pipeline_lifecycle: unknown action ${JSON.stringify(exhaustive)}`,
        );
      }
    }
  }


  private applyAddSubPipeline(plan: PipelinePlan, spec: AddSubPipelineSpec, now: Date): void {
    const id = spec.id ?? `sub-${this.uuid()}`;
    if (plan.sub_pipelines.some((s) => s.id === id)) {
      throw new PipelineConflictError(`sub_pipeline ${id} already exists`);
    }
    const priority: ExecutionPriority = spec.execution_priority ?? "normal";
    if (priority === "immediate") {
      const current = plan.sub_pipelines.find((s) => s.status === "in_progress");
      if (!current) {
        throw new PipelineConflictError(
          `add_sub_pipeline(immediate) requires an in_progress sub_pipeline; none found`,
        );
      }
      const overlap = spec.knowledge_unit.filter((u) => current.knowledge_unit.includes(u));
      if (overlap.length > 0) {
        throw new PipelineConflictError(
          `knowledge_unit overlap with in_progress sub ${current.id}: [${overlap.join(",")}]`,
        );
      }
    }
    for (const dep of spec.blocked_by ?? []) {
      if (!plan.sub_pipelines.some((s) => s.id === dep)) {
        throw new PipelineConflictError(`blocked_by references unknown sub: ${dep}`);
      }
    }
    const newSub: SubPipeline = {
      id,
      title: spec.title,
      knowledge_unit: spec.knowledge_unit,
      status: "pending",
      blocked_by: spec.blocked_by ?? [],
      execution_priority: priority,
      inserted_at: now.toISOString(),
      ...(spec.description ? { description: spec.description } : {}),
      ...(spec.suggested_phases ? { phases: spec.suggested_phases } : {}),
    };
    plan.sub_pipelines.push(newSub);
    // Append to a fresh execution group so insertions don't disturb existing order.
    const nextGroupIdx =
      plan.execution_order.length > 0
        ? plan.execution_order[plan.execution_order.length - 1]!.group + 1
        : 0;
    plan.execution_order.push({ group: nextGroupIdx, sub_pipeline_ids: [id] });
    try {
      validateDag({ sub_pipelines: plan.sub_pipelines });
    } catch (err) {
      // rollback
      plan.sub_pipelines.pop();
      plan.execution_order.pop();
      if (err instanceof TopologyError) throw new PipelineConflictError(err.message);
      throw err;
    }
  }

  private materializeSubs(req: PipelineCreateRequest, _now: Date): SubPipeline[] {
    if (req.sub_pipelines && req.sub_pipelines.length > 0) {
      return req.sub_pipelines.map((spec, idx) => {
        const id = spec.id ?? `sub-${idx + 1}`;
        const sub: SubPipeline = {
          id,
          title: spec.title,
          knowledge_unit: spec.knowledge_unit,
          status: "pending",
          blocked_by: spec.blocked_by ?? [],
          ...(spec.description ? { description: spec.description } : {}),
          ...(spec.suggested_phases ? { phases: spec.suggested_phases } : {}),
        };
        return sub;
      });
    }
    return [
      {
        id: "sub-1",
        title: req.description.slice(0, 80),
        knowledge_unit: req.knowledge_unit,
        status: "pending",
        blocked_by: [],
        description: req.description,
        phases: req.suggested_phases,
      },
    ];
  }
}

export function aggregatePipelineStatus(subs: SubPipeline[]): PipelineStatus {
  if (subs.some((s) => s.status === "aborted")) return "aborted";
  if (subs.some((s) => s.status === "failed")) return "failed";
  if (subs.some((s) => s.status === "in_progress" || s.status === "paused")) return "in_progress";
  if (subs.length > 0 && subs.every((s) => s.status === "completed")) return "completed";
  return "pending";
}

function renderManifest(
  plan: PipelinePlan,
  subManifests: Array<{
    sub_id: string;
    title: string;
    phases: string[];
    nodes: Array<{ name: string; status: string; output_count: number }>;
  }>,
  produced_units: ProducedUnit[],
  now: Date,
): string {
  const lines: string[] = [];
  lines.push(`# 产物清单 — ${plan.id}`);
  lines.push("");
  lines.push("## 管线信息");
  lines.push(`- 描述: ${plan.description}`);
  lines.push(`- 复杂度: ${plan.complexity}`);
  lines.push(`- 完成时间: ${now.toISOString()}`);
  lines.push(`- 子管线数: ${plan.sub_pipelines.length}`);
  lines.push("");
  lines.push("## 代码产物");
  lines.push("| 路径 | 来源 Node | 来源子管线 |");
  lines.push("|------|----------|----------|");
  const codeUnits = produced_units.filter((u) => u.type === "code");
  if (codeUnits.length > 0) {
    for (const u of codeUnits) {
      lines.push(`| ${u.path} | ${u.source_node} | ${u.source_sub_pipeline} |`);
    }
  } else {
    lines.push("| (无代码产物) | | |");
  }
  lines.push("");
  lines.push("## 知识产物");
  lines.push("| 路径 | 版本 | 来源 Node | 来源子管线 |");
  lines.push("|------|------|----------|----------|");
  const knowledgeUnits = produced_units.filter((u) => u.type === "knowledge");
  if (knowledgeUnits.length > 0) {
    for (const u of knowledgeUnits) {
      lines.push(
        `| ${u.path} | v${u.version ?? "?"} | ${u.source_node} | ${u.source_sub_pipeline} |`,
      );
    }
  } else {
    lines.push("| (无知识产物) | | | |");
  }
  lines.push("");
  lines.push("## 子管线执行摘要");
  for (const sm of subManifests) {
    lines.push(`### ${sm.sub_id}: ${sm.title}`);
    lines.push(`- 阶段: ${sm.phases.join(" → ")}`);
    lines.push("| Node | 状态 | 产出数 |");
    lines.push("|------|------|------|");
    for (const n of sm.nodes) {
      lines.push(`| ${n.name} | ${n.status} | ${n.output_count} |`);
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
