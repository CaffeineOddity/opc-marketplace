import type { MemoryStore } from "@opc/memory-store";

export interface ReindexWorkerOptions {
  store: MemoryStore;
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
  private readonly debounceMs: number;
  private readonly hardFlushTimeoutMs: number;
  private readonly dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private pending: FlushState | null = null;
  private lastIndexedCount = 0;
  private broken = false;

  constructor(opts: ReindexWorkerOptions) {
    this.store = opts.store;
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
    return { indexed: r.indexed, durationMs: r.durationMs };
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.startFlushIfNeeded();
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
    } catch {
      this.broken = true;
      // Per spec: reindex failure must not surface to caller of write.
    } finally {
      this.flushing = null;
      target?.resolve();
    }
  }
}
