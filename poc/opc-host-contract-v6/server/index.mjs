/**
 * V6 PoC server — streamable HTTP MCP transport with session tracking.
 *
 * Claim under test (doc/feature/06-host-contract/00_overview.md §V6):
 *   "HTTP/SSE 模式下 Mcp-Session-Id 跨请求稳定 + 协议级 disconnect 事件可监听"
 *
 * This server exposes:
 *   - 1 tool `report_session` that returns the current sessionId observed
 *     by the server's transport (used by harness to verify the client
 *     sends a consistent header).
 *   - 1 tool `bump_counter` that increments + returns a per-session counter
 *     (used to verify the same session_id is genuinely reused across calls,
 *     not just claimed in headers).
 *   - on-session-init + on-session-close callbacks that append to an
 *     event-log file, which the harness reads after killing clients to
 *     verify protocol-level disconnect detection.
 *
 * Listens on PORT (default 4242). One transport instance per Mcp-Session-Id;
 * stateful mode (sessionIdGenerator returns randomUUID).
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { appendFile, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = parseInt(process.env.PORT || "4242", 10);
const EVENT_LOG = resolve(process.env.EVENT_LOG || "./events.jsonl");

// reset event log
if (existsSync(EVENT_LOG)) {
  await writeFile(EVENT_LOG, "");
} else {
  mkdirSync(dirname(EVENT_LOG), { recursive: true });
  await writeFile(EVENT_LOG, "");
}

async function logEvent(event) {
  await appendFile(EVENT_LOG, JSON.stringify({ ...event, ts: Date.now() }) + "\n");
}

// transports keyed by Mcp-Session-Id
/** @type {Map<string, { transport: StreamableHTTPServerTransport, server: McpServer, counter: number, last_seen: number }>} */
const sessions = new Map();

function buildMcpServer(getSessionContext) {
  const s = new McpServer({
    name: "opc-v6-poc",
    version: "0.0.1",
  });

  s.registerTool(
    "report_session",
    {
      title: "Report session",
      description: "Return server-side session metadata for V6 verification",
      inputSchema: {},
    },
    async () => {
      const ctx = getSessionContext();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              server_observed_session_id: ctx.session_id,
              counter: ctx.counter,
              last_seen_ms_ago: Date.now() - ctx.last_seen,
            }),
          },
        ],
      };
    },
  );

  s.registerTool(
    "bump_counter",
    {
      title: "Increment counter",
      description: "Bump per-session counter (proves session continuity across calls)",
      inputSchema: {},
    },
    async () => {
      const ctx = getSessionContext();
      ctx.counter += 1;
      ctx.last_seen = Date.now();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ counter: ctx.counter }),
          },
        ],
      };
    },
  );

  return s;
}

const httpServer = createServer(async (req, res) => {
  const sessionIdHeader = req.headers["mcp-session-id"];

  // health endpoint for the harness
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ sessions: [...sessions.keys()], port: PORT }));
    return;
  }

  // sessions inspector endpoint for the harness
  if (req.url === "/sessions" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify(
        [...sessions.entries()].map(([id, ctx]) => ({
          session_id: id,
          counter: ctx.counter,
          last_seen_ms_ago: Date.now() - ctx.last_seen,
        })),
      ),
    );
    return;
  }

  // route MCP requests
  if (sessionIdHeader && typeof sessionIdHeader === "string" && sessions.has(sessionIdHeader)) {
    // existing session
    const { transport } = sessions.get(sessionIdHeader);
    await transport.handleRequest(req, res);
    return;
  }

  // new session (initialize request) — create transport on the fly
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: async (sid) => {
      const ctx = { session_id: sid, counter: 0, last_seen: Date.now() };
      // bind tools to this session's ctx
      const mcp = buildMcpServer(() => ctx);
      await mcp.connect(transport);
      sessions.set(sid, { transport, server: mcp, ...ctx });
      // Note: sessions Map shares ctx by reference, but counter writes go
      // through the closure. Sync them:
      const stored = sessions.get(sid);
      Object.defineProperty(stored, "counter", {
        get: () => ctx.counter,
        set: (v) => { ctx.counter = v; },
      });
      Object.defineProperty(stored, "last_seen", {
        get: () => ctx.last_seen,
        set: (v) => { ctx.last_seen = v; },
      });
      await logEvent({ type: "session_initialized", session_id: sid });
    },
    onsessionclosed: async (sid) => {
      sessions.delete(sid);
      await logEvent({ type: "session_closed", session_id: sid });
    },
  });

  transport.onclose = async () => {
    if (transport.sessionId) {
      await logEvent({ type: "transport_closed", session_id: transport.sessionId });
    }
  };

  await transport.handleRequest(req, res);
});

httpServer.listen(PORT, () => {
  console.log(JSON.stringify({ ready: true, port: PORT, event_log: EVENT_LOG }));
});

// graceful shutdown
process.on("SIGTERM", () => httpServer.close(() => process.exit(0)));
process.on("SIGINT", () => httpServer.close(() => process.exit(0)));
