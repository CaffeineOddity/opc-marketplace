import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SERVER_NAME,
  KnowledgeServer,
  loadRefs,
  saveRefs,
  addRefs,
  relatedUnits,
  refsPath,
  REFS_FILENAME,
  diff3,
  MemoryBaseVersionResolver,
} from "./index.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "knowledge-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("@opc/knowledge-server skeleton", () => {
  it("exposes server name", () => {
    expect(SERVER_NAME).toBe("opc-knowledge-server");
  });
});

describe("refs store", () => {
  it("returns empty when missing", async () => {
    expect(await loadRefs(root)).toEqual({});
  });

  it("round-trips with addRefs and deduplicates+sorts", async () => {
    await addRefs(root, "auth", ["db", "logging", "db"]);
    await addRefs(root, "auth", ["cache"]);
    const refs = await loadRefs(root);
    expect(refs.auth).toEqual(["cache", "db", "logging"]);
    const raw = await readFile(refsPath(root), "utf8");
    expect(raw).toContain('"_refs"');
    expect(REFS_FILENAME).toBe(".opc-knowledge.json");
  });

  it("saveRefs sorts keys + dedupes values", async () => {
    await saveRefs(root, { zeta: ["b", "a", "a"], alpha: ["c"] });
    const refs = await loadRefs(root);
    expect(Object.keys(refs)).toEqual(["alpha", "zeta"]);
    expect(refs.zeta).toEqual(["a", "b"]);
  });

  it("relatedUnits computes bidirectional related", () => {
    const refs = { auth: ["db", "logging"], billing: ["db"] };
    expect(relatedUnits(refs, ["auth"])).toEqual(["db", "logging"]);
    expect(relatedUnits(refs, ["db"])).toEqual(["auth", "billing"]);
  });

  it("loadRefs tolerates non-array _refs values", async () => {
    await writeFile(refsPath(root), JSON.stringify({ _refs: "bad" }), "utf8");
    expect(await loadRefs(root)).toEqual({});
    await writeFile(refsPath(root), JSON.stringify({ _refs: { a: [1, "x"] } }), "utf8");
    expect(await loadRefs(root)).toEqual({});
  });
});

describe("diff3 engine", () => {
  it("returns fast_forward when ours===theirs", () => {
    const r = diff3("a\nb", "a\nc", "a\nc");
    expect(r.status).toBe("fast_forward");
    expect(r.merged).toBe("a\nc");
  });

  it("returns fast_forward when only ours changed", () => {
    const r = diff3("a\nb", "a\nx", "a\nb");
    expect(r.status).toBe("fast_forward");
    expect(r.merged).toBe("a\nx");
  });

  it("returns fast_forward when only theirs changed", () => {
    const r = diff3("a\nb", "a\nb", "a\ny");
    expect(r.status).toBe("fast_forward");
    expect(r.merged).toBe("a\ny");
  });

  it("auto-merges disjoint changes", () => {
    const base = "L1\nL2\nL3\nL4\nL5";
    const ours = "OURS1\nL2\nL3\nL4\nL5";
    const theirs = "L1\nL2\nL3\nL4\nTHEIRS5";
    const r = diff3(base, ours, theirs);
    expect(r.status).toBe("auto_merged");
    expect(r.merged).toBe("OURS1\nL2\nL3\nL4\nTHEIRS5");
    expect(r.overlap).toBe(false);
  });

  it("conflicts on overlapping changes", () => {
    const r = diff3("a\nb\nc", "a\nB1\nc", "a\nB2\nc");
    expect(r.status).toBe("conflict");
    expect(r.overlap).toBe(true);
    expect(r.hunks.length).toBeGreaterThan(0);
  });
});

describe("MemoryBaseVersionResolver", () => {
  it("records and resolves snapshots", async () => {
    const r = new MemoryBaseVersionResolver(3);
    const addr = { unit: "u", section: "s", sub: "x" };
    r.record(addr, 1, "v1");
    r.record(addr, 2, "v2");
    expect(await r.resolve(addr, 1)).toBe("v1");
    expect(await r.resolve(addr, 99)).toBeNull();
  });

  it("evicts oldest beyond maxPerKey", async () => {
    const r = new MemoryBaseVersionResolver(2);
    const addr = { unit: "u", section: "s", sub: "x" };
    r.record(addr, 1, "v1");
    r.record(addr, 2, "v2");
    r.record(addr, 3, "v3");
    expect(await r.resolve(addr, 1)).toBeNull();
    expect(await r.resolve(addr, 2)).toBe("v2");
    expect(await r.resolve(addr, 3)).toBe("v3");
  });
});

describe("KnowledgeServer.open", () => {
  it("creates unit dirs and returns empty tree for new units", async () => {
    const ks = new KnowledgeServer({ root });
    const res = await ks.open({ units: ["auth"] });
    expect(res.units.auth).toEqual({});
    expect(res.related).toEqual([]);
  });

  it("returns related units from refs", async () => {
    const ks = new KnowledgeServer({ root });
    await mkdir(root, { recursive: true });
    await addRefs(root, "auth", ["db"]);
    const res = await ks.open({ units: ["auth"] });
    expect(res.related).toContain("db");
  });

  it("scans existing files into the tree", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({ unit: "auth", section: "api", sub: "spec", content: "hello" });
    const res = await ks.open({ units: ["auth"] });
    expect(res.units.auth?.api?.spec?.version).toBe(1);
  });
});

describe("KnowledgeServer.write merge_status branches", () => {
  it("clean on new file", async () => {
    const ks = new KnowledgeServer({ root });
    const r = await ks.write({ unit: "u", section: "s", sub: "x", content: "v1" });
    expect(r.merge_status).toBe("clean");
    expect(r.version).toBe(1);
    expect(r.written).toBe(true);
    expect(r.reindex_enqueued).toBe(true);
  });

  it("clean on base_version === current.version", async () => {
    const ks = new KnowledgeServer({ root });
    const a = await ks.write({ unit: "u", section: "s", sub: "x", content: "v1" });
    const b = await ks.write({
      unit: "u",
      section: "s",
      sub: "x",
      content: "v2",
      base_version: a.version,
    });
    expect(b.merge_status).toBe("clean");
    expect(b.version).toBe(2);
  });

  it("auto_merged on disjoint concurrent edits", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({
      unit: "u",
      section: "s",
      sub: "x",
      content: "L1\nL2\nL3\nL4\nL5",
    });
    await ks.write({
      unit: "u",
      section: "s",
      sub: "x",
      base_version: 1,
      content: "L1\nL2\nL3\nL4\nTHEIRS5",
    });
    const r = await ks.write({
      unit: "u",
      section: "s",
      sub: "x",
      base_version: 1,
      content: "OURS1\nL2\nL3\nL4\nL5",
    });
    expect(r.merge_status).toBe("auto_merged");
    expect(r.written).toBe(true);
    expect(r.version).toBe(3);
  });

  it("conflict on overlapping edits — no write, returns hunks + suggested actions", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({ unit: "u", section: "s", sub: "x", content: "a\nb\nc" });
    await ks.write({
      unit: "u",
      section: "s",
      sub: "x",
      base_version: 1,
      content: "a\nTHEIRS\nc",
    });
    const r = await ks.write({
      unit: "u",
      section: "s",
      sub: "x",
      base_version: 1,
      content: "a\nOURS\nc",
    });
    expect(r.merge_status).toBe("conflict");
    expect(r.written).toBe(false);
    expect(r.reindex_enqueued).toBe(false);
    expect(r.hunks?.length).toBeGreaterThan(0);
    expect(r.suggested_actions).toEqual(["accept_theirs", "keep_ours", "spawn_merge_node"]);
  });

  it("throws VersionConflictError when base_version > current.version", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({ unit: "u", section: "s", sub: "x", content: "v1" });
    await expect(
      ks.write({ unit: "u", section: "s", sub: "x", content: "v2", base_version: 99 }),
    ).rejects.toThrow(/version/i);
  });

  it("applies refs on write (self-ref filtered)", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({
      unit: "auth",
      section: "api",
      sub: "spec",
      content: "v1",
      refs: ["db", "auth"],
    });
    const refs = await loadRefs(root);
    expect(refs.auth).toEqual(["db"]);
  });
});

describe("KnowledgeServer.read modes", () => {
  const seed = async (ks: KnowledgeServer): Promise<void> => {
    await ks.write({ unit: "u", section: "api", sub: "spec", content: "hello world" });
    await ks.write({ unit: "u", section: "api", sub: "notes", content: "alpha bravo" });
    await ks.write({ unit: "u", section: "design", sub: "draft", content: "world peace" });
  };

  it("single — returns content/version/updated_at", async () => {
    const ks = new KnowledgeServer({ root });
    await seed(ks);
    const r = await ks.read({ mode: "single", unit: "u", section: "api", sub: "spec" });
    if (r.mode === "single") {
      expect(r.content).toBe("hello world");
      expect(r.version).toBe(1);
      expect(r.updated_at).toBeTruthy();
    }
  });

  it("single — returns nulls on not found", async () => {
    const ks = new KnowledgeServer({ root });
    const r = await ks.read({ mode: "single", unit: "u", section: "x", sub: "y" });
    if (r.mode === "single") {
      expect(r.content).toBeNull();
      expect(r.version).toBeNull();
    }
  });

  it("batch — enforces min_version flag", async () => {
    const ks = new KnowledgeServer({ root });
    await seed(ks);
    const r = await ks.read({
      mode: "batch",
      entries: [
        { unit: "u", section: "api", sub: "spec", min_version: 1 },
        { unit: "u", section: "api", sub: "spec", min_version: 2 },
        { unit: "u", section: "missing", sub: "missing" },
      ],
    });
    if (r.mode === "batch") {
      expect(r.entries[0]?.found).toBe(true);
      expect(r.entries[0]?.min_version_ok).toBe(true);
      expect(r.entries[1]?.min_version_ok).toBe(false);
      expect(r.entries[2]?.found).toBe(false);
      expect(r.entries[2]?.min_version_ok).toBe(true);
    }
  });

  it("list — lists sections and subs of a unit", async () => {
    const ks = new KnowledgeServer({ root });
    await seed(ks);
    const r = await ks.read({ mode: "list", unit: "u" });
    if (r.mode === "list") {
      expect(r.items).toContainEqual({ section: "api", sub: "notes" });
      expect(r.items).toContainEqual({ section: "api", sub: "spec" });
      expect(r.items).toContainEqual({ section: "design", sub: "draft" });
    }
  });

  it("list — filters by section", async () => {
    const ks = new KnowledgeServer({ root });
    await seed(ks);
    const r = await ks.read({ mode: "list", unit: "u", section: "api" });
    if (r.mode === "list") {
      expect(r.items.map((i) => i.sub).sort()).toEqual(["notes", "spec"]);
    }
  });

  it("search — finds via scan when no index", async () => {
    const ks = new KnowledgeServer({ root });
    await seed(ks);
    const r = await ks.read({ mode: "search", query: "world" });
    if (r.mode === "search") {
      expect(r.hits.length).toBeGreaterThanOrEqual(2);
      expect(r.fell_back).toBe(true);
    }
  });

  it("search — fresh consistency hard-flushes", async () => {
    const ks = new KnowledgeServer({ root, reindexDebounceMs: 10, hardFlushTimeoutMs: 2000 });
    await seed(ks);
    const r = await ks.read({ mode: "search", query: "alpha", consistency: "fresh" });
    if (r.mode === "search") {
      expect(r.consistency).toBe("fresh");
      expect(r.hits.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("diff — returns no hunks when not found", async () => {
    const ks = new KnowledgeServer({ root });
    const r = await ks.read({
      mode: "diff",
      unit: "u",
      section: "s",
      sub: "x",
      base_version: 1,
    });
    if (r.mode === "diff") {
      expect(r.current_version).toBeNull();
      expect(r.hunks).toEqual([]);
    }
  });

  it("diff — predicts conflict with candidate_content", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({ unit: "u", section: "s", sub: "x", content: "a\nb\nc" });
    await ks.write({
      unit: "u",
      section: "s",
      sub: "x",
      content: "a\nTHEIRS\nc",
      base_version: 1,
    });
    const r = await ks.read({
      mode: "diff",
      unit: "u",
      section: "s",
      sub: "x",
      base_version: 1,
      candidate_content: "a\nOURS\nc",
    });
    if (r.mode === "diff") {
      expect(r.predicted_merge_status).toBe("conflict");
      expect(r.overlap_with_candidate).toBe(true);
    }
  });
});

describe("KnowledgeServer.admin", () => {
  it("delete — rejects on version_mismatch", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({ unit: "u", section: "s", sub: "x", content: "v1" });
    const r = await ks.admin({
      action: "delete",
      unit: "u",
      section: "s",
      sub: "x",
      base_version: 99,
    });
    if (r.action === "delete") {
      expect(r.deleted).toBe(false);
      expect(r.reason).toBe("version_mismatch");
      expect(r.current_version).toBe(1);
    }
  });

  it("delete — returns not_found", async () => {
    const ks = new KnowledgeServer({ root });
    const r = await ks.admin({ action: "delete", unit: "u", section: "s", sub: "x" });
    if (r.action === "delete") {
      expect(r.deleted).toBe(false);
      expect(r.reason).toBe("not_found");
    }
  });

  it("delete — succeeds with matching base_version", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({ unit: "u", section: "s", sub: "x", content: "v1" });
    const r = await ks.admin({
      action: "delete",
      unit: "u",
      section: "s",
      sub: "x",
      base_version: 1,
    });
    if (r.action === "delete") {
      expect(r.deleted).toBe(true);
      expect(r.reindex_enqueued).toBe(true);
    }
    const read = await ks.read({ mode: "single", unit: "u", section: "s", sub: "x" });
    if (read.mode === "single") expect(read.content).toBeNull();
  });

  it("reindex full reports indexed count", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({ unit: "u", section: "s", sub: "a", content: "x" });
    await ks.write({ unit: "u", section: "s", sub: "b", content: "y" });
    const r = await ks.admin({ action: "reindex", mode: "full" });
    if (r.action === "reindex") {
      expect(r.indexed).toBeGreaterThanOrEqual(2);
      expect(r.mode).toBe("full");
    }
  });

  it("reindex incremental hard-flushes pending", async () => {
    const ks = new KnowledgeServer({ root, reindexDebounceMs: 5000 });
    await ks.write({ unit: "u", section: "s", sub: "a", content: "x" });
    const r = await ks.admin({ action: "reindex", mode: "incremental" });
    if (r.action === "reindex") {
      expect(r.mode).toBe("incremental");
    }
  });
});

describe("Reindex worker behavior", () => {
  it("hardFlush returns timedOut=false when nothing pending", async () => {
    const ks = new KnowledgeServer({ root });
    const r = await ks.worker.hardFlush();
    expect(r.timedOut).toBe(false);
  });

  it("debounced reindex runs after delay", async () => {
    const ks = new KnowledgeServer({ root, reindexDebounceMs: 30 });
    await ks.write({ unit: "u", section: "s", sub: "a", content: "x" });
    await new Promise((r) => setTimeout(r, 80));
    const r = await ks.worker.hardFlush();
    expect(r.timedOut).toBe(false);
  });

  it("search uses index (not scan) after a full reindex", async () => {
    const ks = new KnowledgeServer({ root });
    await ks.write({ unit: "u", section: "s", sub: "x", content: "indexable" });
    await ks.admin({ action: "reindex", mode: "full" });
    const r = await ks.read({ mode: "search", query: "indexable" });
    if (r.mode === "search") {
      expect(r.hits.length).toBeGreaterThanOrEqual(1);
      expect(r.fell_back).toBe(false);
    }
  });
});
