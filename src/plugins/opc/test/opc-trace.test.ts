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
  // Re-read via spawnSync cat to avoid importing fs sync helpers; the test only
  // needs the textual content.
  const r = spawnSync("cat", [join(project, rel)], { encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

function lines(rel: string): string[] {
  const t = readLog(rel);
  return t.length === 0 ? [] : t.split("\n");
}

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
    const obj = JSON.parse(ev[0]);
    expect(obj.event).toBe("UserPromptSubmit");
    expect(obj.prompt).toBe("hello world");
    expect(typeof obj.ts).toBe("number");
  });

  it("records PreToolUse + PostToolUse with tool_name and full input/response", () => {
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
    // Newest first → PostToolUse on top, then PreToolUse.
    expect(trace).toHaveLength(2);
    const post = JSON.parse(trace[0]);
    const pre = JSON.parse(trace[1]);
    expect(post.event).toBe("PostToolUse");
    expect(post.tool_name).toBe("Bash");
    expect(post.tool_response).toContain("file1");
    expect(pre.event).toBe("PreToolUse");
    expect(pre.tool_name).toBe("Bash");
    expect(pre.tool_input).toContain("ls -la");
  });

  it("prepends newest-first (latest turn is line 1)", () => {
    runTrace({ session_id: "s1", hook_event_name: "Stop" });
    runTrace({ session_id: "s1", hook_event_name: "Stop" });
    const trace = lines(".opc/logs/s1/trace.log");
    expect(trace).toHaveLength(2);
    // Second call (later ts) must be line 1.
    expect(JSON.parse(trace[0]).ts).toBeGreaterThanOrEqual(
      JSON.parse(trace[1]).ts,
    );
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
    // The dots are reduced to literal "_"-joined segments, so no actual path
    // traversal escapes .opc/logs/. Verify by listing: the only subdirs created
    // must be inside .opc/logs/ (find -mindepth 1 -maxdepth 1 of logs).
    const r = spawnSync("find", [join(project, ".opc", "logs"), "-mindepth", "1", "-maxdepth", "1"], {
      encoding: "utf8",
    });
    const found = (r.stdout ?? "").trim();
    expect(found).not.toBe("");
    // Exactly one sanitized bucket dir, single level under logs.
    const entries = found.split("\n");
    expect(entries).toHaveLength(1);
    // No slash-separated traversal — the segment has no path separators at all.
    expect(entries[0]).toMatch(/\.opc\/logs\/[^/]+$/);
    // And it is NOT literally ".." or "etc" at the project root.
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
    const obj = JSON.parse(lines(".opc/logs/s1/trace.log")[0]);
    expect(obj.tool_input.length).toBeLessThan(huge.length);
    expect(obj.tool_input).toContain("[truncated:");
  });

  it("keeps separate per-event files alongside the unified trace.log", () => {
    runTrace({ session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "a" });
    runTrace({ session_id: "s1", hook_event_name: "PreToolUse", tool_name: "T", tool_input: "x" });
    runTrace({ session_id: "s1", hook_event_name: "Stop" });
    expect(lines(".opc/logs/s1/UserPromptSubmit.log")).toHaveLength(1);
    expect(lines(".opc/logs/s1/PreToolUse.log")).toHaveLength(1);
    expect(lines(".opc/logs/s1/Stop.log")).toHaveLength(1);
    expect(lines(".opc/logs/s1/trace.log")).toHaveLength(3);
  });

  it("rotates when a log exceeds OPC_TRACE_MAX_KB (keeps newest half)", () => {
    // Force tiny cap so rotation triggers after a few writes.
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
    // Should have been rotated down; definitely fewer than 20 lines.
    expect(trace.length).toBeLessThan(20);
    expect(trace.length).toBeGreaterThan(0);
    // Newest-first ordering preserved after rotation: ts non-increasing.
    for (let i = 1; i < trace.length; i++) {
      expect(JSON.parse(trace[i - 1]).ts).toBeGreaterThanOrEqual(
        JSON.parse(trace[i]).ts,
      );
    }
  });
});
