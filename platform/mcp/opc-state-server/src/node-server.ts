import { randomUUID } from "node:crypto";

import { loadFlowState, saveFlowState } from "./flow-state.js";
import { loadPipelinePlan, savePipelinePlan } from "./pipeline-plan.js";
import {
  loadStateJson,
  saveStateJson,
  type NodeDefinition,
  type NodeEvidence,
  type NodeState,
  type NodeStatus,
  type PhaseState,
  type QualityGate,
} from "./state-json.js";
import {
  computeUnblockedNodes,
  resolve,
  type ResolvedNodeStatus,
  type ResolvedPlan,
} from "./node-resolver.js";

export interface NodeServerOptions {
  root: string;
  now?: () => Date;
  uuid?: () => string;
  pid?: () => number;
}

export class NodeValidationError extends Error {
  public readonly required_action?: string;
  constructor(message: string, opts: { required_action?: string } = {}) {
    super(message);
    this.name = "NodeValidationError";
    if (opts.required_action) this.required_action = opts.required_action;
  }
}

export interface NodeStartRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
  node_name: string;
  node_definition?: NodeDefinition;
  input_knowledge?: Array<{ path: string; version: number; content?: string }>;
}

export interface NodeStartResponse {
  node: string;
  status: "in_progress";
  agent: string;
  input_knowledge: Array<{ path: string; version: number; content?: string }>;
  dispatch_instruction: {
    subagent_type: string;
    node_body: string | null;
    dispatch_context: Record<string, unknown>;
  };
  flow_next: { tool: string; args?: Record<string, unknown>; why?: string };
}

export interface NodeCompleteRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
  node_name: string;
  evidence?: NodeEvidence;
  artifacts_exist?: string[];
  knowledge_index_has?: string[];
}

export interface NodeCompleteResponse {
  node: string;
  status: "completed";
  evidence: NodeEvidence | null;
  output: NodeState["output"];
  unblocked_nodes: string[];
  flow_next: { tool: string; args?: Record<string, unknown>; why?: string };
}

export interface NodeFailRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
  node_name: string;
  error: { message: string; type: string };
}

export interface NodeFailResponse {
  node: string;
  status: "failed";
  error: { message: string; type: string };
  retry_count: number;
  max_retries: number;
  retry_available: boolean;
  flow_next: { tool: string; args?: Record<string, unknown>; why?: string };
}

export interface NodeRetryRequest {
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
  node_name: string;
  reset_retry_count?: boolean;
}

export interface NodeRetryResponse {
  node: string;
  status: "ready";
  retry_count: number;
  reset_downstream: string[];
  flow_next: { tool: string; args?: Record<string, unknown>; why?: string };
}

export type NodeFinishRequest =
  | ({ status: "success" } & NodeCompleteRequest)
  | ({ status: "failed" } & NodeFailRequest)
  | ({ status: "retry" } & NodeRetryRequest);

export type NodeFinishResponse =
  | ({ status: "success"; node_status: "completed" } & Omit<NodeCompleteResponse, "status">)
  | ({ status: "failed"; node_status: "failed" } & Omit<NodeFailResponse, "status">)
  | ({ status: "retry"; node_status: "ready" } & Omit<NodeRetryResponse, "status">);

export class NodeServer {
  readonly root: string;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly pid: () => number;

  constructor(opts: NodeServerOptions) {
    this.root = opts.root;
    this.now = opts.now ?? ((): Date => new Date());
    this.uuid = opts.uuid ?? ((): string => randomUUID());
    this.pid = opts.pid ?? ((): number => process.pid);
  }

  async start(req: NodeStartRequest): Promise<NodeStartResponse> {
    void this.uuid;
    void this.pid;
    const flow = await loadFlowState(this.root, req.session_id);
    if (flow.pending_reflections.length > 0) {
      const ids = flow.pending_reflections.map((p) => p.reflection_id).join(",");
      throw new NodeValidationError(
        `reflection-registry-guard: opc_node_start blocked; pending_reflections=[${ids}]`,
        { required_action: "opc_flow_reflect" },
      );
    }
    if (flow.pending_user_question) {
      throw new NodeValidationError(
        `pending-question-guard: opc_node_start blocked; resolve question_id=${flow.pending_user_question.question_id} via opc_flow_user_reply`,
        { required_action: "opc_flow_user_reply" },
      );
    }

    const state = await loadStateJson(this.root, req.session_id, req.pipeline_id, req.sub_pipeline_id);
    const phase = state.phases.find((p) => p.phase === req.phase);
    if (!phase) throw new NodeValidationError(`phase ${req.phase} not found`);
    if (phase.status !== "in_progress") {
      throw new NodeValidationError(
        `phase ${req.phase} must be in_progress to start a node; current=${phase.status}`,
      );
    }

    let node = phase.nodes.find((n) => n.name === req.node_name);
    if (!node) {
      if (!req.node_definition) {
        throw new NodeValidationError(
          `node ${req.node_name} not present in state and no node_definition provided`,
        );
      }
      node = materializeNode(req.node_definition);
      phase.nodes.push(node);
    } else if (req.node_definition) {
      hydrateFromDefinition(node, req.node_definition);
    }

    if (node.status === "completed") {
      throw new NodeValidationError(`node ${node.name} already completed`);
    }
    if (node.status === "in_progress") {
      throw new NodeValidationError(`node ${node.name} already in_progress`);
    }
    const unmet = node.blocked_by.filter((dep) => {
      const upstream = phase.nodes.find((n) => n.name === dep);
      return !upstream || upstream.status !== "completed";
    });
    if (unmet.length > 0) {
      throw new NodeValidationError(
        `node ${node.name} blocked_by not satisfied: [${unmet.join(",")}]`,
      );
    }

    if (node.node_input) {
      const provided = new Map<string, number>();
      for (const k of req.input_knowledge ?? []) provided.set(k.path, k.version);
      for (const spec of node.node_input) {
        if (typeof spec.min_version !== "number") continue;
        const v = provided.get(spec.knowledge);
        if (v === undefined) {
          throw new NodeValidationError(
            `L0: required input knowledge ${spec.knowledge} not provided by caller`,
          );
        }
        if (v < spec.min_version) {
          throw new NodeValidationError(
            `L0: input.knowledge ${spec.knowledge} version ${v} < min_version ${spec.min_version}`,
          );
        }
      }
    }

    node.status = "in_progress";
    const now = this.now();
    node.started_at = now.toISOString();

    await saveStateJson(this.root, req.session_id, req.pipeline_id, state, now);

    flow.current_pipeline_pointer = {
      pipeline_id: req.pipeline_id,
      sub_pipeline_id: req.sub_pipeline_id,
      phase: req.phase,
      node: req.node_name,
    };
    flow.history.push({
      step: "node_start",
      tool: "opc_node_start",
      input: req,
      output: { node: req.node_name, agent: node.agent },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);

    return {
      node: node.name,
      status: "in_progress",
      agent: node.agent,
      input_knowledge: req.input_knowledge ?? [],
      dispatch_instruction: {
        subagent_type: node.agent,
        node_body: req.node_definition?.body ?? null,
        dispatch_context: {
          node: node.name,
          phase: req.phase,
          sub_pipeline_id: req.sub_pipeline_id,
          pipeline_id: req.pipeline_id,
          session_id: req.session_id,
        },
      },
      flow_next: {
        tool: "opc_node_complete",
        args: {
          pipeline_id: req.pipeline_id,
          sub_pipeline_id: req.sub_pipeline_id,
          phase: req.phase,
          node_name: node.name,
        },
        why: "after sub-agent finishes, report evidence and complete the node",
      },
    };
  }

  async complete(req: NodeCompleteRequest): Promise<NodeCompleteResponse> {
    const state = await loadStateJson(this.root, req.session_id, req.pipeline_id, req.sub_pipeline_id);
    const phase = state.phases.find((p) => p.phase === req.phase);
    if (!phase) throw new NodeValidationError(`phase ${req.phase} not found`);
    const node = phase.nodes.find((n) => n.name === req.node_name);
    if (!node) throw new NodeValidationError(`node ${req.node_name} not found`);
    if (node.status !== "in_progress") {
      throw new NodeValidationError(
        `node ${node.name} cannot complete from status=${node.status}`,
      );
    }

    validateL1(node, req);
    if (node.quality_gates && node.quality_gates.length > 0) {
      validateL2(node.quality_gates, req.evidence);
    }

    node.status = "completed";
    const now = this.now();
    node.completed_at = now.toISOString();
    if (req.evidence) node.evidence = req.evidence;
    if (req.evidence?.knowledge_written) {
      for (const w of req.evidence.knowledge_written) {
        node.output.push({ type: "knowledge", path: w.path, version: w.version });
      }
    }
    if (req.evidence?.artifacts_written) {
      for (const path of req.evidence.artifacts_written) {
        node.output.push({ type: "artifact", path });
      }
    }

    const planForGroups = buildResolvedPlanFromPhase(phase);
    const statusByName = new Map<string, ResolvedNodeStatus["status"]>();
    for (const n of phase.nodes) statusByName.set(n.name, n.status);
    const unblocked = computeUnblockedNodes(planForGroups, statusByName);
    for (const u of unblocked) {
      const target = phase.nodes.find((n) => n.name === u);
      if (target && target.status === "pending") {
        target.status = "ready";
        target.unblocked_at = now.toISOString();
      }
    }

    await saveStateJson(this.root, req.session_id, req.pipeline_id, state, now);

    const flow = await loadFlowState(this.root, req.session_id);
    flow.history.push({
      step: "node_complete",
      tool: "opc_node_complete",
      input: req,
      output: { node: req.node_name, unblocked },
      at: now.toISOString(),
    });

    const phaseDone = phase.nodes.every((n) => n.status === "completed");
    let flow_next: NodeCompleteResponse["flow_next"];
    if (phaseDone) {
      const plan = await loadPipelinePlan(this.root, req.session_id, req.pipeline_id);
      await savePipelinePlan(this.root, req.session_id, plan, now);
      flow_next = {
        tool: "opc_phase_complete",
        args: {
          pipeline_id: req.pipeline_id,
          sub_pipeline_id: req.sub_pipeline_id,
          phase: req.phase,
        },
        why: "all nodes in phase completed",
      };
    } else if (unblocked.length > 0) {
      flow_next = {
        tool: "opc_node_start",
        args: {
          pipeline_id: req.pipeline_id,
          sub_pipeline_id: req.sub_pipeline_id,
          phase: req.phase,
          node_name: unblocked[0],
        },
        why: "next unblocked node",
      };
    } else {
      flow_next = {
        tool: "opc_flow_query",
        args: { session_id: req.session_id },
        why: "no unblocked nodes; waiting on other in_progress nodes",
      };
    }

    flow.current_pipeline_pointer = {
      pipeline_id: req.pipeline_id,
      sub_pipeline_id: req.sub_pipeline_id,
      phase: req.phase,
    };
    await saveFlowState(this.root, flow, now);

    return {
      node: req.node_name,
      status: "completed",
      evidence: req.evidence ?? null,
      output: node.output,
      unblocked_nodes: unblocked,
      flow_next,
    };
  }

  /**
   * Spec §07 §3.2 facade — `opc_node_finish({status:"failed"})`.
   * Records the error, increments retry_count, flips node to "failed".
   * If `retry_count < max_retries`, flow_next steers to opc_node_finish
   * with status=retry so the caller can re-run; otherwise to opc_flow_query
   * for human escalation. Per §4.4 the entire `opc_node_finish` tool is
   * exempt from registry-guard (sub-agent回报通道).
   */
  async fail(req: NodeFailRequest): Promise<NodeFailResponse> {
    const state = await loadStateJson(this.root, req.session_id, req.pipeline_id, req.sub_pipeline_id);
    const phase = state.phases.find((p) => p.phase === req.phase);
    if (!phase) throw new NodeValidationError(`phase ${req.phase} not found`);
    const node = phase.nodes.find((n) => n.name === req.node_name);
    if (!node) throw new NodeValidationError(`node ${req.node_name} not found`);
    if (node.status !== "in_progress") {
      throw new NodeValidationError(
        `node ${node.name} cannot fail from status=${node.status}`,
      );
    }

    const now = this.now();
    node.status = "failed";
    node.error = { message: req.error.message, type: req.error.type };
    node.retry_count += 1;
    node.completed_at = now.toISOString();
    await saveStateJson(this.root, req.session_id, req.pipeline_id, state, now);

    const retry_available = node.retry_count < node.max_retries;
    const flow = await loadFlowState(this.root, req.session_id);
    flow.history.push({
      step: "node_fail",
      tool: "opc_node_finish",
      input: req,
      output: {
        node: req.node_name,
        retry_count: node.retry_count,
        retry_available,
      },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);

    const flow_next = retry_available
      ? {
          tool: "opc_node_finish",
          args: {
            pipeline_id: req.pipeline_id,
            sub_pipeline_id: req.sub_pipeline_id,
            phase: req.phase,
            node_name: req.node_name,
            status: "retry" as const,
          },
          why: `retry budget remaining (${node.retry_count}/${node.max_retries})`,
        }
      : {
          tool: "opc_flow_query",
          args: { session_id: req.session_id },
          why: `retry budget exhausted (${node.retry_count}/${node.max_retries}); human escalation required`,
        };

    return {
      node: req.node_name,
      status: "failed",
      error: node.error,
      retry_count: node.retry_count,
      max_retries: node.max_retries,
      retry_available,
      flow_next,
    };
  }

  /**
   * Spec §07 §3.2 facade — `opc_node_finish({status:"retry"})`. Resets a
   * failed node back to `ready` so the caller can re-run via opc_node_start.
   * If `reset_retry_count` is true (default), retry_count is also cleared
   * to give the new attempt a full budget; otherwise the existing count
   * is preserved (manual retry within budget).
   *
   * Downstream cascade: any `completed` node whose blocked_by transitively
   * included the failed node is reset to `pending` so the rerun output
   * forces them to re-execute too. The list is returned in
   * `reset_downstream` for caller transparency.
   */
  async retry(req: NodeRetryRequest): Promise<NodeRetryResponse> {
    const state = await loadStateJson(this.root, req.session_id, req.pipeline_id, req.sub_pipeline_id);
    const phase = state.phases.find((p) => p.phase === req.phase);
    if (!phase) throw new NodeValidationError(`phase ${req.phase} not found`);
    const node = phase.nodes.find((n) => n.name === req.node_name);
    if (!node) throw new NodeValidationError(`node ${req.node_name} not found`);
    if (node.status !== "failed") {
      throw new NodeValidationError(
        `node ${node.name} cannot retry from status=${node.status} (expected failed)`,
      );
    }

    const reset = req.reset_retry_count ?? true;
    if (reset) node.retry_count = 0;
    node.status = "ready";
    node.error = null;
    delete node.started_at;
    delete node.completed_at;
    delete node.evidence;

    const downstreamReset: string[] = [];
    const dependents = new Map<string, string[]>();
    for (const n of phase.nodes) {
      for (const dep of n.blocked_by) {
        const arr = dependents.get(dep) ?? [];
        arr.push(n.name);
        dependents.set(dep, arr);
      }
    }
    const stack = [node.name];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const children = dependents.get(cur) ?? [];
      for (const c of children) {
        if (visited.has(c)) continue;
        visited.add(c);
        const tn = phase.nodes.find((n) => n.name === c);
        if (!tn) continue;
        if (tn.status === "completed" || tn.status === "ready" || tn.status === "in_progress") {
          tn.status = "pending";
          delete tn.started_at;
          delete tn.completed_at;
          delete tn.evidence;
          delete tn.unblocked_at;
          downstreamReset.push(c);
          stack.push(c);
        }
      }
    }

    const now = this.now();
    await saveStateJson(this.root, req.session_id, req.pipeline_id, state, now);
    const flow = await loadFlowState(this.root, req.session_id);
    flow.history.push({
      step: "node_retry",
      tool: "opc_node_finish",
      input: req,
      output: {
        node: req.node_name,
        retry_count: node.retry_count,
        reset_downstream: downstreamReset,
      },
      at: now.toISOString(),
    });
    await saveFlowState(this.root, flow, now);

    return {
      node: req.node_name,
      status: "ready",
      retry_count: node.retry_count,
      reset_downstream: downstreamReset,
      flow_next: {
        tool: "opc_node_start",
        args: {
          pipeline_id: req.pipeline_id,
          sub_pipeline_id: req.sub_pipeline_id,
          phase: req.phase,
          node_name: req.node_name,
        },
        why: "node ready for re-execution",
      },
    };
  }

  /**
   * Spec §07 §3.2: discriminator-routed facade for the three node-finish
   * paths. The existing `complete()` method backs `status=success`; `fail()`
   * and `retry()` are new. The whole `opc_node_finish` surface is on the
   * §4.4 registry-guard exemption list because it's the sub-agent回报通道
   * — gating it would deadlock the reflection loop.
   */
  async finish(req: NodeFinishRequest): Promise<NodeFinishResponse> {
    switch (req.status) {
      case "success": {
        const { status: _s, ...rest } = req;
        void _s;
        const { status: _ns, ...r } = await this.complete(rest);
        void _ns;
        return { status: "success", node_status: "completed", ...r };
      }
      case "failed": {
        const { status: _s, ...rest } = req;
        void _s;
        const { status: _ns, ...r } = await this.fail(rest);
        void _ns;
        return { status: "failed", node_status: "failed", ...r };
      }
      case "retry": {
        const { status: _s, ...rest } = req;
        void _s;
        const { status: _ns, ...r } = await this.retry(rest);
        void _ns;
        return { status: "retry", node_status: "ready", ...r };
      }
      default: {
        const exhaustive: never = req;
        throw new NodeValidationError(
          `opc_node_finish: unknown status ${JSON.stringify(exhaustive)}`,
        );
      }
    }
  }
}

function materializeNode(def: NodeDefinition): NodeState {
  const node: NodeState = {
    name: def.name,
    status: "pending",
    agent: def.agents.primary[0] ?? "",
    blocked_by: [],
    input: [],
    output: [],
    error: null,
    timeout_minutes: def.timeout_minutes ?? 30,
    retry_count: 0,
    max_retries: def.max_retries ?? 3,
    mode: def.mode,
  };
  if (def.quality_gates) node.quality_gates = def.quality_gates;
  if (def.input) node.node_input = def.input;
  if (def.output) node.node_output = def.output;
  if (def.source_path) node.node_file_path = def.source_path;
  return node;
}

function hydrateFromDefinition(node: NodeState, def: NodeDefinition): void {
  if (!node.agent && def.agents.primary[0]) node.agent = def.agents.primary[0];
  if (def.quality_gates && !node.quality_gates) node.quality_gates = def.quality_gates;
  if (def.input && !node.node_input) node.node_input = def.input;
  if (def.output && !node.node_output) node.node_output = def.output;
  if (def.source_path && !node.node_file_path) node.node_file_path = def.source_path;
  if (def.mode && !node.mode) node.mode = def.mode;
  if (typeof def.timeout_minutes === "number") node.timeout_minutes = def.timeout_minutes;
  if (typeof def.max_retries === "number") node.max_retries = def.max_retries;
}

function validateL1(node: NodeState, req: NodeCompleteRequest): void {
  const declaredArtifacts = (node.node_output ?? []).flatMap((o) => o.artifacts);
  const existingArtifacts = new Set([
    ...(req.artifacts_exist ?? []),
    ...((req.evidence?.artifacts_written ?? []) as string[]),
  ]);
  for (const path of declaredArtifacts) {
    if (!existingArtifacts.has(path)) {
      throw new NodeValidationError(
        `L1: declared output.artifact ${path} not present (caller must supply artifacts_exist or evidence.artifacts_written)`,
      );
    }
  }
  const declaredKnowledge = (node.node_output ?? []).map((o) => o.knowledge);
  const indexedKnowledge = new Set([
    ...(req.knowledge_index_has ?? []),
    ...((req.evidence?.knowledge_written ?? []).map((w) => w.path) as string[]),
  ]);
  for (const path of declaredKnowledge) {
    if (!indexedKnowledge.has(path)) {
      throw new NodeValidationError(
        `L1: declared output.knowledge ${path} not present in knowledge index (caller must supply knowledge_index_has or evidence.knowledge_written)`,
      );
    }
  }
}

function validateL2(gates: QualityGate[], evidence: NodeEvidence | undefined): void {
  if (!evidence) {
    throw new NodeValidationError(
      `L2: quality_gates=[${gates.join(",")}] declared but no evidence provided`,
    );
  }
  for (const g of gates) {
    if (g === "test_pass") {
      if (!evidence.test_results || evidence.test_results.failed !== 0) {
        throw new NodeValidationError(`L2: test_pass not satisfied (failed != 0 or missing)`);
      }
    } else if (g === "lint_pass") {
      if (!evidence.lint_results || evidence.lint_results.errors !== 0) {
        throw new NodeValidationError(`L2: lint_pass not satisfied (errors != 0 or missing)`);
      }
    } else if (g === "build_pass") {
      if (evidence.build_passed !== true) {
        throw new NodeValidationError(`L2: build_pass not satisfied`);
      }
    } else if (g === "type_check_pass") {
      if (evidence.type_check_passed !== true) {
        throw new NodeValidationError(`L2: type_check_pass not satisfied`);
      }
    }
  }
}

function buildResolvedPlanFromPhase(phase: PhaseState): ResolvedPlan {
  const defs: NodeDefinition[] = phase.nodes.map((n) => ({
    name: n.name,
    phase: phase.phase,
    description: "",
    tags: [],
    mode: n.mode ?? "sequential",
    agents: { primary: n.agent ? [n.agent] : [] },
    ...(n.node_input ? { input: n.node_input } : {}),
    ...(n.node_output ? { output: n.node_output } : {}),
  }));
  try {
    return resolve(defs);
  } catch {
    return {
      nodes: phase.nodes.map((n) => ({
        name: n.name,
        agent: n.agent,
        blocked_by: n.blocked_by,
        mode: n.mode ?? "sequential",
      })),
      groups: [{ group: 0, nodes: phase.nodes.map((n) => n.name), parallel: false }],
    };
  }
}

export function nodeStatusToInputForResolver(state: NodeState): ResolvedNodeStatus["status"] {
  return state.status as ResolvedNodeStatus["status"];
}

export type { NodeDefinition, NodeStatus };
