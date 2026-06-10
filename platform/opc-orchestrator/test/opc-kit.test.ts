import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";

const SCRIPTS_DIR = resolve(import.meta.dirname ?? __dirname, "../../../scripts");
const OPC_KIT = join(SCRIPTS_DIR, "opc-kit.mjs");

function kit(args: string): string {
  return execSync(`node ${OPC_KIT} ${args}`, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function kitFail(args: string): { stdout: string; stderr: string; status: number } {
  try {
    const out = kit(args);
    return { stdout: out, stderr: "", status: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      status: err.status ?? 1,
    };
  }
}

/** Set up a temp project dir with .claude/agents/ */
async function setupProject(): Promise<string> {
  const dir = join(tmpdir(), `opc-kit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(join(dir, ".claude", "agents"), { recursive: true });
  await mkdir(join(dir, ".opc"), { recursive: true });
  return dir;
}

describe("opc-kit CLI", () => {
  describe("help", () => {
    it("prints help with --help", () => {
      const out = kit("--help");
      expect(out).toContain("opc-kit v0.2.0");
      expect(out).toContain("install");
      expect(out).toContain("remove");
      expect(out).toContain("update");
      expect(out).toContain("list");
    });

    it("prints help with -h", () => {
      const out = kit("-h");
      expect(out).toContain("opc-kit v0.2.0");
    });
  });

  describe("error cases", () => {
    it("rejects unknown commands", () => {
      const { stderr, status } = kitFail("nope");
      expect(stderr).toContain("Unknown command");
      expect(status).toBe(2);
    });

    it("rejects install when .claude/ does not exist", async () => {
      const tmp = join(tmpdir(), `opc-kit-no-claude-${Date.now()}`);
      await mkdir(tmp, { recursive: true });
      try {
        execSync(`node ${OPC_KIT} install official-kits`, {
          cwd: tmp,
          encoding: "utf8",
          stdio: "pipe",
        });
        expect.unreachable("should have thrown");
      } catch (err: any) {
        const stderr = (err.stderr ?? "").toString();
        expect(stderr).toContain("no .claude/ folder found");
        expect(err.status).toBe(1);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it("list works without .claude/ (reads .opc/installed-kits.json)", async () => {
      const tmp = join(tmpdir(), `opc-kit-list-nocl-${Date.now()}`);
      await mkdir(tmp, { recursive: true });
      try {
        const out = execSync(`node ${OPC_KIT} list`, {
          cwd: tmp,
          encoding: "utf8",
          stdio: "pipe",
        });
        expect(out).toContain("No kits installed");
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it("rejects unknown kit name", () => {
      const { stderr, status } = kitFail("install nonexistent-kit-xyz123");
      expect(stderr).toContain("Kit not found");
      expect(status).toBe(1);
    });

    it("rejects missing kit name for install", () => {
      const { stderr, status } = kitFail("install");
      expect(stderr).toContain("missing kit name");
      expect(status).toBe(2);
    });

    it("rejects missing kit name for remove", () => {
      const { stderr, status } = kitFail("remove");
      expect(stderr).toContain("missing kit name");
      expect(status).toBe(2);
    });
  });

  describe("lifecycle in a project", () => {
    let projectDir: string;

    beforeAll(async () => {
      projectDir = await setupProject();
    });

    afterAll(async () => {
      await rm(projectDir, { recursive: true, force: true });
    });

    function kitInProject(args: string): string {
      return execSync(`node ${OPC_KIT} ${args}`, {
        cwd: projectDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    it("lists empty when no kits installed", () => {
      const out = kitInProject("list");
      expect(out).toContain("No kits installed");
    });

    it("installs a kit", () => {
      const out = kitInProject("install official-kits");
      expect(out).toContain("Kit installed");
      expect(out).toContain("official-kits");
      expect(out).toContain("Wrote .claude/agents/*.md");
      expect(out).toContain("Restart required");
    });

    it("lists installed kits after install", () => {
      const out = kitInProject("list");
      expect(out).toContain("official-kits");
      expect(out).toContain("agents");
      expect(out).toContain("installed");
    });

    it("writes agent files to .claude/agents/", async () => {
      const { readdir } = await import("node:fs/promises");
      const agents = await readdir(join(projectDir, ".claude", "agents"));
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.some((f) => f.endsWith(".md"))).toBe(true);
    });

    it("writes installed-kits.json", async () => {
      const raw = await readFile(join(projectDir, ".opc", "installed-kits.json"), "utf8");
      const manifest = JSON.parse(raw);
      expect(manifest.kits).toBeInstanceOf(Array);
      expect(manifest.kits.length).toBe(1);
      expect(manifest.kits[0].name).toBe("official-kits");
      expect(manifest.kits[0].agents.length).toBeGreaterThan(0);
    });

    it("updates a kit (reinstall)", () => {
      const out = kitInProject("update official-kits");
      expect(out).toContain("Kit updated");
      expect(out).toContain("official-kits");
    });

    it("removes a kit", () => {
      const out = kitInProject("remove official-kits");
      expect(out).toContain("Kit removed");
      expect(out).toContain("official-kits");
      expect(out).toContain("Deleted .claude/agents/*.md");
      expect(out).toContain("Restart required");
    });

    it("lists empty after remove", () => {
      const out = kitInProject("list");
      expect(out).toContain("No kits installed");
    });

    it("cleans up agent files after remove", async () => {
      const { readdir } = await import("node:fs/promises");
      const agents = await readdir(join(projectDir, ".claude", "agents"));
      // agents directory should be empty (no .md files from kits)
      const mdFiles = agents.filter((f) => f.endsWith(".md"));
      expect(mdFiles.length).toBe(0);
    });

    it("remove of non-installed kit is a no-op message", () => {
      const out = kitInProject("remove official-kits");
      expect(out).toContain("Kit not installed");
    });
  });

  describe("install with full kit name (opc/official-kits)", () => {
    let projectDir: string;

    beforeAll(async () => {
      projectDir = await setupProject();
    });

    afterAll(async () => {
      await rm(projectDir, { recursive: true, force: true });
    });

    it("resolves opc/official-kits name", () => {
      const out = execSync(`node ${OPC_KIT} install opc/official-kits`, {
        cwd: projectDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(out).toContain("Kit installed");
    });
  });

  describe("Restart required message", () => {
    let projectDir: string;

    beforeAll(async () => {
      projectDir = await setupProject();
    });

    afterAll(async () => {
      await rm(projectDir, { recursive: true, force: true });
    });

    it("prints restart warning on install", () => {
      const out = execSync(`node ${OPC_KIT} install official-kits`, {
        cwd: projectDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(out).toContain("Restart required");
      expect(out).toContain(".claude/agents/");
    });

    it("prints restart warning on remove", () => {
      const out = execSync(`node ${OPC_KIT} remove official-kits`, {
        cwd: projectDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(out).toContain("Restart required");
    });
  });
});
