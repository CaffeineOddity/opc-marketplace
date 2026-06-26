#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { resolveAlias } from "@opc/tool-aliases";

import { bootstrapBuiltins, formatUpgradeWarnings } from "./bootstrap.js";

import { FlowServer, type CorrectRequest, type LifecycleRequest, type QuickDispatchRequest, type QueryRequest, type ReflectRequest, type StepCompleteRequest, type UserReplyRequest } from "./flow-server.js";
import type { FlowStep, Intent } from "./flow-state.js";
import type { PhaseConfirmNodeOverride, PhaseCompleteRequest, PhaseConfirmRequest, PhaseStartRequest } from "./phase-server.js";
import type { NodeFinishRequest, NodeStartRequest } from "./node-server.js";
import type { PipelineCreateRequest, PipelineLifecycleRequest, PipelineStatusRequest } from "./pipeline-server.js";
import { NodeServer } from "./node-server.js";
import { PhaseServer } from "./phase-server.js";
import { PipelineServer } from "./pipeline-server.js";
import { deriveSessionIdFromDate, readTransportFromEnv, resolveClaudePid } from "./index.js";

export interface StateServerOptions {
  root: string;
}

const TOOL_DEFS = [
  {
    name: "opc_flow_query",
    description:
      "Query the current OPC flow state. Returns active status, current step, and suggested next actions. This is the entry point for all OPC interactions.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        claude_pid: { type: "number" },
      },
      required: ["session_id"],
    } as const,
  },
  {
    name: "opc_flow_lifecycle",
    description:
      "Manage OPC flow lifecycle. action=start begins a new flow; action=abort terminates it; action=recover takes over an orphaned session.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "abort", "recover"] },
        session_id: { type: "string" },
        initial_message: { type: "string" },
        reason: { type: "string" },
        claude_pid: { type: "number" },
      },
      required: ["action"],
    } as const,
  },
  {
    name: "opc_flow_step_complete",
    description:
      "Complete a flow step. step=intent_analysis submits intent; step=task_analysis submits analyzed requirements; step=task_decomposition submits sub-pipeline split; step=brief_generation submits the generated brief.",
    inputSchema: {
      type: "object",
      properties: {
        step: { type: "string", enum: ["intent_analysis", "task_analysis", "task_decomposition", "brief_generation"] },
        session_id: { type: "string" },
        intent: { type: "string" },
        intent_evidence_ref: { type: "string" },
        reasoning: { type: "string" },
        analysis_result: { type: "object" },
        task_analysis_evidence_ref: { type: "string" },
        sub_pipelines: { type: "array" },
        decomposition_evidence_ref: { type: "string" },
        brief_content: { type: "string" },
        brief_evidence_ref: { type: "string" },
      },
      required: ["step", "session_id"],
    } as const,
  },
  {
    name: "opc_flow_reflect",
    description:
      "Register a completed reflection round. Protected registry-guard anchor.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        reflection_id: { type: "string" },
        artifact_path: { type: "string" },
        step_id: { type: "string" },
        round: { type: "number" },
        method: { type: "string" },
        evidence_diff: { type: "object" },
        validator_result: { type: "object" },
        objections_kept_by_meta: { type: "number" },
        notes: { type: "string" },
        verdict: { type: "string", enum: ["ok", "rounds_exceeded"] },
        rounds_exceeded_payload: { type: "object" },
        pipeline_pointer_ref: { type: "object" },
      },
      required: ["session_id", "reflection_id"],
    } as const,
  },
  {
    name: "opc_flow_user_reply",
    description:
      "Resolve a pending user question raised by the flow. Unblocks protected tools guarded by pending-question-guard.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        question_id: { type: "string" },
        user_reply: { type: "string" },
        resolution: { type: "string", enum: ["confirmed", "revised", "rejected"] },
      },
      required: ["session_id", "question_id", "user_reply", "resolution"],
    } as const,
  },
  {
    name: "opc_quick_dispatch",
    description:
      "Dispatch a low-complexity task directly without creating a pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        intent: { type: "string" },
        note: { type: "string" },
      },
      required: ["session_id", "intent"],
    } as const,
  },
  {
    name: "opc_flow_correct",
    description:
      "Correct the flow. action=revise adjusts the current step; action=restart redoes from a previous step; action=phase_reset changes pipeline pointer.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["revise", "restart", "phase_reset"] },
        session_id: { type: "string" },
        reason: { type: "string" },
        reset_to_step: { type: "string" },
        pipeline_pointer: { type: "object" },
        user_reply: { type: "string" },
      },
      required: ["action", "session_id"],
    } as const,
  },
  {
    name: "opc_pipeline_create",
    description:
      "Create a new OPC pipeline from a completed brief. Protected by reflection-registry-guard.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        description: { type: "string" },
        brief_content: { type: "string" },
        complexity: { type: "string", enum: ["simple", "medium", "high"] },
        knowledge_unit: { type: "array", items: { type: "string" } },
        suggested_phases: { type: "array", items: { type: "string" } },
        phase_selection_rationale: { type: "string" },
        sub_pipelines: { type: "array" },
        execution_order: { type: "array" },
        tags: { type: "array", items: { type: "string" } },
        scenario: { type: "string" },
        required_agents: { type: "array", items: { type: "string" } },
      },
      required: ["session_id", "description", "brief_content", "complexity", "knowledge_unit", "suggested_phases", "phase_selection_rationale"],
    } as const,
  },
  {
    name: "opc_pipeline_status",
    description:
      "Read pipeline status with sub-pipeline states, next-pending, and blocked sub-pipelines.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        pipeline_id: { type: "string" },
        sub_pipeline_id: { type: "string" },
      },
      required: ["session_id", "pipeline_id"],
    } as const,
  },
  {
    name: "opc_pipeline_lifecycle",
    description:
      "Manage pipeline lifecycle. action=complete finalizes; action=abort terminates; action=replan adjusts sub-pipelines; action=resume continues paused sub.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["complete", "abort", "replan", "resume"] },
        session_id: { type: "string" },
        pipeline_id: { type: "string" },
        reason: { type: "string" },
        changes: { type: "object" },
        sub_pipeline_id: { type: "string" },
      },
      required: ["action", "session_id", "pipeline_id"],
    } as const,
  },
  {
    name: "opc_phase_start",
    description:
      "Start a new phase in the pipeline. Returns available nodes and flow_next step.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        pipeline_id: { type: "string" },
        sub_pipeline_id: { type: "string" },
        phase: { type: "string" },
      },
      required: ["session_id", "pipeline_id", "sub_pipeline_id", "phase"],
    } as const,
  },
  {
    name: "opc_phase_confirm",
    description:
      "Confirm the node selection plan for the current phase. Protected anchor.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        pipeline_id: { type: "string" },
        sub_pipeline_id: { type: "string" },
        phase: { type: "string" },
        nodes: { type: "array", items: { type: "object", properties: { name: { type: "string" }, blocked_by: { type: "array", items: { type: "string" } } }, required: ["name"] } },
        confirm_commit_ref: { type: "string" },
      },
      required: ["session_id", "pipeline_id", "sub_pipeline_id", "phase"],
    } as const,
  },
  {
    name: "opc_phase_complete",
    description:
      "Complete the current phase. Runs V1-V5 validator on phase evidence. Protected anchor.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        pipeline_id: { type: "string" },
        sub_pipeline_id: { type: "string" },
        phase: { type: "string" },
        quality_gate_results: { type: "array" },
        phase_evidence_ref: { type: "string" },
      },
      required: ["session_id", "pipeline_id", "sub_pipeline_id", "phase"],
    } as const,
  },
  {
    name: "opc_node_start",
    description:
      "Start executing a node. Returns node body and dispatch instructions. Protected anchor.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        pipeline_id: { type: "string" },
        sub_pipeline_id: { type: "string" },
        node_name: { type: "string" },
      },
      required: ["session_id", "pipeline_id", "sub_pipeline_id", "node_name"],
    } as const,
  },
  {
    name: "opc_node_finish",
    description:
      "Finish a node. status=success runs validators; status=failed triggers retry; status=retry resets for re-execution.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["success", "failed", "retry"] },
        session_id: { type: "string" },
        pipeline_id: { type: "string" },
        sub_pipeline_id: { type: "string" },
        phase: { type: "string" },
        node_name: { type: "string" },
        evidence: { type: "object" },
        error: { type: "object", properties: { message: { type: "string" }, type: { type: "string" } }, required: ["message", "type"] },
        reset_retry_count: { type: "boolean" },
      },
      required: ["status", "session_id", "pipeline_id", "sub_pipeline_id", "phase", "node_name"],
    } as const,
  },
];

export async function startStateServer(opts: StateServerOptions): Promise<void> {
  const transport = readTransportFromEnv();

  const mcpServer = new Server(
    { name: "opc-state-server", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  const root = resolve(opts.root);
  mkdirSync(root, { recursive: true });

  // Bootstrap built-in phases/ and scenarios/ into <root>/.opc/ on first run.
  // Subsequent runs perform three-way conflict detection against the previous
  // bundle snapshot. Warnings are surfaced through opc_flow_query responses.
  let upgradeWarnings: string[] = [];
  try {
    const bootstrap = await bootstrapBuiltins(root);
    upgradeWarnings = formatUpgradeWarnings(bootstrap);
    if (upgradeWarnings.length > 0) {
      for (const w of upgradeWarnings) {
        process.stderr.write(`[opc-state-server] ${w}\n`);
      }
    }
  } catch (err) {
    // Bootstrap is best-effort — never block server startup.
    process.stderr.write(
      `[opc-state-server] bootstrap failed: ${(err as Error).message}\n`,
    );
  }

  const resolvedPid = resolveClaudePid({ transport, serverPid: () => process.pid });
  const claudePid: number = resolvedPid.pid;

  const flow = new FlowServer({
    root,
    transport,
    ppid: () => process.ppid,
    pid: () => claudePid,
    upgradeWarnings,
  });
  const pipeline = new PipelineServer({ root });
  const phase = new PhaseServer({ root });
  const node = new NodeServer({ root });

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    })),
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
    const rawName = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    const resolved = resolveAlias(rawName);
    if (!resolved) {
      return errorResult(`unknown tool: ${rawName}`);
    }

    if (resolved.deprecated) {
      emitDeprecation(rawName, resolved.tool);
    }

    const toolName = resolved.tool;
    const action = args.action as string | undefined;

    try {
      const result = await dispatchTool(toolName, args, action, flow, pipeline, phase, node, claudePid);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "Error";
      const required_action = (err as { required_action?: string }).required_action;
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message, code: name, ...(required_action ? { required_action } : {}) }) }],
        isError: true,
      };
    }
  });

  const stdioTransport = new StdioServerTransport();
  await mcpServer.connect(stdioTransport);
  process.stderr.write("opc-state-server READY\n");
}

// When run directly as a bin (e.g. `node dist/server.js` via the plugin's
// .mcp.json), start the server against the project root. The hook/CLI use
// CLAUDE_PROJECT_DIR; fall back to cwd so the server is runnable standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  startStateServer({ root: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).catch(
    (err) => {
      process.stderr.write(`opc-state-server failed to start: ${err}\n`);
      process.exit(1);
    },
  );
}

const _deprecationWarned = new Set<string>();
function emitDeprecation(legacyName: string, canonical: string) {
  if (_deprecationWarned.has(legacyName)) return;
  _deprecationWarned.add(legacyName);
  process.stderr.write(
    `[opc-state-server] DEPRECATED: "${legacyName}" → use "${canonical}" instead\n`,
  );
}

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  action: string | undefined,
  flow: FlowServer,
  pipeline: PipelineServer,
  phase: PhaseServer,
  node: NodeServer,
  claudePid: number,
): Promise<unknown> {
  const s = (key: string) => args[key] as string;
  const o = (key: string) => args[key] as Record<string, unknown> | undefined;
  const a = (key: string) => args[key] as unknown[] | undefined;
  const n = (key: string) => args[key] as number | undefined;

  switch (toolName) {
    // -- flow tools --
    case "opc_flow_query": {
      const sessionId = s("session_id") || deriveSessionIdFromDate(claudePid, new Date());
      const claudePidArg = n("claude_pid");
      return flow.query({
        session_id: sessionId,
        ...(claudePidArg != null ? { claude_pid: claudePidArg } : {}),
      } as QueryRequest);
    }

    case "opc_flow_lifecycle": {
      if (action === "start") {
        const sessionId = s("session_id") || deriveSessionIdFromDate(claudePid, new Date());
        const initialMessage = s("initial_message");
        return flow.lifecycle({
          action: "start",
          session_id: sessionId,
          ...(initialMessage ? { initial_message: initialMessage } : {}),
          claude_pid: claudePid,
        } as LifecycleRequest);
      }
      if (action === "abort") {
        const reason = s("reason");
        return flow.lifecycle({
          action: "abort",
          session_id: s("session_id"),
          ...(reason ? { reason } : {}),
        } as LifecycleRequest);
      }
      if (action === "recover") {
        return flow.lifecycle({
          action: "recover",
          session_id: s("session_id"),
          claude_pid: claudePid,
        } as LifecycleRequest);
      }
      throw new Error(`opc_flow_lifecycle: unknown action=${action}`);
    }

    case "opc_flow_step_complete": {
      const step = s("step");
      if (step === "intent_analysis") {
        const intentRef = s("intent_evidence_ref");
        const reasoning = s("reasoning");
        return flow.stepComplete({
          step: "intent_analysis",
          session_id: s("session_id"),
          intent: (args.intent ?? "task") as Intent,
          ...(intentRef ? { intent_evidence_ref: intentRef } : {}),
          ...(reasoning ? { reasoning } : {}),
        } as StepCompleteRequest);
      }
      if (step === "task_analysis") {
        const evidenceRef = s("task_analysis_evidence_ref");
        return flow.stepComplete({
          step: "task_analysis",
          session_id: s("session_id"),
          analysis_result: (args.analysis_result ?? null) as StepCompleteRequest extends { step: "task_analysis" } ? StepCompleteRequest["analysis_result"] : never,
          ...(evidenceRef ? { task_analysis_evidence_ref: evidenceRef } : {}),
        } as StepCompleteRequest);
      }
      if (step === "task_decomposition") {
        const evidenceRef = s("decomposition_evidence_ref");
        const subPipelines = a("sub_pipelines") ?? [];
        return flow.stepComplete({
          step: "task_decomposition",
          session_id: s("session_id"),
          sub_pipelines: subPipelines as StepCompleteRequest extends { step: "task_decomposition" } ? StepCompleteRequest["sub_pipelines"] : never,
          ...(evidenceRef ? { decomposition_evidence_ref: evidenceRef } : {}),
        } as StepCompleteRequest);
      }
      if (step === "brief_generation") {
        const evidenceRef = s("brief_evidence_ref");
        return flow.stepComplete({
          step: "brief_generation",
          session_id: s("session_id"),
          brief_content: s("brief_content") || "",
          ...(evidenceRef ? { brief_evidence_ref: evidenceRef } : {}),
        } as StepCompleteRequest);
      }
      throw new Error(`opc_flow_step_complete: unknown step=${step}`);
    }

    case "opc_flow_reflect":
      return flow.reflect({
        session_id: s("session_id"),
        reflection_id: s("reflection_id"),
        artifact_path: s("artifact_path") || undefined,
        step_id: s("step_id") || undefined,
        round: n("round"),
        method: s("method") || undefined,
        evidence_diff: o("evidence_diff") || undefined,
        validator_result: o("validator_result") || undefined,
        objections_kept_by_meta: n("objections_kept_by_meta"),
        notes: s("notes") || undefined,
        verdict: (args.verdict as "ok" | "rounds_exceeded") || undefined,
        rounds_exceeded_payload: o("rounds_exceeded_payload") as ReflectRequest["rounds_exceeded_payload"],
        pipeline_pointer_ref: (args.pipeline_pointer_ref ?? undefined) as ReflectRequest["pipeline_pointer_ref"],
      } as ReflectRequest);

    case "opc_flow_user_reply":
      return flow.userReply({
        session_id: s("session_id"),
        question_id: s("question_id"),
        user_reply: s("user_reply"),
        resolution: args.resolution as UserReplyRequest["resolution"],
      } as UserReplyRequest);

    case "opc_quick_dispatch":
      return flow.quickDispatch({
        session_id: s("session_id"),
        intent: s("intent") as Intent,
        ...(s("note") ? { note: s("note") } : {}),
      });

    case "opc_flow_correct": {
      if (action === "revise") {
        return flow.correct({
          action: "revise",
          session_id: s("session_id"),
          patch: (o("patch") ?? {}) as CorrectRequest extends { action: "revise" } ? CorrectRequest["patch"] : never,
        } as CorrectRequest);
      }
      if (action === "restart") {
        return flow.correct({
          action: "restart",
          session_id: s("session_id"),
          reset_to_step: s("reset_to_step") as FlowStep,
        } as CorrectRequest);
      }
      if (action === "phase_reset") {
        return flow.correct({
          action: "phase_reset",
          session_id: s("session_id"),
          pipeline_pointer: o("pipeline_pointer") ?? {},
        } as CorrectRequest);
      }
      throw new Error(`opc_flow_correct: unknown action=${action}`);
    }

    // -- pipeline tools --
    case "opc_pipeline_create":
      return pipeline.create({
        session_id: s("session_id"),
        description: s("description"),
        brief_content: s("brief_content"),
        complexity: args.complexity as PipelineCreateRequest["complexity"],
        knowledge_unit: (a("knowledge_unit") ?? []) as string[],
        suggested_phases: (a("suggested_phases") ?? []) as string[],
        phase_selection_rationale: s("phase_selection_rationale"),
        sub_pipelines: a("sub_pipelines") as PipelineCreateRequest["sub_pipelines"],
        execution_order: a("execution_order") as PipelineCreateRequest["execution_order"],
        tags: a("tags") as string[] | undefined,
        scenario: s("scenario") || undefined,
        required_agents: a("required_agents") as string[] | undefined,
      } as PipelineCreateRequest);

    case "opc_pipeline_status":
      return pipeline.status({
        session_id: s("session_id"),
        pipeline_id: s("pipeline_id"),
        ...(s("sub_pipeline_id") ? { sub_pipeline_id: s("sub_pipeline_id") } : {}),
      } as PipelineStatusRequest);

    case "opc_pipeline_lifecycle":
      return pipeline.lifecycle({
        action: action as PipelineLifecycleRequest extends { action: infer A } ? A : never,
        session_id: s("session_id"),
        pipeline_id: s("pipeline_id"),
        ...(s("reason") ? { reason: s("reason") } : {}),
        ...(o("changes") ? { changes: o("changes") as PipelineLifecycleRequest extends { changes: infer C } ? C : never } : {}),
        ...(s("sub_pipeline_id") ? { sub_pipeline_id: s("sub_pipeline_id") } : {}),
      } as PipelineLifecycleRequest);

    // -- phase tools --
    case "opc_phase_start":
      return phase.start({
        session_id: s("session_id"),
        pipeline_id: s("pipeline_id"),
        sub_pipeline_id: s("sub_pipeline_id"),
        phase: s("phase"),
      } as PhaseStartRequest);

    case "opc_phase_confirm":
      return phase.confirm({
        session_id: s("session_id"),
        pipeline_id: s("pipeline_id"),
        sub_pipeline_id: s("sub_pipeline_id"),
        phase: s("phase"),
        ...(a("nodes") ? { nodes: a("nodes") as PhaseConfirmNodeOverride[] } : {}),
        ...(s("confirm_commit_ref") ? { confirm_commit_ref: s("confirm_commit_ref") } : {}),
      } as PhaseConfirmRequest);

    case "opc_phase_complete":
      return phase.complete({
        session_id: s("session_id"),
        pipeline_id: s("pipeline_id"),
        sub_pipeline_id: s("sub_pipeline_id"),
        phase: s("phase"),
        ...(s("phase_evidence_ref") ? { confirm_commit_ref: s("phase_evidence_ref") } : {}),
      } as PhaseCompleteRequest);

    // -- node tools --
    case "opc_node_start":
      return node.start({
        session_id: s("session_id"),
        pipeline_id: s("pipeline_id"),
        sub_pipeline_id: s("sub_pipeline_id"),
        node_name: s("node_name"),
        ...(s("dispatch_instruction") ? { dispatch_instruction: s("dispatch_instruction") } : {}),
      } as NodeStartRequest);

    case "opc_node_finish": {
      const status = s("status") as "success" | "failed" | "retry";
      if (status === "success") {
        return node.finish({
          status: "success",
          session_id: s("session_id"),
          pipeline_id: s("pipeline_id"),
          sub_pipeline_id: s("sub_pipeline_id"),
          phase: s("phase"),
          node_name: s("node_name"),
          evidence: o("evidence") as NodeFinishRequest extends { status: "success" } ? NodeFinishRequest["evidence"] : never,
        } as NodeFinishRequest);
      }
      if (status === "failed") {
        return node.finish({
          status: "failed",
          session_id: s("session_id"),
          pipeline_id: s("pipeline_id"),
          sub_pipeline_id: s("sub_pipeline_id"),
          phase: s("phase"),
          node_name: s("node_name"),
          error: (o("error") ?? { message: "unknown", type: "internal" }) as { message: string; type: string },
        } as NodeFinishRequest);
      }
      // retry
      return node.finish({
        status: "retry",
        session_id: s("session_id"),
        pipeline_id: s("pipeline_id"),
        sub_pipeline_id: s("sub_pipeline_id"),
        phase: s("phase"),
        node_name: s("node_name"),
        ...(args.reset_retry_count != null ? { reset_retry_count: Boolean(args.reset_retry_count) } : {}),
      } as NodeFinishRequest);
    }

    default:
      throw new Error(`no dispatch for tool: ${toolName}`);
  }
}
