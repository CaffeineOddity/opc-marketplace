export type MergeStatus = "clean" | "fast_forward" | "auto_merged" | "conflict";

export interface Hunk {
  op: "add" | "remove" | "context";
  lines: string[];
}

export interface Diff3Result {
  status: MergeStatus;
  merged?: string;
  hunks: Hunk[];
  overlap: boolean;
}

export function diff3(base: string, ours: string, theirs: string): Diff3Result {
  if (ours === theirs) {
    return { status: "fast_forward", merged: ours, hunks: [], overlap: false };
  }
  if (base === theirs) {
    return { status: "fast_forward", merged: ours, hunks: hunksOf(base, ours), overlap: false };
  }
  if (base === ours) {
    return {
      status: "fast_forward",
      merged: theirs,
      hunks: hunksOf(base, theirs),
      overlap: false,
    };
  }
  const baseLines = base.split("\n");
  const oursLines = ours.split("\n");
  const theirsLines = theirs.split("\n");

  const oursChanges = changedRegions(baseLines, oursLines);
  const theirsChanges = changedRegions(baseLines, theirsLines);
  const overlap = regionsOverlap(oursChanges, theirsChanges);

  if (overlap) {
    const hunks = unifiedHunks(baseLines, oursLines).concat(unifiedHunks(baseLines, theirsLines));
    return { status: "conflict", hunks, overlap: true };
  }

  const merged = applyDisjoint(baseLines, oursLines, theirsLines, oursChanges, theirsChanges);
  return {
    status: "auto_merged",
    merged,
    hunks: unifiedHunks(base, merged),
    overlap: false,
  };
}

interface Region {
  baseStart: number;
  baseEnd: number;
  replaceLines: string[];
}

function changedRegions(base: string[], target: string[]): Region[] {
  const ops = lcsDiff(base, target);
  const regions: Region[] = [];
  let i = 0;
  while (i < ops.length) {
    const cur = ops[i];
    if (!cur || cur.kind === "equal") {
      i += 1;
      continue;
    }
    const start = i;
    while (i < ops.length) {
      const o = ops[i];
      if (!o || o.kind === "equal") break;
      i += 1;
    }
    const slice = ops.slice(start, i);
    const baseStart = slice.find((o) => o.kind === "remove")?.baseIndex ?? findInsertionBase(slice);
    const removes = slice.filter((o) => o.kind === "remove");
    const lastRemove = removes[removes.length - 1];
    const baseEnd = lastRemove ? lastRemove.baseIndex + 1 : baseStart;
    const replaceLines = slice
      .filter((o) => o.kind === "add")
      .map((o) => target[o.targetIndex] ?? "");
    regions.push({ baseStart, baseEnd, replaceLines });
  }
  return regions;
}

function findInsertionBase(
  slice: { baseIndex: number; targetIndex: number; kind: string }[],
): number {
  for (const o of slice) if (o.baseIndex >= 0) return o.baseIndex;
  return 0;
}

function regionsOverlap(a: Region[], b: Region[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x.baseStart < y.baseEnd && y.baseStart < x.baseEnd) return true;
      if (x.baseStart === y.baseStart && x.baseEnd === y.baseEnd) {
        if (JSON.stringify(x.replaceLines) !== JSON.stringify(y.replaceLines)) return true;
      }
    }
  }
  return false;
}

function applyDisjoint(
  base: string[],
  _ours: string[],
  _theirs: string[],
  oursR: Region[],
  theirsR: Region[],
): string {
  const all = [...oursR, ...theirsR].sort((a, b) => a.baseStart - b.baseStart);
  const out: string[] = [];
  let cursor = 0;
  for (const r of all) {
    while (cursor < r.baseStart) {
      out.push(base[cursor] ?? "");
      cursor += 1;
    }
    out.push(...r.replaceLines);
    cursor = r.baseEnd;
  }
  while (cursor < base.length) {
    out.push(base[cursor] ?? "");
    cursor += 1;
  }
  return out.join("\n");
}

type Op =
  | { kind: "equal"; baseIndex: number; targetIndex: number }
  | { kind: "remove"; baseIndex: number; targetIndex: -1 }
  | { kind: "add"; baseIndex: -1; targetIndex: number };

function lcsDiff(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const get = (row: number, col: number): number => dp[row]?.[col] ?? 0;
  const set = (row: number, col: number, v: number): void => {
    const r = dp[row];
    if (r) r[col] = v;
  };
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const eq = a[i] === b[j];
      set(i, j, eq ? get(i + 1, j + 1) + 1 : Math.max(get(i + 1, j), get(i, j + 1)));
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "equal", baseIndex: i, targetIndex: j });
      i += 1;
      j += 1;
    } else if (get(i + 1, j) >= get(i, j + 1)) {
      ops.push({ kind: "remove", baseIndex: i, targetIndex: -1 });
      i += 1;
    } else {
      ops.push({ kind: "add", baseIndex: -1, targetIndex: j });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: "remove", baseIndex: i, targetIndex: -1 });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: "add", baseIndex: -1, targetIndex: j });
    j += 1;
  }
  return ops;
}

function unifiedHunks(base: string | string[], target: string | string[]): Hunk[] {
  const a = typeof base === "string" ? base.split("\n") : base;
  const b = typeof target === "string" ? target.split("\n") : target;
  const ops = lcsDiff(a, b);
  const out: Hunk[] = [];
  let buf: Hunk | null = null;
  const flush = (): void => {
    if (buf) {
      out.push(buf);
      buf = null;
    }
  };
  for (const op of ops) {
    if (op.kind === "equal") {
      flush();
      out.push({ op: "context", lines: [a[op.baseIndex] ?? ""] });
    } else if (op.kind === "remove") {
      if (!buf || buf.op !== "remove") {
        flush();
        buf = { op: "remove", lines: [] };
      }
      buf.lines.push(a[op.baseIndex] ?? "");
    } else {
      if (!buf || buf.op !== "add") {
        flush();
        buf = { op: "add", lines: [] };
      }
      buf.lines.push(b[op.targetIndex] ?? "");
    }
  }
  flush();
  return out;
}

function hunksOf(base: string, target: string): Hunk[] {
  return unifiedHunks(base, target);
}
