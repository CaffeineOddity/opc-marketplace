#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = resolve(__dirname, "..", "artifacts");
mkdirSync(ARTIFACT_DIR, { recursive: true });

const server = new Server(
  { name: "opc-poc-host-contract", version: "0.0.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "poc_echo_read",
      description:
        "PoC read-only tool. Echoes back the provided text. Use to prove sub-agent can call inherited MCP tools (V2).",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
    {
      name: "poc_echo_write",
      description:
        "PoC write tool. Writes a small proof file under poc/opc-host-contract-v2-v3/artifacts/ and returns its path. Use to prove (a) V2: sub-agent with this tool whitelisted can actually mutate fs, (b) V3: sub-agent without this tool whitelisted CANNOT call it.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
    {
      name: "report_pid",
      description:
        "PoC introspection tool for V1 (Host Contract C1/C2). Returns the MCP server's own pid + ppid + the full ancestor process chain (ps -o pid,ppid,comm walked up to pid 1). Use to prove session_id = `sess-<ppid>-<ts>` derivation works in stdio mode (process.ppid actually points to the Claude Code main process).",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};

  if (name === "poc_echo_read") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ echoed: args.text ?? null, server_pid: process.pid }),
        },
      ],
    };
  }

  if (name === "poc_echo_write") {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = resolve(ARTIFACT_DIR, `proof-${stamp}.txt`);
    writeFileSync(
      filePath,
      `text=${args.text ?? ""}\nserver_pid=${process.pid}\nwritten_at=${new Date().toISOString()}\n`
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ file_path: filePath, server_pid: process.pid }),
        },
      ],
    };
  }

  if (name === "report_pid") {
    const chain = [];
    let cur = process.pid;
    for (let i = 0; i < 20 && cur && cur !== 1; i++) {
      try {
        const out = execSync(`ps -p ${cur} -o pid=,ppid=,comm=`, { encoding: "utf8" }).trim();
        const m = out.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
        if (!m) break;
        const entry = { pid: Number(m[1]), ppid: Number(m[2]), comm: m[3] };
        chain.push(entry);
        if (entry.ppid === cur) break;
        cur = entry.ppid;
      } catch {
        break;
      }
    }
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = resolve(ARTIFACT_DIR, `pidreport-${stamp}.json`);
    const payload = {
      server_pid: process.pid,
      server_ppid: process.ppid,
      argv: process.argv,
      ancestor_chain: chain,
      captured_at: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
    return {
      content: [{ type: "text", text: JSON.stringify({ ...payload, artifact: filePath }) }],
    };
  }

  throw new Error(`unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("READY\n");
