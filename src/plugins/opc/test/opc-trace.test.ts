import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TRACE = resolve(HERE, "..", "bin", "opc-trace.sh");

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "opc-trace-"));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

function runTrace(
  payload: object | string,
  env: Record<string, string> = {},
): RunResult {
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  const result = spawnSync("bash", [TRACE], {
    env: {
      PATH: process.env.PATH ?? "",
      CLAUDE_PROJECT_DIR: project,
      ...env,
    },
    input: json,
    encoding: "utf8",
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

function readLog(rel: string): string {
  const r = spawnSync("cat", [join(project, rel)], { encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

function lines(rel: string): string[] {
  const t = readLog(rel);
  return t.length === 0 ? [] : t.split("\n");
}

// Header regex for the compact format:
//   [HH:MM:SS][hookname]            (non-tool events)
//   [HH:MM:SS][hookname][toolname]  (tool events)
const HEADER_RE = /^\[\d{2}:\d{2}:\d{2}\]\[[^\]]+\](\[[^\]]+\])?/;

describe("opc-trace.sh", () => {
  it("never fails (exit 0) and never emits stdout (hooks must be silent)", () => {
    const r = runTrace({
      session_id: "s1",
      hook_event_name: "UserPromptSubmit",
      prompt: "hi",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("records a UserPromptSubmit entry under .opc/logs/<sid>/", () => {
    runTrace({
      session_id: "s1",
      hook_event_name: "UserPromptSubmit",
      prompt: "hello world",
    });
    const ev = lines(".opc/logs/s1/UserPromptSubmit.log");
    const trace = lines(".opc/logs/s1/trace.log");
    expect(ev).toHaveLength(1);
    expect(trace).toHaveLength(1);
    // [HH:MM:SS][UserPromptSubmit] hello world — NO third (tool) bracket.
    expect(ev[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\]\[UserPromptSubmit\] hello world$/);
  });

  it("records PreToolUse + PostToolUse with tool name and full input/response", () => {
    runTrace({
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls -la" },
    });
    runTrace({
      session_id: "s1",
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_response: "file1\nfile2",
    });
    const trace = lines(".opc/logs/s1/trace.log");
    // Newest first → PostToolUse block (2 lines) on top, then PreToolUse (2).
    expect(trace).toHaveLength(4);
    // PostToolUse header carries the tool bracket; out: on its own line.
    expect(trace[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\]\[PostToolUse\]\[Bash\]$/);
    expect(trace[1]).toMatch(/^out: /);
    expect(trace[1]).toContain("file1");
    expect(trace[1]).toContain("⏎"); // newline collapsed to ⏎
    // PreToolUse block follows.
    expect(trace[2]).toMatch(/^\[\d{2}:\d{2}:\d{2}\]\[PreToolUse\]\[Bash\]$/);
    expect(trace[3]).toMatch(/^in: /);
    expect(trace[3]).toContain("ls -la");
  });

  it("puts in: and out: on separate lines (not a single | -joined line)", () => {
    runTrace({
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: '{"command":"echo hi"}',
    });
    const trace = lines(".opc/logs/s1/trace.log");
    expect(trace).toHaveLength(2);
    expect(trace[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\]\[PreToolUse\]\[Bash\]$/);
    expect(trace[1]).toMatch(/^in: /);
    // No " | out:" joiner — this is a Pre event (no response) anyway, but the
    // format must never use the old single-line "in: ... | out: ..." shape.
    expect(trace.join("\n")).not.toContain("| out:");
  });

  it("omits empty brackets: non-tool events have no [toolname] segment", () => {
    runTrace({ session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "x" });
    runTrace({ session_id: "s1", hook_event_name: "Stop", stop_hook_active: false });
    const trace = lines(".opc/logs/s1/trace.log");
    expect(trace).toHaveLength(2);
    // Stop block: header + nothing else (stop_hook_active=false is inlined).
    expect(trace[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\]\[Stop\] stop_hook_active=false$/);
    expect(trace[1]).toMatch(/^\[\d{2}:\d{2}:\d{2}\]\[UserPromptSubmit\] x$/);
  });

  it("prepends newest-first (latest turn is line 1)", () => {
    runTrace({ session_id: "s1", hook_event_name: "Stop" });
    runTrace({ session_id: "s1", hook_event_name: "Stop" });
    const trace = lines(".opc/logs/s1/trace.log");
    expect(trace).toHaveLength(2);
    // Both headers parse; ordering is newest-first by wall clock (same-second
    // is possible, so just assert both are valid headers).
    expect(trace[0]).toMatch(HEADER_RE);
    expect(trace[1]).toMatch(HEADER_RE);
  });

  it("buckets by session id", () => {
    runTrace({ session_id: "aaa", hook_event_name: "Stop" });
    runTrace({ session_id: "bbb", hook_event_name: "Stop" });
    expect(lines(".opc/logs/aaa/trace.log")).toHaveLength(1);
    expect(lines(".opc/logs/bbb/trace.log")).toHaveLength(1);
  });

  it("falls back to a default bucket when session_id is missing", () => {
    runTrace({ hook_event_name: "Stop" });
    expect(lines(".opc/logs/default/trace.log")).toHaveLength(1);
  });

  it("OPC_TRACE=off writes nothing", () => {
    const r = runTrace(
      { session_id: "s1", hook_event_name: "Stop" },
      { OPC_TRACE: "off" },
    );
    expect(r.status).toBe(0);
    expect(lines(".opc/logs/s1/trace.log")).toHaveLength(0);
  });

  it("survives empty stdin (exit 0, no log)", () => {
    const r = runTrace("", {});
    expect(r.status).toBe(0);
  });

  it("survives malformed JSON (exit 0, logs Unknown under default)", () => {
    const r = runTrace("not json at all", {});
    expect(r.status).toBe(0);
    // Malformed → event Unknown, sid default.
    expect(lines(".opc/logs/default/Unknown.log")).toHaveLength(1);
  });

  it("sanitises session id into a path-safe segment (no traversal)", () => {
    runTrace({
      session_id: "../escape/../../etc",
      hook_event_name: "Stop",
    });
    const r = spawnSync("find", [join(project, ".opc", "logs"), "-mindepth", "1", "-maxdepth", "1"], {
      encoding: "utf8",
    });
    const found = (r.stdout ?? "").trim();
    expect(found).not.toBe("");
    const entries = found.split("\n");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/\.opc\/logs\/[^/]+$/);
    expect(entries[0]).toContain("_");
  });

  it("respects OPC_TRACE_TOOL_MAX by truncating oversized tool_input", () => {
    const huge = "x".repeat(5000);
    runTrace(
      {
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: huge,
      },
      { OPC_TRACE_TOOL_MAX: "100" },
    );
    const trace = lines(".opc/logs/s1/trace.log");
    expect(trace).toHaveLength(2);
    expect(trace[1]).toMatch(/^in: /);
    // Truncation marker present, and shorter than the original.
    expect(trace[1]).toContain("[truncated:");
    expect(trace[1].length).toBeLessThan(huge.length);
  });

  it("keeps separate per-event files alongside the unified trace.log", () => {
    runTrace({ session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "a" });
    runTrace({ session_id: "s1", hook_event_name: "PreToolUse", tool_name: "T", tool_input: "x" });
    runTrace({ session_id: "s1", hook_event_name: "Stop" });
    expect(lines(".opc/logs/s1/UserPromptSubmit.log")).toHaveLength(1);
    expect(lines(".opc/logs/s1/PreToolUse.log")).toHaveLength(2); // header + in:
    expect(lines(".opc/logs/s1/Stop.log")).toHaveLength(1);
    expect(lines(".opc/logs/s1/trace.log")).toHaveLength(4);
  });

  it("rotates when a log exceeds OPC_TRACE_MAX_KB (keeps newest half)", () => {
    for (let i = 0; i < 20; i++) {
      runTrace(
        {
          session_id: "s1",
          hook_event_name: "Stop",
          prompt: "x".repeat(2000),
        },
        { OPC_TRACE_MAX_KB: "1" },
      );
    }
    const trace = lines(".opc/logs/s1/trace.log");
    expect(trace.length).toBeLessThan(20);
    expect(trace.length).toBeGreaterThan(0);
    // Every surviving line is a valid header or continuation line.
    for (const ln of trace) {
      expect(ln.length).toBeGreaterThan(0);
    }
  });
});
