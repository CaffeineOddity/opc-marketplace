/**
 * V6 PoC harness — Mcp-Session-Id stability + disconnect detection.
 *
 * V6 success criteria (doc/feature/06-host-contract/00_overview.md §V6):
 *   1. Mcp-Session-Id consistent across multiple requests from same client
 *   2. Client disconnect → server detects within DISCONNECT_GRACE (10s default)
 *   3. heartbeat ledger reaper can mark owner orphan correctly
 *
 * Method:
 *   Spawn the V6 server as a subprocess. Open two MCP clients (A and B)
 *   against it. For each client:
 *     - Call report_session (capture server-observed session_id)
 *     - Call bump_counter 3 times (verify per-session counter monotonic
 *       across requests — proves same session_id reused)
 *     - Call report_session again, verify session_id matches first call
 *   Then:
 *     - Close client A explicitly → wait → verify server's event log
 *       shows session_closed event for A's session_id
 *     - Client B continues working → verify B's counter unaffected
 *   Cross-client verification:
 *     - A's session_id !== B's session_id (independent sessions)
 *     - After A closes, B can still call tools
 *
 * Reaper simulation (criterion 3):
 *   Pure-function test in this file. The reaper logic is `(now - last_seen)
 *   > HEARTBEAT_TIMEOUT && status != active`. We synthesize 3 owner records
 *   and confirm the reaper marks the right ones orphan.
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, "../server");
const PORT = parseInt(process.env.PORT || "4242", 10);
const SERVER_URL = new URL(`http://localhost:${PORT}/`);
const EVENT_LOG = resolve(SERVER_DIR, "events.jsonl");

const DISCONNECT_GRACE_MS = 10_000; // doc default; harness waits half that

// ---- server lifecycle ----

async function startServer() {
  const proc = spawn("node", ["index.mjs"], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(PORT), EVENT_LOG },
    stdio: ["ignore", "pipe", "inherit"],
  });
  // wait for ready line
  const ready = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("server didn't become ready in 5s")), 5000);
    proc.stdout.on("data", (chunk) => {
      const line = chunk.toString();
      if (line.includes('"ready":true')) {
        clearTimeout(timer);
        res(true);
      }
    });
    proc.on("error", rej);
  });
  return { proc, ready };
}

async function makeClient(name) {
  const transport = new StreamableHTTPClientTransport(SERVER_URL);
  const client = new Client({ name, version: "0.0.1" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

async function callTool(client, name) {
  const res = await client.callTool({ name, arguments: {} });
  const text = res.content?.[0]?.text;
  return text ? JSON.parse(text) : {};
}

async function readEventLog() {
  const raw = await readFile(EVENT_LOG, "utf8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ---- reaper criterion 3 (pure function test) ----

const HEARTBEAT_TIMEOUT_MS = 120_000;

function reapOrphans(owners, now) {
  return owners
    .filter((o) => now - o.last_heartbeat > HEARTBEAT_TIMEOUT_MS && o.status !== "active")
    .map((o) => o.session_id);
}

function testReaper() {
  const now = Date.now();
  const owners = [
    { session_id: "fresh-active", last_heartbeat: now - 5000, status: "active" },
    { session_id: "fresh-inactive", last_heartbeat: now - 5000, status: "disconnected" },
    { session_id: "stale-active", last_heartbeat: now - 200_000, status: "active" },
    { session_id: "stale-inactive", last_heartbeat: now - 200_000, status: "disconnected" },
  ];
  const orphans = reapOrphans(owners, now);
  return {
    passed: orphans.length === 1 && orphans[0] === "stale-inactive",
    orphans,
    expected: ["stale-inactive"],
    explanation:
      "Only stale-inactive should reap: stale-active is still actively heartbeating (caller should fix status), fresh-* are within timeout.",
  };
}

// ---- main flow ----

async function main() {
  const results = {
    poc: "V6 — HTTP/SSE Mcp-Session-Id + disconnect",
    pid: process.pid,
    ran_at: new Date().toISOString(),
    server_url: SERVER_URL.href,
    criteria: {},
    timeline: [],
  };

  const log = (msg, data) => {
    const entry = { ts_ms_offset: Date.now() - startedAt, msg, ...(data ?? {}) };
    results.timeline.push(entry);
    console.error(`[harness] ${msg}${data ? " " + JSON.stringify(data) : ""}`);
  };

  const { proc: serverProc } = await startServer();
  const startedAt = Date.now();
  log("server up");

  try {
    // ── Criterion 1: session_id stable across requests from same client ──
    const { client: clientA, transport: transportA } = await makeClient("clientA");
    const a1 = await callTool(clientA, "report_session");
    const a2 = await callTool(clientA, "bump_counter");
    const a3 = await callTool(clientA, "bump_counter");
    const a4 = await callTool(clientA, "bump_counter");
    const a5 = await callTool(clientA, "report_session");

    log("clientA after 5 calls", { sid_seen_1: a1.server_observed_session_id, sid_seen_2: a5.server_observed_session_id });

    const sidA = a1.server_observed_session_id;
    const sidA_again = a5.server_observed_session_id;
    const counterA_final = a5.counter;
    const transportSidA = transportA.sessionId;

    results.criteria.c1_session_id_stable = {
      pass:
        sidA === sidA_again &&
        sidA === transportSidA &&
        counterA_final === 3 &&
        a2.counter === 1 &&
        a3.counter === 2 &&
        a4.counter === 3,
      detail: {
        server_seen_first: sidA,
        server_seen_last: sidA_again,
        transport_session_id: transportSidA,
        counter_progression: [a2.counter, a3.counter, a4.counter, counterA_final],
      },
    };

    // ── Second client (B) with independent session ──
    const { client: clientB } = await makeClient("clientB");
    const b1 = await callTool(clientB, "report_session");
    const b2 = await callTool(clientB, "bump_counter");
    log("clientB initial", { sid: b1.server_observed_session_id, counter: b2.counter });

    const sidB = b1.server_observed_session_id;
    results.criteria.c1_clients_isolated = {
      pass: sidA !== sidB && b2.counter === 1,
      detail: { sidA, sidB, b_counter_after_bump: b2.counter },
    };

    // Verify server's /sessions endpoint shows both
    const sessionsBefore = await fetch(`${SERVER_URL}sessions`).then((r) => r.json());
    log("server.sessions before close", { count: sessionsBefore.length });
    results.criteria.c1_server_sees_both = {
      pass:
        sessionsBefore.length === 2 &&
        sessionsBefore.some((s) => s.session_id === sidA) &&
        sessionsBefore.some((s) => s.session_id === sidB),
      detail: { sessions: sessionsBefore },
    };

    // ── Criterion 2: disconnect detection ──
    // Per MCP Streamable HTTP spec, clients SHOULD send DELETE with Mcp-Session-Id
    // to explicitly terminate the session. The SDK exposes this as
    // transport.terminateSession(). Calling client.close() alone only tears down
    // the client-side transport without notifying the server.
    log("terminating clientA session via DELETE + closing transport");
    await transportA.terminateSession();
    await clientA.close();
    await sleep(500);

    const events = await readEventLog();
    log("server events captured", { count: events.length, types: events.map((e) => e.type) });

    const aInitEvent = events.find((e) => e.type === "session_initialized" && e.session_id === sidA);
    const aCloseEvent = events.find(
      (e) => (e.type === "session_closed" || e.type === "transport_closed") && e.session_id === sidA,
    );

    results.criteria.c2_disconnect_detected = {
      pass: Boolean(aInitEvent && aCloseEvent),
      detail: {
        a_init_logged: Boolean(aInitEvent),
        a_close_logged: Boolean(aCloseEvent),
        close_event_type: aCloseEvent?.type,
        close_latency_ms: aCloseEvent && aInitEvent ? aCloseEvent.ts - aInitEvent.ts : null,
      },
    };

    // ── Criterion 2-bonus: B unaffected by A's close ──
    const b3 = await callTool(clientB, "bump_counter");
    log("clientB after A close", { counter: b3.counter });
    results.criteria.c2_other_client_unaffected = {
      pass: b3.counter === 2,
      detail: { b_counter_after_a_close: b3.counter, expected: 2 },
    };

    await clientB.close();

    // ── Criterion 3: reaper logic ──
    const reaperResult = testReaper();
    results.criteria.c3_reaper_correctness = {
      pass: reaperResult.passed,
      detail: reaperResult,
    };
  } finally {
    serverProc.kill("SIGTERM");
    await new Promise((res) => serverProc.on("exit", res));
  }

  // ── Summary ──
  const allPass = Object.values(results.criteria).every((c) => c.pass);
  results.success = allPass;
  console.log(JSON.stringify(results, null, 2));
  if (!allPass) process.exit(2);
}

main().catch((err) => {
  console.error("V6 harness crashed:", err);
  process.exit(1);
});
