import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MemoryStore,
  PACKAGE_NAME,
  VersionConflictError,
  NotFoundError,
  parseFrontmatter,
  serializeFrontmatter,
  loadIndex,
  indexPath,
} from "./index.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memstore-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("@opc/memory-store skeleton", () => {
  it("exposes its package name", () => {
    expect(PACKAGE_NAME).toBe("@opc/memory-store");
  });
});

describe("frontmatter parser", () => {
  it("round-trips known fields", () => {
    const raw = `---\nversion: 3\nupdated_at: "2026-06-10T00:00:00Z"\npipeline_id: pipeline-001\nnode: api-design\n---\n\nhello world\n`;
    const p = parseFrontmatter(raw);
    expect(p.frontmatter.version).toBe(3);
    expect(p.frontmatter.pipeline_id).toBe("pipeline-001");
    expect(p.body).toBe("hello world\n");
    const s = serializeFrontmatter(p);
    const re = parseFrontmatter(s);
    expect(re.frontmatter).toMatchObject(p.frontmatter);
    expect(re.body).toBe(p.body);
  });

  it("rejects frontmatter without version", () => {
    expect(() => parseFrontmatter(`---\nupdated_at: "x"\n---\n`)).toThrow(
      /version must be a number/,
    );
  });

  it("rejects missing closing delimiter", () => {
    expect(() => parseFrontmatter(`---\nversion: 1\n`)).toThrow(/closing/);
  });
});

describe("MemoryStore basic CRUD", () => {
  it("creates a new file with version 1", async () => {
    const s = new MemoryStore({ root, now: () => new Date("2026-06-10T00:00:00Z") });
    const r = await s.write(
      { unit: "user-auth", section: "login", sub: "api" },
      { body: "body content", pipeline_id: "p1", node: "n1" },
    );
    expect(r.version).toBe(1);
    expect(r.merge_status).toBe("clean");
    const back = await s.read({ unit: "user-auth", section: "login", sub: "api" });
    expect(back.frontmatter.version).toBe(1);
    expect(back.frontmatter.updated_at).toBe("2026-06-10T00:00:00.000Z");
    expect(back.body).toBe("body content");
  });

  it("increments version on subsequent writes", async () => {
    const s = new MemoryStore({ root });
    const addr = { unit: "u", section: "s", sub: "a" };
    await s.write(addr, { body: "v1" });
    const r2 = await s.write(addr, { body: "v2", base_version: 1 });
    expect(r2.version).toBe(2);
    const back = await s.read(addr);
    expect(back.frontmatter.version).toBe(2);
    expect(back.body).toBe("v2");
  });

  it("throws NotFoundError on read of missing file", async () => {
    const s = new MemoryStore({ root });
    await expect(s.read({ unit: "x", section: "y", sub: "z" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("delete removes the file and returns true; false when absent", async () => {
    const s = new MemoryStore({ root });
    const addr = { unit: "u", section: "s", sub: "a" };
    await s.write(addr, { body: "x" });
    expect(await s.delete(addr)).toBe(true);
    expect(await s.delete(addr)).toBe(false);
  });

  it("exists reports presence", async () => {
    const s = new MemoryStore({ root });
    const addr = { unit: "u", section: "s", sub: "a" };
    expect(await s.exists(addr)).toBe(false);
    await s.write(addr, { body: "x" });
    expect(await s.exists(addr)).toBe(true);
  });
});

describe("MemoryStore atomic write", () => {
  it("does not leave a .tmp file behind on success", async () => {
    const s = new MemoryStore({ root });
    await s.write({ unit: "u", section: "s", sub: "a" }, { body: "x" });
    const files = await readDirRecursive(root);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("written file has correct content (target only contains final bytes)", async () => {
    const s = new MemoryStore({ root, now: () => new Date("2026-06-10T00:00:00Z") });
    await s.write({ unit: "u", section: "s", sub: "a" }, { body: "hello" });
    const raw = await readFile(join(root, "u", "s", "a.md"), "utf8");
    expect(raw.startsWith("---\nversion: 1\n")).toBe(true);
    expect(raw.endsWith("hello")).toBe(true);
  });
});

describe("MemoryStore version conflict", () => {
  it("rejects write when base_version mismatches current", async () => {
    const s = new MemoryStore({ root });
    const addr = { unit: "u", section: "s", sub: "a" };
    await s.write(addr, { body: "v1" });
    await s.write(addr, { body: "v2", base_version: 1 });
    await expect(s.write(addr, { body: "stale", base_version: 1 })).rejects.toBeInstanceOf(
      VersionConflictError,
    );
  });

  it("accepts write without base_version (legacy / first-write path)", async () => {
    const s = new MemoryStore({ root });
    const addr = { unit: "u", section: "s", sub: "a" };
    await s.write(addr, { body: "v1" });
    const r = await s.write(addr, { body: "v2" });
    expect(r.version).toBe(2);
  });
});

describe("MemoryStore concurrent writes", () => {
  it("serializes writes via file lock so versions are linear", async () => {
    const s = new MemoryStore({ root });
    const addr = { unit: "u", section: "s", sub: "a" };
    await s.write(addr, { body: "seed" });
    const writes = Array.from({ length: 10 }).map((_, i) => s.write(addr, { body: `b${i}` }));
    const results = await Promise.all(writes);
    const versions = results.map((r) => r.version).sort((a, b) => a - b);
    expect(versions).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const back = await s.read(addr);
    expect(back.frontmatter.version).toBe(11);
  });
});

describe("MemoryStore list + reindex", () => {
  it("lists all addresses sorted; reindex rebuilds the .idx file", async () => {
    const s = new MemoryStore({ root });
    await s.write({ unit: "a", section: "s1", sub: "x" }, { body: "1" });
    await s.write({ unit: "b", section: "s2", sub: "y" }, { body: "2" });
    await s.write({ unit: "a", section: "s1", sub: "z" }, { body: "3" });

    const all = await s.list();
    expect(all).toEqual([
      { unit: "a", section: "s1", sub: "x" },
      { unit: "a", section: "s1", sub: "z" },
      { unit: "b", section: "s2", sub: "y" },
    ]);

    const filtered = await s.list({ unit: "a" });
    expect(filtered).toHaveLength(2);

    const result = await s.reindex();
    expect(result.indexed).toBe(3);

    const idx = await loadIndex(indexPath(root));
    expect(idx.entries).toHaveLength(3);
    expect(idx.entries[0].unit).toBe("a");
    expect(idx.entries[0].version).toBe(1);
  });

  it("reindex skips files with corrupt frontmatter without throwing", async () => {
    const s = new MemoryStore({ root });
    await s.write({ unit: "good", section: "s", sub: "a" }, { body: "ok" });
    // Hand-craft a bad file
    const bad = join(root, "bad", "s", "a.md");
    await import("node:fs/promises").then((m) =>
      m
        .mkdir(join(root, "bad", "s"), { recursive: true })
        .then(() => m.writeFile(bad, "not a valid frontmatter file")),
    );
    const r = await s.reindex();
    expect(r.indexed).toBe(1);
  });
});

describe("MemoryStore index path", () => {
  it("writes index next to root", async () => {
    const s = new MemoryStore({ root });
    await s.write({ unit: "u", section: "s", sub: "a" }, { body: "x" });
    await s.reindex();
    const st = await stat(indexPath(root));
    expect(st.isFile()).toBe(true);
  });
});

async function readDirRecursive(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await readDirRecursive(p)));
    } else {
      out.push(p);
    }
  }
  return out;
}
