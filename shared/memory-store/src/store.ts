import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { atomicWrite, withFileLock } from "./atomic.js";
import { parse, serialize } from "./frontmatter.js";
import { buildIndex, indexPath, loadIndex, saveIndex } from "./index-store.js";
import type {
  Address,
  Frontmatter,
  IndexEntry,
  ReadResult,
  WriteInput,
  WriteResult,
} from "./types.js";
import { NotFoundError, VersionConflictError } from "./types.js";

export interface MemoryStoreOptions {
  /** Absolute path to the store root (e.g. ".opc/knowledge"). */
  root: string;
  /** Optional clock injected for deterministic tests. */
  now?: () => Date;
}

export class MemoryStore {
  readonly root: string;
  private readonly now: () => Date;

  constructor(opts: MemoryStoreOptions) {
    this.root = opts.root;
    this.now = opts.now ?? (() => new Date());
  }

  pathFor(addr: Address): string {
    return join(this.root, addr.unit, addr.section, `${addr.sub}.md`);
  }

  async exists(addr: Address): Promise<boolean> {
    try {
      await stat(this.pathFor(addr));
      return true;
    } catch {
      return false;
    }
  }

  async read(addr: Address): Promise<ReadResult> {
    const path = this.pathFor(addr);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (err) {
      if (isENOENT(err)) throw new NotFoundError(path);
      throw err;
    }
    const parsed = parse(raw);
    return { path, frontmatter: parsed.frontmatter, body: parsed.body };
  }

  async write(addr: Address, input: WriteInput): Promise<WriteResult> {
    const path = this.pathFor(addr);
    return withFileLock(path, async () => {
      let current: ReadResult | null = null;
      try {
        current = await this.read(addr);
      } catch (err) {
        if (!(err instanceof NotFoundError)) throw err;
      }

      const currentVersion = current?.frontmatter.version ?? 0;
      if (current && input.base_version !== undefined && input.base_version !== currentVersion) {
        throw new VersionConflictError(input.base_version, currentVersion);
      }

      const nextVersion = currentVersion + 1;
      const fm: Frontmatter = {
        version: nextVersion,
        updated_at: this.now().toISOString(),
      };
      if (input.pipeline_id !== undefined) fm.pipeline_id = input.pipeline_id;
      if (input.node !== undefined) fm.node = input.node;
      if (input.extra) {
        for (const [k, v] of Object.entries(input.extra)) {
          if (k === "version" || k === "updated_at") continue;
          fm[k] = v;
        }
      }

      const out = serialize({ frontmatter: fm, body: input.body });
      await atomicWrite(path, out);
      return { path, version: nextVersion, merge_status: "clean" };
    });
  }

  async delete(addr: Address): Promise<boolean> {
    const path = this.pathFor(addr);
    return withFileLock(path, async () => {
      try {
        await unlink(path);
        return true;
      } catch (err) {
        if (isENOENT(err)) return false;
        throw err;
      }
    });
  }

  async list(filter?: Partial<Address>): Promise<Address[]> {
    return walk(this.root, filter);
  }

  async reindex(): Promise<{ indexed: number; durationMs: number; path: string }> {
    const start = Date.now();
    const entries: IndexEntry[] = [];
    const addresses = await walk(this.root);
    for (const addr of addresses) {
      try {
        const r = await this.read(addr);
        const st = await stat(r.path);
        entries.push({
          unit: addr.unit,
          section: addr.section,
          sub: addr.sub,
          version: r.frontmatter.version,
          updated_at: r.frontmatter.updated_at,
          size: st.size,
        });
      } catch {
        // skip unreadable files (e.g., bad frontmatter); reindex must not fail entire run.
      }
    }
    const idx = buildIndex(entries);
    const path = indexPath(this.root);
    await saveIndex(path, idx);
    return { indexed: entries.length, durationMs: Date.now() - start, path };
  }

  async loadIndex(): Promise<IndexEntry[]> {
    const path = indexPath(this.root);
    try {
      const idx = await loadIndex(path);
      return idx.entries;
    } catch {
      return [];
    }
  }
}

async function walk(root: string, filter?: Partial<Address>): Promise<Address[]> {
  const out: Address[] = [];
  let units: string[];
  try {
    units = await readdir(root);
  } catch (err) {
    if (isENOENT(err)) return out;
    throw err;
  }
  for (const unit of units.sort()) {
    if (unit.startsWith(".")) continue;
    if (filter?.unit !== undefined && filter.unit !== unit) continue;
    const unitDir = join(root, unit);
    const unitStat = await safeStat(unitDir);
    if (!unitStat?.isDirectory()) continue;
    const sections = await readdir(unitDir);
    for (const section of sections.sort()) {
      if (filter?.section !== undefined && filter.section !== section) continue;
      const secDir = join(unitDir, section);
      const secStat = await safeStat(secDir);
      if (!secStat?.isDirectory()) continue;
      const files = await readdir(secDir);
      for (const file of files.sort()) {
        if (!file.endsWith(".md")) continue;
        const sub = file.slice(0, -3);
        if (filter?.sub !== undefined && filter.sub !== sub) continue;
        out.push({ unit, section, sub });
      }
    }
  }
  return out;
}

async function safeStat(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
