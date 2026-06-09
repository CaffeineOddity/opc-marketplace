import type { Address } from "@opc/memory-store";

export interface BaseVersionResolver {
  /** Retrieve the body content at a given (addr, version), or null if unavailable. */
  resolve(addr: Address, version: number): Promise<string | null>;
  /** Optional: record a write so subsequent diff-and-merge can fetch the snapshot. */
  record?(addr: Address, version: number, body: string): void;
}

/**
 * In-memory snapshot resolver: keeps last N versions per (unit/section/sub).
 * Sufficient for same-session sub-pipeline insert/resume scenarios.
 * Git-based historical retrieval is an optional later layer (see core-tools § 2.10).
 */
export class MemoryBaseVersionResolver implements BaseVersionResolver {
  private readonly snapshots = new Map<string, Map<number, string>>();
  private readonly maxPerKey: number;

  constructor(maxPerKey = 16) {
    this.maxPerKey = maxPerKey;
  }

  resolve(addr: Address, version: number): Promise<string | null> {
    const key = keyOf(addr);
    const versions = this.snapshots.get(key);
    if (!versions) return Promise.resolve(null);
    return Promise.resolve(versions.get(version) ?? null);
  }

  record(addr: Address, version: number, body: string): void {
    const key = keyOf(addr);
    let versions = this.snapshots.get(key);
    if (!versions) {
      versions = new Map();
      this.snapshots.set(key, versions);
    }
    versions.set(version, body);
    if (versions.size > this.maxPerKey) {
      const oldest = Math.min(...versions.keys());
      versions.delete(oldest);
    }
  }
}

function keyOf(addr: Address): string {
  return `${addr.unit}/${addr.section}/${addr.sub}`;
}
