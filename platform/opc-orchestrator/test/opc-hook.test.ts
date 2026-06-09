import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const HOOK = resolve(HERE, "..", "bin", "opc-hook.sh");
const NOTICE_PREFIX = "OPC: 先调 mcp__opc-state__opc_flow_query()";

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "opc-hook-"));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

function runHook(env: Record<string, string>, message: string): RunResult {
  const result = spawnSync("bash", [HOOK], {
    env: {
      PATH: process.env.PATH ?? "",
      CLAUDE_USER_MESSAGE: message,
      CLAUDE_PROJECT_DIR: project,
      ...env,
    },
    encoding: "utf8",
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

async function writeFlow(
  sessionId: string,
  status: "in_progress" | "completed" | "aborted",
): Promise<void> {
  const dir = join(project, ".opc", "sessions", sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "flow-state.json"),
    JSON.stringify({ session_id: sessionId, status }, null, 2),
  );
}

describe("opc-hook.sh intensity matrix", () => {
  it("off — never injects", () => {
    const r = runHook({ OPC_HOOK_INTENSITY: "off" }, "implement auth flow");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("loud — always injects", () => {
    const r = runHook({ OPC_HOOK_INTENSITY: "loud" }, "hello");
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith(NOTICE_PREFIX)).toBe(true);
  });

  it("loud + slash prefix — silent (slash exempt overrides loud)", () => {
    const r = runHook({ OPC_HOOK_INTENSITY: "loud" }, "/opc-status");
    expect(r.stdout).toBe("");
  });

  it("quiet + no keyword + no active flow — silent (default)", () => {
    const r = runHook({}, "how are you today?");
    expect(r.stdout).toBe("");
  });

  it("quiet + EN keyword — injects (case-insensitive)", () => {
    const r = runHook({}, "Please IMPLEMENT the new endpoint");
    expect(r.stdout.startsWith(NOTICE_PREFIX)).toBe(true);
  });

  it("quiet + CN keyword — injects", () => {
    const r = runHook({}, "帮我修复登录的 bug");
    expect(r.stdout.startsWith(NOTICE_PREFIX)).toBe(true);
  });

  it("quiet + active in_progress flow — injects even without keyword", async () => {
    await writeFlow("sess-test", "in_progress");
    const r = runHook({}, "go on");
    expect(r.stdout.startsWith(NOTICE_PREFIX)).toBe(true);
  });

  it("quiet + only completed/aborted flows — silent", async () => {
    await writeFlow("sess-done", "completed");
    await writeFlow("sess-bad", "aborted");
    const r = runHook({}, "what next?");
    expect(r.stdout).toBe("");
  });

  it("quiet + slash prefix — silent even with keyword + active flow", async () => {
    await writeFlow("sess-active", "in_progress");
    const r = runHook({}, "/refactor everything");
    expect(r.stdout).toBe("");
  });

  it("quiet + OPC_HOOK_KEYWORDS adds custom triggers", () => {
    const r = runHook({ OPC_HOOK_KEYWORDS: "spike:scaffold" }, "let's scaffold the module");
    expect(r.stdout.startsWith(NOTICE_PREFIX)).toBe(true);
  });

  it("never errors on empty message", () => {
    const r = runHook({}, "");
    expect(r.status).toBe(0);
  });

  it("does not crash when project dir has no .opc/sessions", () => {
    const r = runHook({ OPC_HOOK_INTENSITY: "quiet" }, "casual chat");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});
