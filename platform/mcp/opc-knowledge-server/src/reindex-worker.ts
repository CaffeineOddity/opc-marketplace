import { watch } from "node:fs";
import { mkdir, stat, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MemoryStore } from "@opc/memory-store";
import { indexPath } from "@opc/memory-store";

const BROKEN_MARKER = ".opc-knowledge.idx.broken";
const QUEUE_OVERLOAD_THRESHOLD = 50;

export function brokenMarkerPath(root: string): string {
  return join(root, BROKEN_MARKER);
}

export async function brokenMarkerExists(root: string): Promise<boolean> {
  try {
    await stat(brokenMarkerPath(root));
    return true;
  } catch {
    return false;
  }
}

export interface ReindexWorkerOptions {
  store: MemoryStore;
  /** Root directory for the knowledge store (needed for broken marker path). */
  root: string;
  /** Debounce window in ms. Default 2000 per spec § 2.9. */
  debounceMs?: number;
  /** Hard flush deadline in ms. Default 5000 per spec § 2.9. */
  hardFlushTimeoutMs?: number;
}

interface FlushState {
  promise: Promise<void>;
  resolve: () => void;
}

export class ReindexWorker {
  private readonly store: MemoryStore;
  private readonly root: string;
  private readonly debounceMs: number;
  private readonly hardFlushTimeoutMs: number;
  private readonly dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private pending: FlushState | null = null;
  private lastIndexedCount = 0;
  private broken = false;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(opts: ReindexWorkerOptions) {
    this.store = opts.store;
    this.root = opts.root;
    this.debounceMs = opts.debounceMs ?? 2000;
    this.hardFlushTimeoutMs = opts.hardFlushTimeoutMs ?? 5000;
  }

  enqueue(path: string): void {
    this.dirty.add(path);
    this.scheduleDebounce();
  }

  pendingCount(): number {
    return this.dirty.size;
  }

  isBroken(): boolean {
    return this.broken;
  }

  /**
   * Synchronously force a reindex pass to completion (with timeout).
   * Called by node/phase boundaries and consistency:"fresh" search.
   */
  async hardFlush(): Promise<{ indexed: number; timedOut: boolean }> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const flushPromise = this.startFlushIfNeeded();
    if (!flushPromise) {
      return { indexed: this.lastIndexedCount, timedOut: false };
    }
    let timedOut = false;
    const timeout = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), this.hardFlushTimeoutMs);
    });
    const result = await Promise.race([flushPromise.then(() => "ok" as const), timeout]);
    if (result === "timeout") timedOut = true;
    return { indexed: this.lastIndexedCount, timedOut };
  }

  /** Reindex regardless of dirty state. */
  async fullReindex(): Promise<{ indexed: number; durationMs: number }> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.dirty.clear();
    const r = await this.store.reindex();
    this.lastIndexedCount = r.indexed;
    this.broken = false;
    await this.clearBrokenMarker();
    return { indexed: r.indexed, durationMs: r.durationMs };
  }

  async shutdown(): Promise<void> {
    this.stopFileWatcher();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.startFlushIfNeeded();
  }

  /**
   * K2: Watch knowledge root for .md file changes (cross-process flush signals).
   * When a .md file is created or modified outside the MCP API, trigger reindex.
   */
  startFileWatcher(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(
        this.root,
        { recursive: true },
        (_event, filename) => {
          if (filename && filename.endsWith(".md")) {
            this.enqueue(join(this.root, filename));
          }
        },
      );
      this.watcher.on("error", () => {
        // watcher error is non-fatal; reindex still works via API calls
      });
    } catch {
      // fs.watch may not support recursive on all platforms; degrade gracefully
    }
  }

  stopFileWatcher(): void {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        // best-effort
      }
      this.watcher = null;
    }
  }

  isQueueOverloaded(): boolean {
    return this.dirty.size > QUEUE_OVERLOAD_THRESHOLD;
  }

  get brokenMarkerPath(): string {
    return brokenMarkerPath(this.root);
  }

  private async writeBrokenMarker(): Promise<void> {
    const path = this.brokenMarkerPath;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        failed_at: new Date().toISOString(),
        reason: "reindex_failure",
      }),
      "utf8",
    );
  }

  private async clearBrokenMarker(): Promise<void> {
    try {
      await unlink(this.brokenMarkerPath);
    } catch {
      // marker may not exist — that's fine
    }
  }

  private scheduleDebounce(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.startFlushIfNeeded();
    }, this.debounceMs);
  }

  private startFlushIfNeeded(): Promise<void> | null {
    if (this.dirty.size === 0 && !this.flushing) return null;
    if (this.flushing) return this.flushing;
    if (!this.pending) {
      let resolveFn!: () => void;
      const p = new Promise<void>((resolve) => {
        resolveFn = resolve;
      });
      this.pending = { promise: p, resolve: resolveFn };
    }
    this.flushing = this.pending.promise;
    void this.runFlush();
    return this.flushing;
  }

  private async runFlush(): Promise<void> {
    const target = this.pending;
    this.pending = null;
    this.dirty.clear();
    try {
      const r = await this.store.reindex();
      this.lastIndexedCount = r.indexed;
      this.broken = false;
      await this.clearBrokenMarker();
    } catch {
      this.broken = true;
      try {
        await this.writeBrokenMarker();
      } catch {
        // marker write failure is non-fatal; broken flag is already set
      }
    } finally {
      this.flushing = null;
      target?.resolve();
    }
  }
}
