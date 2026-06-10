import { mkdir, readdir, rmdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Address, IndexEntry } from "@opc/memory-store";
import { indexPath, MemoryStore, NotFoundError, VersionConflictError } from "@opc/memory-store";

import { MemoryBaseVersionResolver, type BaseVersionResolver } from "./base-version.js";
import type { Diff3Result, Hunk, MergeStatus } from "./diff3.js";
import { diff3 } from "./diff3.js";
import { addRefs, loadRefs, relatedUnits, saveRefs } from "./refs.js";
import { brokenMarkerExists, brokenMarkerPath, ReindexWorker } from "./reindex-worker.js";

export interface KnowledgeServerOptions {
  root: string;
  now?: () => Date;
  reindexDebounceMs?: number;
  hardFlushTimeoutMs?: number;
  baseVersionResolver?: BaseVersionResolver;
}

export interface OpenRequest {
  units: string[];
}

export interface UnitTree {
  [section: string]: { [sub: string]: { version: number } };
}

export interface OpenResponse {
  units: Record<string, UnitTree>;
  related: string[];
}

export type ReadRequest =
  | { mode: "single"; unit: string; section: string; sub: string; version?: number }
  | {
      mode: "batch";
      entries: Array<{ unit: string; section: string; sub: string; min_version?: number }>;
    }
  | { mode: "list"; unit: string; section?: string; subsection?: string }
  | {
      mode: "search";
      query: string;
      unit?: string;
      consistency?: "eventual" | "fresh";
    }
  | {
      mode: "diff";
      unit: string;
      section: string;
      sub: string;
      base_version: number;
      candidate_content?: string;
    };

export type ReadResponse =
  | { mode: "single"; content: string | null; version: number | null; updated_at: string | null }
  | {
      mode: "batch";
      entries: Array<{
        unit: string;
        section: string;
        sub: string;
        content: string | null;
        version: number | null;
        updated_at: string | null;
        found: boolean;
        min_version_ok: boolean;
      }>;
    }
  | { mode: "list"; items: Array<{ section?: string; sub?: string; version?: number }> }
  | {
      mode: "search";
      hits: Array<{
        unit: string;
        section: string;
        sub: string;
        snippet: string;
        score: number;
        indexed_at?: string;
      }>;
      consistency: "eventual" | "fresh";
      fell_back: boolean;
    }
  | {
      mode: "diff";
      base_version: number;
      current_version: number | null;
      hunks: Hunk[];
      overlap_with_candidate?: boolean;
      predicted_merge_status?: MergeStatus;
    };

export interface WriteRequest {
  unit: string;
  section: string;
  sub: string;
  content: string;
  base_version?: number;
  metadata?: { pipeline_id?: string; node?: string };
  refs?: string[];
}

export interface WriteResponse {
  unit: string;
  section: string;
  sub: string;
  version: number;
  merge_status: MergeStatus;
  reindex_enqueued: boolean;
  hunks?: Hunk[];
  suggested_actions?: Array<"accept_theirs" | "keep_ours" | "spawn_merge_node">;
  written: boolean;
}

export type AdminRequest =
  | { action: "delete"; unit: string; section: string; sub: string; base_version?: number }
  | { action: "reindex"; mode?: "full" | "incremental" };

export type AdminResponse =
  | {
      action: "delete";
      deleted: boolean;
      reason?: "version_mismatch" | "not_found";
      current_version?: number;
      reindex_enqueued?: boolean;
    }
  | {
      action: "reindex";
      indexed: number;
      mode: "full" | "incremental";
      duration_ms: number;
    };

export class KnowledgeServer {
  readonly store: MemoryStore;
  readonly worker: ReindexWorker;
  readonly resolver: BaseVersionResolver;
  readonly root: string;

  constructor(opts: KnowledgeServerOptions) {
    this.root = opts.root;
    this.store = new MemoryStore({
      root: opts.root,
      ...(opts.now ? { now: opts.now } : {}),
    });
    this.worker = new ReindexWorker({
      store: this.store,
      root: this.root,
      ...(opts.reindexDebounceMs !== undefined ? { debounceMs: opts.reindexDebounceMs } : {}),
      ...(opts.hardFlushTimeoutMs !== undefined
        ? { hardFlushTimeoutMs: opts.hardFlushTimeoutMs }
        : {}),
    });
    this.resolver = opts.baseVersionResolver ?? new MemoryBaseVersionResolver();
  }

  /**
   * K1: Startup self-check — heal broken index and reindex stale entries.
   * Called once after server construction, before accepting requests.
   */
  async startupSelfCheck(): Promise<{ healed: boolean; reindexed: boolean; reason: string }> {
    const idxPath = indexPath(this.root);
    let idxStat: Awaited<ReturnType<typeof stat>> | null = null;
    try {
      idxStat = await stat(idxPath);
    } catch {
      // index doesn't exist yet — not an error, just first run
    }

    // If broken marker exists, force full reindex to heal
    if (await brokenMarkerExists(this.root)) {
      await this.worker.fullReindex();
      return { healed: true, reindexed: true, reason: "broken_index_healed" };
    }

    // If no index yet, build one
    if (!idxStat) {
      await this.worker.fullReindex();
      return { healed: false, reindexed: true, reason: "first_run" };
    }

    // Compare newest .md mtime vs index mtime
    const addresses = await this.store.list();
    let newestMdMs = 0;
    for (const addr of addresses) {
      try {
        const r = await this.store.read(addr);
        const st = await stat(r.path);
        if (st.mtimeMs > newestMdMs) newestMdMs = st.mtimeMs;
      } catch {
        // skip unreadable
      }
    }

    if (newestMdMs > idxStat.mtimeMs) {
      await this.worker.fullReindex();
      return { healed: false, reindexed: true, reason: "stale_index" };
    }

    return { healed: false, reindexed: false, reason: "index_fresh" };
  }

  async shutdown(): Promise<void> {
    await this.worker.shutdown();
  }

  async open(req: OpenRequest): Promise<OpenResponse> {
    await mkdir(this.root, { recursive: true });
    const units: Record<string, UnitTree> = {};
    for (const unit of req.units) {
      const unitDir = join(this.root, unit);
      await mkdir(unitDir, { recursive: true });
      units[unit] = await this.scanUnit(unit);
    }
    const refs = await loadRefs(this.root);
    const related = relatedUnits(refs, req.units);
    return { units, related };
  }

  async read(req: ReadRequest): Promise<ReadResponse> {
    if (req.mode === "single") return this.readSingle(req);
    if (req.mode === "batch") return this.readBatch(req);
    if (req.mode === "list") return this.readList(req);
    if (req.mode === "search") return this.readSearch(req);
    return this.readDiff(req);
  }

  async write(req: WriteRequest): Promise<WriteResponse> {
    const addr: Address = { unit: req.unit, section: req.section, sub: req.sub };
    let current: { version: number; body: string } | null = null;
    try {
      const r = await this.store.read(addr);
      current = { version: r.frontmatter.version, body: r.body };
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }

    if (!current) {
      const out = await this.store.write(addr, {
        body: req.content,
        ...(req.metadata?.pipeline_id !== undefined
          ? { pipeline_id: req.metadata.pipeline_id }
          : {}),
        ...(req.metadata?.node !== undefined ? { node: req.metadata.node } : {}),
      });
      this.resolver.record?.(addr, out.version, req.content);
      await this.applyRefs(req);
      this.worker.enqueue(out.path);
      return {
        ...addr,
        version: out.version,
        merge_status: "clean",
        reindex_enqueued: true,
        written: true,
      };
    }

    if (req.base_version === undefined || req.base_version === current.version) {
      const out = await this.store.write(addr, {
        body: req.content,
        base_version: current.version,
        ...(req.metadata?.pipeline_id !== undefined
          ? { pipeline_id: req.metadata.pipeline_id }
          : {}),
        ...(req.metadata?.node !== undefined ? { node: req.metadata.node } : {}),
      });
      this.resolver.record?.(addr, out.version, req.content);
      await this.applyRefs(req);
      this.worker.enqueue(out.path);
      return {
        ...addr,
        version: out.version,
        merge_status: "clean",
        reindex_enqueued: true,
        written: true,
      };
    }

    if (req.base_version > current.version) {
      throw new VersionConflictError(req.base_version, current.version);
    }

    const baseBody = await this.resolver.resolve(addr, req.base_version);
    const result: Diff3Result = baseBody
      ? diff3(baseBody, req.content, current.body)
      : twoWayConflict(req.content, current.body);

    if (result.status === "conflict") {
      return {
        ...addr,
        version: current.version,
        merge_status: "conflict",
        reindex_enqueued: false,
        hunks: result.hunks,
        suggested_actions: ["accept_theirs", "keep_ours", "spawn_merge_node"],
        written: false,
      };
    }

    const merged = result.merged ?? req.content;
    const out = await this.store.write(addr, {
      body: merged,
      base_version: current.version,
      ...(req.metadata?.pipeline_id !== undefined ? { pipeline_id: req.metadata.pipeline_id } : {}),
      ...(req.metadata?.node !== undefined ? { node: req.metadata.node } : {}),
    });
    this.resolver.record?.(addr, out.version, merged);
    await this.applyRefs(req);
    this.worker.enqueue(out.path);
    return {
      ...addr,
      version: out.version,
      merge_status: result.status,
      reindex_enqueued: true,
      hunks: result.hunks,
      written: true,
    };
  }

  async admin(req: AdminRequest): Promise<AdminResponse> {
    if (req.action === "delete") return this.adminDelete(req);
    return this.adminReindex(req);
  }

  // --- internals ---

  private async readSingle(
    req: Extract<ReadRequest, { mode: "single" }>,
  ): Promise<Extract<ReadResponse, { mode: "single" }>> {
    try {
      const r = await this.store.read({ unit: req.unit, section: req.section, sub: req.sub });
      if (req.version !== undefined && r.frontmatter.version !== req.version) {
        const base = await this.resolver.resolve(
          { unit: req.unit, section: req.section, sub: req.sub },
          req.version,
        );
        return {
          mode: "single",
          content: base,
          version: base ? req.version : null,
          updated_at: null,
        };
      }
      return {
        mode: "single",
        content: r.body,
        version: r.frontmatter.version,
        updated_at: r.frontmatter.updated_at,
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { mode: "single", content: null, version: null, updated_at: null };
      }
      throw err;
    }
  }

  private async readBatch(
    req: Extract<ReadRequest, { mode: "batch" }>,
  ): Promise<Extract<ReadResponse, { mode: "batch" }>> {
    const out: Extract<ReadResponse, { mode: "batch" }>["entries"] = [];
    for (const e of req.entries) {
      try {
        const r = await this.store.read({ unit: e.unit, section: e.section, sub: e.sub });
        const min_version_ok =
          e.min_version === undefined || r.frontmatter.version >= e.min_version;
        out.push({
          unit: e.unit,
          section: e.section,
          sub: e.sub,
          content: r.body,
          version: r.frontmatter.version,
          updated_at: r.frontmatter.updated_at,
          found: true,
          min_version_ok,
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          out.push({
            unit: e.unit,
            section: e.section,
            sub: e.sub,
            content: null,
            version: null,
            updated_at: null,
            found: false,
            min_version_ok: e.min_version === undefined,
          });
        } else {
          throw err;
        }
      }
    }
    return { mode: "batch", entries: out };
  }

  private async readList(
    req: Extract<ReadRequest, { mode: "list" }>,
  ): Promise<Extract<ReadResponse, { mode: "list" }>> {
    const all = await this.store.list({ unit: req.unit });
    let filtered = all;
    if (req.section !== undefined) {
      filtered = all.filter((a) => a.section === req.section);
      return {
        mode: "list",
        items: filtered.map((a) => ({ sub: a.sub })),
      };
    }
    if (req.subsection !== undefined) {
      filtered = all.filter((a) => a.sub === req.subsection);
      return {
        mode: "list",
        items: filtered.map((a) => ({ section: a.section, sub: a.sub })),
      };
    }
    const sections = new Map<string, Set<string>>();
    for (const a of filtered) {
      let s = sections.get(a.section);
      if (!s) {
        s = new Set<string>();
        sections.set(a.section, s);
      }
      s.add(a.sub);
    }
    const items: Array<{ section: string; sub: string }> = [];
    for (const [section, subs] of [...sections.entries()].sort()) {
      for (const sub of [...subs].sort()) items.push({ section, sub });
    }
    return { mode: "list", items };
  }

  private async readSearch(
    req: Extract<ReadRequest, { mode: "search" }>,
  ): Promise<Extract<ReadResponse, { mode: "search" }>> {
    const consistency = req.consistency ?? "eventual";
    let fellBack = false;
    if (consistency === "fresh") {
      const r = await this.worker.hardFlush();
      if (r.timedOut) fellBack = true;
    }
    const idxEntries: IndexEntry[] = await this.store.loadIndex();
    let hits: Extract<ReadResponse, { mode: "search" }>["hits"] = [];
    if (idxEntries.length > 0 && !this.worker.isBroken()) {
      hits = await this.searchViaIndex(idxEntries, req.query, req.unit);
    } else {
      fellBack = true;
      hits = await this.searchViaScan(req.query, req.unit);
    }
    return { mode: "search", hits, consistency, fell_back: fellBack };
  }

  private async readDiff(
    req: Extract<ReadRequest, { mode: "diff" }>,
  ): Promise<Extract<ReadResponse, { mode: "diff" }>> {
    const addr: Address = { unit: req.unit, section: req.section, sub: req.sub };
    let current: { version: number; body: string } | null = null;
    try {
      const r = await this.store.read(addr);
      current = { version: r.frontmatter.version, body: r.body };
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    if (!current) {
      return {
        mode: "diff",
        base_version: req.base_version,
        current_version: null,
        hunks: [],
        ...(req.candidate_content !== undefined
          ? { overlap_with_candidate: false, predicted_merge_status: "clean" as MergeStatus }
          : {}),
      };
    }
    const base = await this.resolver.resolve(addr, req.base_version);
    if (!base) {
      return {
        mode: "diff",
        base_version: req.base_version,
        current_version: current.version,
        hunks: [],
        ...(req.candidate_content !== undefined
          ? { overlap_with_candidate: true, predicted_merge_status: "conflict" as MergeStatus }
          : {}),
      };
    }
    if (req.candidate_content === undefined) {
      const d = diff3(base, base, current.body);
      return {
        mode: "diff",
        base_version: req.base_version,
        current_version: current.version,
        hunks: d.hunks,
      };
    }
    const d = diff3(base, req.candidate_content, current.body);
    return {
      mode: "diff",
      base_version: req.base_version,
      current_version: current.version,
      hunks: d.hunks,
      overlap_with_candidate: d.overlap,
      predicted_merge_status: d.status,
    };
  }

  private async adminDelete(
    req: Extract<AdminRequest, { action: "delete" }>,
  ): Promise<Extract<AdminResponse, { action: "delete" }>> {
    const addr: Address = { unit: req.unit, section: req.section, sub: req.sub };
    let current: number | null = null;
    try {
      const r = await this.store.read(addr);
      current = r.frontmatter.version;
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    if (current === null) {
      return { action: "delete", deleted: false, reason: "not_found" };
    }
    if (req.base_version !== undefined && req.base_version !== current) {
      return {
        action: "delete",
        deleted: false,
        reason: "version_mismatch",
        current_version: current,
      };
    }
    const path = this.store.pathFor(addr);
    const removed = await this.store.delete(addr);
    if (removed) {
      await pruneEmptyDirs(dirname(path), this.root);
      this.worker.enqueue(path);
    }
    return { action: "delete", deleted: removed, reindex_enqueued: removed };
  }

  private async adminReindex(
    req: Extract<AdminRequest, { action: "reindex" }>,
  ): Promise<Extract<AdminResponse, { action: "reindex" }>> {
    const mode = req.mode ?? "incremental";
    const start = Date.now();
    if (mode === "full") {
      const r = await this.worker.fullReindex();
      return { action: "reindex", indexed: r.indexed, mode: "full", duration_ms: r.durationMs };
    }
    const r = await this.worker.hardFlush();
    return {
      action: "reindex",
      indexed: r.indexed,
      mode: "incremental",
      duration_ms: Date.now() - start,
    };
  }

  private async scanUnit(unit: string): Promise<UnitTree> {
    const out: UnitTree = {};
    const addrs = await this.store.list({ unit });
    for (const a of addrs) {
      try {
        const r = await this.store.read(a);
        let sec = out[a.section];
        if (!sec) {
          sec = {};
          out[a.section] = sec;
        }
        sec[a.sub] = { version: r.frontmatter.version };
      } catch {
        // skip corrupt files
      }
    }
    return out;
  }

  private async searchViaIndex(
    entries: IndexEntry[],
    query: string,
    unit?: string,
  ): Promise<Extract<ReadResponse, { mode: "search" }>["hits"]> {
    const filtered = unit ? entries.filter((e) => e.unit === unit) : entries;
    const hits: Extract<ReadResponse, { mode: "search" }>["hits"] = [];
    const q = query.toLowerCase();
    for (const e of filtered) {
      try {
        const r = await this.store.read({ unit: e.unit, section: e.section, sub: e.sub });
        const idx = r.body.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        hits.push({
          unit: e.unit,
          section: e.section,
          sub: e.sub,
          snippet: snippetAround(r.body, idx, q.length),
          score: scoreOf(r.body, q),
          indexed_at: e.updated_at,
        });
      } catch {
        // skip
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  private async searchViaScan(
    query: string,
    unit?: string,
  ): Promise<Extract<ReadResponse, { mode: "search" }>["hits"]> {
    const addrs = await this.store.list(unit ? { unit } : undefined);
    const hits: Extract<ReadResponse, { mode: "search" }>["hits"] = [];
    const q = query.toLowerCase();
    for (const a of addrs) {
      try {
        const r = await this.store.read(a);
        const idx = r.body.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        hits.push({
          unit: a.unit,
          section: a.section,
          sub: a.sub,
          snippet: snippetAround(r.body, idx, q.length),
          score: scoreOf(r.body, q),
        });
      } catch {
        // skip
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  private async applyRefs(req: WriteRequest): Promise<void> {
    if (!req.refs || req.refs.length === 0) return;
    const filtered = req.refs.filter((u) => u !== req.unit);
    if (filtered.length === 0) {
      // still update so server reflects empty intentional clear? skip — refs are additive
      await saveRefs(this.root, await loadRefs(this.root));
      return;
    }
    await addRefs(this.root, req.unit, filtered);
  }
}

async function pruneEmptyDirs(dir: string, root: string): Promise<void> {
  let cur = dir;
  while (cur.startsWith(root) && cur !== root) {
    try {
      const entries = await readdir(cur);
      if (entries.length > 0) return;
      await rmdir(cur);
      cur = dirname(cur);
    } catch {
      return;
    }
  }
}

function twoWayConflict(ours: string, theirs: string): Diff3Result {
  if (ours === theirs) {
    return { status: "fast_forward", merged: ours, hunks: [], overlap: false };
  }
  return { status: "conflict", hunks: [], overlap: true };
}

function snippetAround(body: string, idx: number, qLen: number): string {
  const start = Math.max(0, idx - 40);
  const end = Math.min(body.length, idx + qLen + 40);
  return body.slice(start, end);
}

function scoreOf(body: string, q: string): number {
  let count = 0;
  let i = 0;
  const lower = body.toLowerCase();
  while ((i = lower.indexOf(q, i)) !== -1) {
    count += 1;
    i += q.length;
  }
  return count;
}

// Re-export for caller convenience
export { stat };
