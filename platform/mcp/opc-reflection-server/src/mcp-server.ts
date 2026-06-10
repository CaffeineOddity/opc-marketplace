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

import {
  ReflectionServer,
  type ReflectPlanRequest,
  type ReflectExecuteRequest,
  type ReflectCompleteRequest,
  type ReflectAdminRequest,
} from "./reflection-server.js";
import {
  CorrectionsServer,
  type CorrectionsActionRequest,
  type CorrectionsQueryRequest,
} from "./corrections-server.js";
import type { ReflectionMethod, StepId } from "./store.js";

export interface ReflectionMcpOptions {
  root: string;
}

const TOOL_DEFS = [
  {
    name: "opc_reflect_plan",
    description:
      "Plan reflection rounds. Returns recommended primary/secondary methods, enhanced prompts, and max_rounds.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        step_id: { type: "string" },
        artifact_summary: { type: "string" },
        prior_corrections: { type: "string" },
        budget_disable_secondary: { type: "boolean" },
      },
      required: ["session_id", "step_id"],
    } as const,
  },
  {
    name: "opc_reflect_execute",
    description:
      "Execute a reflection method. method=cove runs M3; method=critique runs M4; method=debate runs M5; method=tot runs M6. Returns sub-agent dispatch spec.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["cove", "critique", "debate", "tot"] },
        session_id: { type: "string" },
        step_id: { type: "string" },
        artifact: { type: "object" },
        enhanced_prompt: { type: "string" },
      },
      required: ["method", "session_id", "step_id", "artifact", "enhanced_prompt"],
    } as const,
  },
  {
    name: "opc_reflect_complete",
    description:
      "Complete a reflection round. method discriminator selects which method's complete logic to run. Writes ReflectionArtifact to opc-logs and emits pending_reflection contract.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["cove", "critique", "debate", "tot"] },
        session_id: { type: "string" },
        step_id: { type: "string" },
        objections: { type: "array" },
        reasoning_trace: { type: "array", items: { type: "string" } },
        round: { type: "number" },
        max_rounds: { type: "number" },
        evidence_diff: { type: "object" },
        validator_context: { type: "object" },
        artifact: { type: "object" },
        current_pending_count: { type: "number" },
        telemetry: { type: "object" },
      },
      required: ["method", "session_id", "step_id", "objections", "reasoning_trace", "round"],
    } as const,
  },
  {
    name: "opc_reflect_admin",
    description:
      "Admin operations for reflection. action=record_interventions dispatches distiller sub-agent; action=on_demand runs an ad-hoc reflection; action=explain loads a reflection artifact; action=query_stats aggregates telemetry; action=unlearn_method suppresses a method for a TTL.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["record_interventions", "on_demand", "explain", "query_stats", "unlearn_method"] },
        session_id: { type: "string" },
        pipeline_id: { type: "string" },
        flow_state_path: { type: "string" },
        rounds_exceeded_artifacts: { type: "array", items: { type: "string" } },
        pipeline_metadata: { type: "object" },
        budget: { type: "object" },
        step: { type: "string" },
        reflection_id: { type: "string" },
        artifact_summary: { type: "string" },
        method: { type: "string" },
        reason: { type: "string" },
        window: { type: "string" },
        duration_hours: { type: "number" },
        triggered_by: { type: "string" },
      },
      required: ["action", "session_id"],
    } as const,
  },
  {
    name: "opc_corrections",
    description:
      "Corrections management. action=query searches corrections by step; action=record upserts a batch; action=unlearn removes a correction; action=reindex rebuilds the correction index.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["query", "record", "unlearn", "reindex"] },
        step: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
        batch: { type: "array" },
        correction_id: { type: "string" },
        reason: { type: "string" },
        scope: {},
      },
      required: ["action"],
    } as const,
  },
];

export async function startReflectionServer(opts: ReflectionMcpOptions): Promise<void> {
  const mcpServer = new Server(
    { name: "opc-reflection-server", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  const root = resolve(opts.root);
  mkdirSync(root, { recursive: true });

  const reflection = new ReflectionServer({ root });
  const corrections = new CorrectionsServer({ root });

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

    const toolName = resolved.tool;

    try {
      const result = await dispatchReflection(toolName, args, reflection, corrections);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "Error";
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message, code: name }) }],
        isError: true,
      };
    }
  });

  const stdioTransport = new StdioServerTransport();
  await mcpServer.connect(stdioTransport);
  process.stderr.write("opc-reflection-server READY\n");
}

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

async function dispatchReflection(
  toolName: string,
  args: Record<string, unknown>,
  reflection: ReflectionServer,
  corrections: CorrectionsServer,
): Promise<unknown> {
  const s = (key: string) => args[key] as string;
  const a = (key: string) => args[key] as unknown[] | undefined;
  const n = (key: string) => args[key] as number | undefined;
  const o = (key: string) => args[key] as Record<string, unknown> | undefined;
  const b = (key: string) => args[key] as boolean | undefined;

  switch (toolName) {
    case "opc_reflect_plan":
      return reflection.plan({
        session_id: s("session_id"),
        step_id: s("step_id") as StepId,
        ...(s("artifact_summary") ? { artifact_summary: s("artifact_summary") } : {}),
        ...(s("prior_corrections") ? { prior_corrections: s("prior_corrections") } : {}),
        ...(b("budget_disable_secondary") != null ? { budget_disable_secondary: b("budget_disable_secondary") } : {}),
      } as ReflectPlanRequest);

    case "opc_reflect_execute":
      return reflection.execute({
        method: s("method") as ReflectionMethod,
        session_id: s("session_id"),
        step_id: s("step_id") as StepId,
        artifact: (o("artifact") ?? { artifact_type: "unknown" }) as unknown as ReflectExecuteRequest["artifact"],
        enhanced_prompt: s("enhanced_prompt"),
      } as ReflectExecuteRequest);

    case "opc_reflect_complete":
      return reflection.complete({
        method: s("method") as ReflectionMethod,
        session_id: s("session_id"),
        step_id: s("step_id") as StepId,
        objections: (a("objections") ?? []) as ReflectCompleteRequest["objections"],
        reasoning_trace: (a("reasoning_trace") ?? []) as string[],
        round: n("round") ?? 1,
        ...(n("max_rounds") != null ? { max_rounds: n("max_rounds") } : {}),
        ...(o("evidence_diff") ? { evidence_diff: o("evidence_diff") } : {}),
        ...(o("validator_context") ? { validator_context: o("validator_context") as ReflectCompleteRequest["validator_context"] } : {}),
        ...(o("artifact") ? { artifact: o("artifact") as ReflectCompleteRequest["artifact"] } : {}),
        ...(n("current_pending_count") != null ? { current_pending_count: n("current_pending_count") } : {}),
        ...(o("telemetry") ? { telemetry: o("telemetry") as ReflectCompleteRequest["telemetry"] } : {}),
      } as ReflectCompleteRequest);

    case "opc_reflect_admin": {
      const action = s("action") as ReflectAdminRequest["action"];
      return reflection.admin({
        action,
        session_id: s("session_id"),
        ...(action === "record_interventions"
          ? {
              pipeline_id: s("pipeline_id"),
              ...(s("flow_state_path") ? { flow_state_path: s("flow_state_path") } : {}),
              ...(a("rounds_exceeded_artifacts") ? { rounds_exceeded_artifacts: a("rounds_exceeded_artifacts") as string[] } : {}),
              ...(o("pipeline_metadata") ? { pipeline_metadata: o("pipeline_metadata") as ReflectAdminRequest extends { action: "record_interventions" } ? ReflectAdminRequest["pipeline_metadata"] : never } : {}),
              ...(o("budget") ? { budget: o("budget") as ReflectAdminRequest extends { action: "record_interventions" } ? ReflectAdminRequest["budget"] : never } : {}),
            }
          : {}),
        ...(action === "on_demand"
          ? {
              step: s("step") as StepId,
              ...(s("reflection_id") ? { reflection_id: s("reflection_id") } : {}),
              ...(s("artifact_summary") ? { artifact_summary: s("artifact_summary") } : {}),
              ...(s("method") ? { method: s("method") as ReflectionMethod } : {}),
              ...(s("reason") ? { reason: s("reason") } : {}),
            }
          : {}),
        ...(action === "explain"
          ? { reflection_id: s("reflection_id") }
          : {}),
        ...(action === "query_stats"
          ? {
              ...(s("window") ? { window: s("window") } : {}),
              ...(s("flow_state_path") ? { flow_state_path: s("flow_state_path") } : {}),
            }
          : {}),
        ...(action === "unlearn_method"
          ? {
              method: s("method") as ReflectionMethod,
              ...(s("step") ? { step: s("step") as StepId } : {}),
              ...(n("duration_hours") != null ? { duration_hours: n("duration_hours") } : {}),
              ...(s("reason") ? { reason: s("reason") } : {}),
              ...(s("triggered_by") ? { triggered_by: s("triggered_by") as ReflectAdminRequest extends { action: "unlearn_method" } ? ReflectAdminRequest["triggered_by"] : never } : {}),
            }
          : {}),
      } as ReflectAdminRequest);
    }

    case "opc_corrections": {
      const action = s("action") as CorrectionsActionRequest["action"];
      if (action === "query") {
        const qLimit = n("limit");
        return corrections.query({
          step: s("step") as StepId,
          ...(a("keywords") ? { keywords: a("keywords") as string[] } : {}),
          ...(qLimit != null ? { limit: qLimit } : {}),
        } as CorrectionsQueryRequest);
      }
      if (action === "record") {
        return corrections.upsert({
          batch: (a("batch") ?? []) as CorrectionsActionRequest extends { action: "record" } ? CorrectionsActionRequest["batch"] : never,
        });
      }
      // unlearn and reindex are not_implemented per CorrectionsActionResponse
      return corrections.crud({
        action,
        ...(action === "unlearn"
          ? { correction_id: s("correction_id"), ...(s("reason") ? { reason: s("reason") } : {}) }
          : {}),
        ...(action === "reindex"
          ? { ...(args.scope ? { scope: args.scope as CorrectionsActionRequest extends { action: "reindex" } ? CorrectionsActionRequest["scope"] : never } : {}) }
          : {}),
      } as CorrectionsActionRequest);
    }

    default:
      throw new Error(`no dispatch for tool: ${toolName}`);
  }
}
