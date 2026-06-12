import type { NodeDefinition, NodeMode } from "./state-json.js";

export class NodeResolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeResolverError";
  }
}

export interface ResolvedNode {
  name: string;
  agent: string;
  blocked_by: string[];
  mode: NodeMode;
}

export interface ResolvedGroup {
  group: number;
  nodes: string[];
  parallel: boolean;
  demoted_reason?: string;
}

export interface ResolvedPlan {
  nodes: ResolvedNode[];
  groups: ResolvedGroup[];
}

/**
 * Pure resolver: takes the phase's selected node definitions and produces an
 * execution plan with auto-derived blocked_by (knowledge match), file-domain
 * conflict detection, and topologically grouped parallel layers.
 */
export function resolve(defs: NodeDefinition[]): ResolvedPlan {
  if (defs.length === 0) return { nodes: [], groups: [] };
  ensureUniqueNames(defs);
  const blockedByMap = deriveBlockedBy(defs);
  const nodes: ResolvedNode[] = defs.map((d) => ({
    name: d.name,
    agent: d.agents.primary[0] ?? "",
    blocked_by: [...(blockedByMap.get(d.name) ?? new Set<string>())],
    mode: d.mode,
  }));
  const groups = layerNodes(defs, blockedByMap);
  return { nodes, groups };
}

function ensureUniqueNames(defs: NodeDefinition[]): void {
  const seen = new Set<string>();
  for (const d of defs) {
    if (seen.has(d.name)) {
      throw new NodeResolverError(`duplicate node name: ${d.name}`);
    }
    seen.add(d.name);
  }
}

/**
 * For each consumer node, its blocked_by is the set of producer nodes whose
 * `output.knowledge` equals one of the consumer's `input.knowledge` paths.
 */
function deriveBlockedBy(defs: NodeDefinition[]): Map<string, Set<string>> {
  const producers = new Map<string, string[]>();
  for (const d of defs) {
    for (const out of d.output ?? []) {
      const list = producers.get(out.knowledge) ?? [];
      list.push(d.name);
      producers.set(out.knowledge, list);
    }
  }
  const out = new Map<string, Set<string>>();
  for (const d of defs) {
    const deps = new Set<string>();
    for (const inp of d.input ?? []) {
      const producerList = producers.get(inp.knowledge) ?? [];
      for (const p of producerList) {
        if (p !== d.name) deps.add(p);
      }
    }
    out.set(d.name, deps);
  }
  detectCycle(out);
  return out;
}

function detectCycle(graph: Map<string, Set<string>>): void {
  type Color = "white" | "gray" | "black";
  const color = new Map<string, Color>();
  for (const id of graph.keys()) color.set(id, "white");

  const visit = (id: string, stack: string[]): void => {
    color.set(id, "gray");
    for (const dep of graph.get(id) ?? []) {
      const c = color.get(dep);
      if (c === "gray") {
        throw new NodeResolverError(
          `cycle detected in node knowledge graph: ${[...stack, id, dep].join(" -> ")}`,
        );
      }
      if (c === "white") visit(dep, [...stack, id]);
    }
    color.set(id, "black");
  };

  for (const id of graph.keys()) {
    if (color.get(id) === "white") visit(id, []);
  }
}

/**
 * Kahn's algorithm layering: each layer contains nodes whose blocked_by are
 * all satisfied. Within a layer, demote to sequential if any pair has
 * overlapping output.artifacts or output.knowledge paths.
 */
function layerNodes(
  defs: NodeDefinition[],
  blocked: Map<string, Set<string>>,
): ResolvedGroup[] {
  const byName = new Map<string, NodeDefinition>();
  for (const d of defs) byName.set(d.name, d);
  const remaining = new Map<string, Set<string>>();
  for (const d of defs) remaining.set(d.name, new Set(blocked.get(d.name) ?? []));

  const groups: ResolvedGroup[] = [];
  const placed = new Set<string>();
  let groupIdx = 0;

  while (placed.size < defs.length) {
    const layer: string[] = [];
    for (const d of defs) {
      if (placed.has(d.name)) continue;
      const deps = remaining.get(d.name);
      if (deps && deps.size === 0) layer.push(d.name);
    }
    if (layer.length === 0) {
      throw new NodeResolverError("node layering stuck; possible cycle");
    }
    const layerDefs = layer.map((n) => byName.get(n)).filter((x): x is NodeDefinition => Boolean(x));
    const conflict = detectFileConflict(layerDefs);
    const allParallelMode = layerDefs.every((d) => d.mode === "parallel");
    const parallel = layerDefs.length > 1 && allParallelMode && conflict === null;
    const group: ResolvedGroup = {
      group: groupIdx,
      nodes: layer,
      parallel,
    };
    if (!parallel && layerDefs.length > 1) {
      group.demoted_reason = conflict
        ? `file-domain overlap: ${conflict}`
        : !allParallelMode
          ? "at least one node declares mode=sequential"
          : "single-node layer";
    }
    groups.push(group);
    for (const name of layer) {
      placed.add(name);
      for (const [other, deps] of remaining) {
        deps.delete(name);
        if (placed.has(other)) continue;
      }
    }
    groupIdx += 1;
  }
  return groups;
}

function detectFileConflict(defs: NodeDefinition[]): string | null {
  for (let i = 0; i < defs.length; i += 1) {
    for (let j = i + 1; j < defs.length; j += 1) {
      const a = defs[i]!;
      const b = defs[j]!;
      const artA = collectArtifactPrefixes(a);
      const artB = collectArtifactPrefixes(b);
      const overlap = artA.find((p) => artB.some((q) => prefixOverlap(p, q)));
      if (overlap) return `${a.name} <-> ${b.name} on artifact path "${overlap}"`;
      const kwA = (a.output ?? []).map((o) => o.knowledge);
      const kwB = (b.output ?? []).map((o) => o.knowledge);
      const kwOverlap = kwA.find((k) => kwB.includes(k));
      if (kwOverlap) return `${a.name} <-> ${b.name} on knowledge "${kwOverlap}"`;
    }
  }
  return null;
}

function collectArtifactPrefixes(def: NodeDefinition): string[] {
  const out: string[] = [];
  for (const o of def.output ?? []) {
    for (const a of o.artifacts) out.push(a);
  }
  return out;
}

function prefixOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const an = a.endsWith("/") ? a : `${a}/`;
  const bn = b.endsWith("/") ? b : `${b}/`;
  return an.startsWith(bn) || bn.startsWith(an);
}

/**
 * Compute the first ready node: lowest-indexed node in the earliest
 * non-completed group whose blocked_by are all completed.
 */
export interface ResolvedNodeStatus {
  name: string;
  status: "pending" | "ready" | "in_progress" | "completed" | "failed" | "timeout";
}

export function computeNextNode(
  plan: ResolvedPlan,
  statusByName: Map<string, ResolvedNodeStatus["status"]>,
): { name: string; reason: string } | null {
  for (const group of plan.groups) {
    const allCompleted = group.nodes.every((n) => statusByName.get(n) === "completed");
    if (allCompleted) continue;
    for (const name of group.nodes) {
      const status = statusByName.get(name);
      if (status !== "pending" && status !== "ready") continue;
      const node = plan.nodes.find((n) => n.name === name);
      if (!node) continue;
      const ready = node.blocked_by.every((dep) => statusByName.get(dep) === "completed");
      if (ready) {
        return {
          name,
          reason: `group ${group.group} first ready node with blocked_by satisfied`,
        };
      }
    }
    return null;
  }
  return null;
}

export function computeUnblockedNodes(
  plan: ResolvedPlan,
  statusByName: Map<string, ResolvedNodeStatus["status"]>,
): string[] {
  const out: string[] = [];
  for (const node of plan.nodes) {
    const st = statusByName.get(node.name);
    if (st !== "pending" && st !== "ready") continue;
    const ready = node.blocked_by.every((dep) => statusByName.get(dep) === "completed");
    if (ready) out.push(node.name);
  }
  return out;
}
