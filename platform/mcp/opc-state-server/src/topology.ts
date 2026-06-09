import type { ExecutionGroup, SubPipeline } from "./pipeline-plan.js";

export class TopologyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopologyError";
  }
}

export interface TopologyInput {
  sub_pipelines: SubPipeline[];
}

/**
 * Validate blocked_by references and acyclicity. Throws TopologyError on
 * invalid references or cycles.
 */
export function validateDag(input: TopologyInput): void {
  const ids = new Set(input.sub_pipelines.map((s) => s.id));
  for (const sub of input.sub_pipelines) {
    for (const dep of sub.blocked_by) {
      if (!ids.has(dep)) {
        throw new TopologyError(`sub_pipeline ${sub.id} has unknown blocked_by reference: ${dep}`);
      }
      if (dep === sub.id) {
        throw new TopologyError(`sub_pipeline ${sub.id} cannot block itself`);
      }
    }
  }
  detectCycle(input.sub_pipelines);
}

function detectCycle(subs: SubPipeline[]): void {
  const indexById = new Map<string, SubPipeline>();
  for (const s of subs) indexById.set(s.id, s);

  type Color = "white" | "gray" | "black";
  const color = new Map<string, Color>();
  for (const s of subs) color.set(s.id, "white");

  const visit = (id: string, stack: string[]): void => {
    color.set(id, "gray");
    const node = indexById.get(id);
    if (!node) return;
    for (const dep of node.blocked_by) {
      const c = color.get(dep);
      if (c === "gray") {
        const cycle = [...stack, id, dep].join(" -> ");
        throw new TopologyError(`cycle detected in blocked_by: ${cycle}`);
      }
      if (c === "white") visit(dep, [...stack, id]);
    }
    color.set(id, "black");
  };

  for (const s of subs) {
    if (color.get(s.id) === "white") visit(s.id, []);
  }
}

/**
 * Generate default execution_order via Kahn's algorithm, grouping subs whose
 * dependencies are all satisfied at the same level. Within a group the order
 * matches the input order (stable).
 */
export function generateExecutionOrder(input: TopologyInput): ExecutionGroup[] {
  validateDag(input);
  const subs = input.sub_pipelines;
  const remaining = new Map<string, Set<string>>();
  for (const s of subs) remaining.set(s.id, new Set(s.blocked_by));

  const groups: ExecutionGroup[] = [];
  const placed = new Set<string>();
  let groupIdx = 0;

  while (placed.size < subs.length) {
    const layer: string[] = [];
    for (const s of subs) {
      if (placed.has(s.id)) continue;
      const deps = remaining.get(s.id);
      if (deps && deps.size === 0) layer.push(s.id);
    }
    if (layer.length === 0) {
      throw new TopologyError("execution_order generation stuck; possible cycle");
    }
    groups.push({ group: groupIdx, sub_pipeline_ids: layer });
    for (const id of layer) {
      placed.add(id);
      for (const [other, deps] of remaining) {
        deps.delete(id);
        if (placed.has(other)) continue;
      }
    }
    groupIdx += 1;
  }
  return groups;
}

/**
 * Validate caller-provided execution_order: every sub must appear exactly once,
 * and each group must not violate blocked_by (deps must be in an earlier group).
 */
export function validateExecutionOrder(input: TopologyInput, order: ExecutionGroup[]): void {
  const subIds = new Set(input.sub_pipelines.map((s) => s.id));
  const seen = new Set<string>();
  const groupOf = new Map<string, number>();
  for (const group of order) {
    for (const id of group.sub_pipeline_ids) {
      if (!subIds.has(id)) {
        throw new TopologyError(`execution_order references unknown sub: ${id}`);
      }
      if (seen.has(id)) {
        throw new TopologyError(`execution_order has duplicate sub: ${id}`);
      }
      seen.add(id);
      groupOf.set(id, group.group);
    }
  }
  for (const id of subIds) {
    if (!seen.has(id)) {
      throw new TopologyError(`execution_order missing sub: ${id}`);
    }
  }
  const byId = new Map<string, SubPipeline>();
  for (const s of input.sub_pipelines) byId.set(s.id, s);
  for (const [id, gIdx] of groupOf) {
    const sub = byId.get(id);
    if (!sub) continue;
    for (const dep of sub.blocked_by) {
      const depGroup = groupOf.get(dep);
      if (depGroup === undefined || depGroup >= gIdx) {
        throw new TopologyError(
          `execution_order violates blocked_by: ${id} (group ${gIdx}) depends on ${dep} (group ${depGroup ?? "?"})`,
        );
      }
    }
  }
}

/**
 * Compute the next eligible sub_pipeline_id: the first pending sub whose
 * blocked_by are all completed, scanned within the first non-completed
 * execution_order group. Returns null if nothing is ready.
 */
export function computeNextSubPipeline(
  subs: SubPipeline[],
  order: ExecutionGroup[],
): { id: string; reason: string } | null {
  const byId = new Map<string, SubPipeline>();
  for (const s of subs) byId.set(s.id, s);

  for (const group of order) {
    const groupSubs = group.sub_pipeline_ids
      .map((id) => byId.get(id))
      .filter((s): s is SubPipeline => Boolean(s));
    const allCompleted = groupSubs.every((s) => s.status === "completed");
    if (allCompleted) continue;
    for (const sub of groupSubs) {
      if (sub.status !== "pending") continue;
      const ready = sub.blocked_by.every((dep) => byId.get(dep)?.status === "completed");
      if (ready) {
        return {
          id: sub.id,
          reason: `execution_order group ${group.group} first pending sub with blocked_by satisfied`,
        };
      }
    }
    return null;
  }
  return null;
}

/**
 * List subs that cannot start yet because of blocked_by, with the unmet deps.
 */
export function listBlockedSubs(subs: SubPipeline[]): Array<{ id: string; waiting_for: string[] }> {
  const byId = new Map<string, SubPipeline>();
  for (const s of subs) byId.set(s.id, s);
  const out: Array<{ id: string; waiting_for: string[] }> = [];
  for (const sub of subs) {
    if (sub.status !== "pending") continue;
    const unmet = sub.blocked_by.filter((dep) => byId.get(dep)?.status !== "completed");
    if (unmet.length > 0) out.push({ id: sub.id, waiting_for: unmet });
  }
  return out;
}
