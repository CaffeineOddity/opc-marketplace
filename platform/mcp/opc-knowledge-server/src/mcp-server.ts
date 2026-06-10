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

import { KnowledgeServer, type AdminRequest, type OpenRequest, type ReadRequest, type WriteRequest } from "./server.js";

export interface KnowledgeMcpOptions {
  root: string;
}

const TOOL_DEFS = [
  {
    name: "opc_knowledge_open",
    description:
      "Open one or more knowledge units for reading/writing. Returns unit trees and related units.",
    inputSchema: {
      type: "object",
      properties: {
        units: { type: "array", items: { type: "string" } },
      },
      required: ["units"],
    } as const,
  },
  {
    name: "opc_knowledge_read",
    description:
      "Read knowledge. mode=single reads one entry; mode=batch reads multiple; mode=list lists entries; mode=search searches the index; mode=diff computes a diff between a base version and the current version.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["single", "batch", "list", "search", "diff"] },
        unit: { type: "string" },
        section: { type: "string" },
        sub: { type: "string" },
        version: { type: "number" },
        entries: { type: "array" },
        query: { type: "string" },
        consistency: { type: "string", enum: ["eventual", "fresh"] },
        base_version: { type: "number" },
        candidate_content: { type: "string" },
        subsection: { type: "string" },
        min_version: { type: "number" },
      },
      required: ["mode"],
    } as const,
  },
  {
    name: "opc_knowledge_write",
    description:
      "Write knowledge content with 3-way diff-merge. If base_version is behind, the server runs diff3(base, yours, theirs) and returns merge_status=conflict with suggested_actions on conflict.",
    inputSchema: {
      type: "object",
      properties: {
        unit: { type: "string" },
        section: { type: "string" },
        sub: { type: "string" },
        content: { type: "string" },
        base_version: { type: "number" },
        metadata: { type: "object" },
        refs: { type: "array", items: { type: "string" } },
      },
      required: ["unit", "section", "sub", "content"],
    } as const,
  },
  {
    name: "opc_knowledge_admin",
    description:
      "Admin operations on knowledge. action=delete removes a unit; action=reindex rebuilds the search index.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["delete", "reindex"] },
        unit: { type: "string" },
        section: { type: "string" },
        sub: { type: "string" },
        base_version: { type: "number" },
        mode: { type: "string", enum: ["full", "incremental"] },
      },
      required: ["action"],
    } as const,
  },
];

export async function startKnowledgeServer(opts: KnowledgeMcpOptions): Promise<void> {
  const mcpServer = new Server(
    { name: "opc-knowledge-server", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  const root = resolve(opts.root);
  mkdirSync(root, { recursive: true });

  const knowledge = new KnowledgeServer({ root });

  // K1: heal broken/stale index before accepting requests
  const healResult = await knowledge.startupSelfCheck();
  if (healResult.reindexed) {
    process.stderr.write(
      `opc-knowledge-server: startup reindex (${healResult.reason})\n`,
    );
  }

  // K3: graceful shutdown — flush reindex queue before exit
  const gracefulShutdown = async (signal: string) => {
    process.stderr.write(`opc-knowledge-server: ${signal} received, flushing...\n`);
    await knowledge.shutdown();
    process.stderr.write("opc-knowledge-server: shutdown complete\n");
    process.exit(0);
  };
  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

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
      const result = await dispatchKnowledge(toolName, args, knowledge);
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
  process.stderr.write("opc-knowledge-server READY\n");
}

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

async function dispatchKnowledge(
  toolName: string,
  args: Record<string, unknown>,
  knowledge: KnowledgeServer,
): Promise<unknown> {
  const s = (key: string) => args[key] as string;
  const a = (key: string) => args[key] as unknown[] | undefined;
  const n = (key: string) => args[key] as number | undefined;

  switch (toolName) {
    case "opc_knowledge_open":
      return knowledge.open({
        units: (a("units") ?? []) as string[],
      } as OpenRequest);

    case "opc_knowledge_read": {
      const mode = s("mode");
      if (mode === "single") {
        return knowledge.read({
          mode: "single",
          unit: s("unit"),
          section: s("section"),
          sub: s("sub"),
          ...(n("version") != null ? { version: n("version") } : {}),
        } as ReadRequest);
      }
      if (mode === "batch") {
        return knowledge.read({
          mode: "batch",
          entries: (a("entries") ?? []) as ReadRequest extends { mode: "batch" } ? ReadRequest["entries"] : never,
        } as ReadRequest);
      }
      if (mode === "list") {
        return knowledge.read({
          mode: "list",
          unit: s("unit"),
          ...(s("section") ? { section: s("section") } : {}),
          ...(s("subsection") ? { subsection: s("subsection") } : {}),
        } as ReadRequest);
      }
      if (mode === "search") {
        return knowledge.read({
          mode: "search",
          query: s("query"),
          ...(s("unit") ? { unit: s("unit") } : {}),
          ...(s("consistency") ? { consistency: s("consistency") as "eventual" | "fresh" } : {}),
        } as ReadRequest);
      }
      // diff
      return knowledge.read({
        mode: "diff",
        unit: s("unit"),
        section: s("section"),
        sub: s("sub"),
        base_version: n("base_version") ?? 0,
        ...(s("candidate_content") ? { candidate_content: s("candidate_content") } : {}),
      } as ReadRequest);
    }

    case "opc_knowledge_write":
      return knowledge.write({
        unit: s("unit"),
        section: s("section"),
        sub: s("sub"),
        content: s("content"),
        ...(n("base_version") != null ? { base_version: n("base_version") } : {}),
        ...(args.metadata ? { metadata: args.metadata as WriteRequest["metadata"] } : {}),
        ...(a("refs") ? { refs: a("refs") as string[] } : {}),
      } as WriteRequest);

    case "opc_knowledge_admin": {
      const action = s("action");
      if (action === "delete") {
        return knowledge.admin({
          action: "delete",
          unit: s("unit"),
          section: s("section"),
          sub: s("sub"),
          ...(n("base_version") != null ? { base_version: n("base_version") } : {}),
        } as AdminRequest);
      }
      // reindex
      return knowledge.admin({
        action: "reindex",
        ...(s("mode") ? { mode: s("mode") as "full" | "incremental" } : {}),
      } as AdminRequest);
    }

    default:
      throw new Error(`no dispatch for tool: ${toolName}`);
  }
}
