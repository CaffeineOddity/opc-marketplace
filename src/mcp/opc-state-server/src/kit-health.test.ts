import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  INSTALLED_KITS_FILENAME,
  checkKitHealth,
  notLoadedAgents,
} from "./kit-health.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kit-health-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeKits(payload: unknown): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, INSTALLED_KITS_FILENAME), JSON.stringify(payload));
}

describe("checkKitHealth (A4)", () => {
  it("returns empty when installed-kits.json missing", async () => {
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings).toEqual([]);
    expect(r.suggested_actions).toEqual([]);
  });

  it("returns empty when file is malformed JSON", async () => {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, INSTALLED_KITS_FILENAME), "{ not json");
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings).toEqual([]);
  });

  it("returns empty when kits installed BEFORE session start", async () => {
    await writeKits({
      kits: [
        {
          name: "backend-pro",
          agents: ["backend-engineer"],
          mcp_servers: [],
          installed_at: "2026-06-09T12:00:00Z",
        },
      ],
    });
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings).toEqual([]);
  });

  it("emits KIT_PROBABLY_NOT_LOADED when kit installed AFTER session start", async () => {
    await writeKits({
      kits: [
        {
          name: "backend-pro",
          agents: ["backend-engineer", "api-designer"],
          mcp_servers: ["postgres"],
          installed_at: "2026-06-10T05:00:00Z",
        },
      ],
    });
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({
      level: "warning",
      code: "KIT_PROBABLY_NOT_LOADED",
      kit: "backend-pro",
      affected_agents: ["backend-engineer", "api-designer"],
      affected_mcp_servers: ["postgres"],
      installed_at: "2026-06-10T05:00:00Z",
      session_started_at: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings[0]?.remediation).toContain("Exit current `claude` session");
    expect(r.suggested_actions).toHaveLength(1);
    expect(r.suggested_actions[0]).toMatchObject({
      action: "restart_session",
      reason: "kit_not_loaded",
      details: { kit: "backend-pro" },
    });
  });

  it("treats installed_at == session_started_at as loaded (boundary)", async () => {
    await writeKits({
      kits: [
        {
          name: "edge-kit",
          agents: ["a"],
          installed_at: "2026-06-10T00:00:00Z",
        },
      ],
    });
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings).toEqual([]);
  });

  it("flags only the kits installed after session start in a mixed list", async () => {
    await writeKits({
      kits: [
        { name: "old", agents: ["a"], installed_at: "2026-06-09T00:00:00Z" },
        { name: "new", agents: ["b"], installed_at: "2026-06-10T05:00:00Z" },
      ],
    });
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.kit).toBe("new");
  });

  it("skips entries with malformed installed_at or missing name", async () => {
    await writeKits({
      kits: [
        { name: "good", agents: ["g"], installed_at: "2026-06-10T05:00:00Z" },
        { agents: ["bad-no-name"], installed_at: "2026-06-10T06:00:00Z" },
        { name: "bad-date", agents: ["x"], installed_at: "not-a-date" },
      ],
    });
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.kit).toBe("good");
  });

  it("treats missing agents/mcp_servers arrays as empty", async () => {
    await writeKits({
      kits: [{ name: "k", installed_at: "2026-06-10T05:00:00Z" }],
    });
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
    });
    expect(r.warnings[0]?.affected_agents).toEqual([]);
    expect(r.warnings[0]?.affected_mcp_servers).toEqual([]);
  });

  it("returns empty when sessionStartedAt is unparseable", async () => {
    await writeKits({
      kits: [{ name: "k", agents: ["a"], installed_at: "2026-06-10T05:00:00Z" }],
    });
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "garbage",
    });
    expect(r.warnings).toEqual([]);
  });

  it("supports injected readFileFn", async () => {
    const r = await checkKitHealth({
      root,
      sessionStartedAt: "2026-06-10T00:00:00Z",
      readFileFn: async (): Promise<string> =>
        JSON.stringify({
          kits: [
            { name: "injected", agents: ["x"], installed_at: "2026-06-10T05:00:00Z" },
          ],
        }),
    });
    expect(r.warnings[0]?.kit).toBe("injected");
  });
});

describe("notLoadedAgents", () => {
  it("unions agents across all warnings", () => {
    const set = notLoadedAgents({
      warnings: [
        {
          level: "warning",
          code: "KIT_PROBABLY_NOT_LOADED",
          kit: "a",
          affected_agents: ["x", "y"],
          affected_mcp_servers: [],
          remediation: "",
          installed_at: "",
          session_started_at: "",
        },
        {
          level: "warning",
          code: "KIT_PROBABLY_NOT_LOADED",
          kit: "b",
          affected_agents: ["y", "z"],
          affected_mcp_servers: [],
          remediation: "",
          installed_at: "",
          session_started_at: "",
        },
      ],
      suggested_actions: [],
    });
    expect(Array.from(set).sort()).toEqual(["x", "y", "z"]);
  });

  it("returns empty for empty warnings", () => {
    expect(notLoadedAgents({ warnings: [], suggested_actions: [] }).size).toBe(0);
  });
});
