/**
 * @opc/tool-aliases — Data module for 54 → 28 tool consolidation (spec
 * `doc/feature/07-tool-consolidation/00_overview.md`).
 *
 * Purpose: provide an in-process lookup so the M19 wire layer can:
 *   1. forward calls made under deprecated tool names to the new (tool,
 *      discriminator) pair while emitting a one-time deprecation warning;
 *   2. enforce the registry-guard protected anchor list and the exempt
 *      list as (tool, discriminator-value) pairs (per spec §4.3 / §4.4),
 *      instead of by tool name alone.
 *
 * This package is pure data + helpers. It does NOT execute any tool — it
 * only resolves names and exposes guard membership. Tests in this package
 * lock the data to the spec tables.
 */

/** Discriminator field name; one of the values listed in spec §2.3. */
export type DiscriminatorField =
  | "action"
  | "step"
  | "method"
  | "mode"
  | "status";

/**
 * Where an old tool name routes to in the consolidated surface.
 *
 * - `tool`: the new tool name (may be unchanged from the old name when the
 *   tool is retained verbatim — `discriminator` is null in that case).
 * - `discriminator`: when present, the old tool corresponds to a specific
 *   value of the new tool's discriminator field; M19 must inject it.
 * - `notes`: optional human-readable reason; surfaced in the deprecation
 *   warning and tests.
 */
export interface MappingTarget {
  tool: string;
  discriminator: { field: DiscriminatorField; value: string } | null;
  notes?: string;
}

/**
 * Source-of-truth alias table. Keys are deprecated tool names (or new
 * names that were also part of the old surface and remain unchanged).
 *
 * Generation rule per spec §2.1:
 *   - Every old tool MUST appear as a key
 *   - Retained-verbatim tools map to themselves with `discriminator: null`
 *   - Tools absorbed into a facade map to (new_tool, {field, value})
 *
 * Total: 54 keys (matching the "before" count in spec §1.1).
 */
export const ALIAS_MAP: Readonly<Record<string, MappingTarget>> = Object.freeze({
  // --- state-server flow (14 → 7) ---
  opc_flow_query: { tool: "opc_flow_query", discriminator: null },
  opc_flow_start: {
    tool: "opc_flow_lifecycle",
    discriminator: { field: "action", value: "start" },
  },
  opc_flow_abort: {
    tool: "opc_flow_lifecycle",
    discriminator: { field: "action", value: "abort" },
  },
  opc_flow_recover: {
    tool: "opc_flow_lifecycle",
    discriminator: { field: "action", value: "recover" },
  },
  opc_intent_complete: {
    tool: "opc_flow_step_complete",
    discriminator: { field: "step", value: "intent_analysis" },
  },
  opc_task_analysis_complete: {
    tool: "opc_flow_step_complete",
    discriminator: { field: "step", value: "task_analysis" },
  },
  opc_decomposition_complete: {
    tool: "opc_flow_step_complete",
    discriminator: { field: "step", value: "task_decomposition" },
  },
  opc_task_decomposition_complete: {
    tool: "opc_flow_step_complete",
    discriminator: { field: "step", value: "task_decomposition" },
  },
  opc_brief_complete: {
    tool: "opc_flow_step_complete",
    discriminator: { field: "step", value: "brief_generation" },
  },
  opc_flow_reflect: { tool: "opc_flow_reflect", discriminator: null },
  opc_flow_user_reply: { tool: "opc_flow_user_reply", discriminator: null },
  opc_quick_dispatch: { tool: "opc_quick_dispatch", discriminator: null },
  opc_flow_revise: {
    tool: "opc_flow_correct",
    discriminator: { field: "action", value: "revise" },
  },
  opc_flow_restart: {
    tool: "opc_flow_correct",
    discriminator: { field: "action", value: "restart" },
  },
  opc_phase_reset: {
    tool: "opc_flow_correct",
    discriminator: { field: "action", value: "phase_reset" },
    notes: "absorbed from state-server phase per spec §2.1",
  },

  // --- state-server pipeline (7 → 3) ---
  opc_pipeline_create: { tool: "opc_pipeline_create", discriminator: null },
  opc_pipeline_status: { tool: "opc_pipeline_status", discriminator: null },
  opc_pipeline_recover: {
    tool: "opc_flow_lifecycle",
    discriminator: { field: "action", value: "recover" },
    notes: "cascades through flow lifecycle",
  },
  opc_pipeline_complete: {
    tool: "opc_pipeline_lifecycle",
    discriminator: { field: "action", value: "complete" },
  },
  opc_pipeline_abort: {
    tool: "opc_pipeline_lifecycle",
    discriminator: { field: "action", value: "abort" },
  },
  opc_pipeline_replan: {
    tool: "opc_pipeline_lifecycle",
    discriminator: { field: "action", value: "replan" },
  },
  opc_pipeline_resume: {
    tool: "opc_pipeline_lifecycle",
    discriminator: { field: "action", value: "resume" },
  },

  // --- state-server phase (5 → 3; phase_adjust DELETED) ---
  opc_phase_start: { tool: "opc_phase_start", discriminator: null },
  opc_phase_confirm: { tool: "opc_phase_confirm", discriminator: null },
  opc_phase_complete: { tool: "opc_phase_complete", discriminator: null },
  // opc_phase_adjust: deleted per spec — see TOMBSTONES below
  // opc_phase_reset: absorbed into opc_flow_correct (above)

  // --- state-server node (4 → 2) ---
  opc_node_start: { tool: "opc_node_start", discriminator: null },
  opc_node_complete: {
    tool: "opc_node_finish",
    discriminator: { field: "status", value: "success" },
  },
  opc_node_fail: {
    tool: "opc_node_finish",
    discriminator: { field: "status", value: "failed" },
  },
  opc_node_retry: {
    tool: "opc_node_finish",
    discriminator: { field: "status", value: "retry" },
  },

  // --- knowledge-server (8 → 4) ---
  opc_knowledge_open: { tool: "opc_knowledge_open", discriminator: null },
  opc_knowledge_get: {
    tool: "opc_knowledge_read",
    discriminator: { field: "mode", value: "single" },
  },
  opc_knowledge_get_batch: {
    tool: "opc_knowledge_read",
    discriminator: { field: "mode", value: "batch" },
  },
  opc_knowledge_list: {
    tool: "opc_knowledge_read",
    discriminator: { field: "mode", value: "list" },
  },
  opc_knowledge_search: {
    tool: "opc_knowledge_read",
    discriminator: { field: "mode", value: "search" },
  },
  opc_knowledge_write: { tool: "opc_knowledge_write", discriminator: null },
  opc_knowledge_delete: {
    tool: "opc_knowledge_admin",
    discriminator: { field: "action", value: "delete" },
  },
  opc_knowledge_reindex: {
    tool: "opc_knowledge_admin",
    discriminator: { field: "action", value: "reindex" },
  },

  // --- reflection-server main (13 → 4) ---
  opc_reflect_plan: { tool: "opc_reflect_plan", discriminator: null },
  opc_reflect_cove: {
    tool: "opc_reflect_execute",
    discriminator: { field: "method", value: "cove" },
  },
  opc_reflect_critique: {
    tool: "opc_reflect_execute",
    discriminator: { field: "method", value: "critique" },
  },
  opc_reflect_debate: {
    tool: "opc_reflect_execute",
    discriminator: { field: "method", value: "debate" },
  },
  opc_reflect_tot: {
    tool: "opc_reflect_execute",
    discriminator: { field: "method", value: "tot" },
  },
  opc_reflect_cove_complete: {
    tool: "opc_reflect_complete",
    discriminator: { field: "method", value: "cove" },
  },
  opc_reflect_critique_complete: {
    tool: "opc_reflect_complete",
    discriminator: { field: "method", value: "critique" },
  },
  opc_reflect_debate_complete: {
    tool: "opc_reflect_complete",
    discriminator: { field: "method", value: "debate" },
  },
  opc_reflect_tot_complete: {
    tool: "opc_reflect_complete",
    discriminator: { field: "method", value: "tot" },
  },
  opc_reflect_record_interventions: {
    tool: "opc_reflect_admin",
    discriminator: { field: "action", value: "record_interventions" },
  },
  opc_reflect_on_demand: {
    tool: "opc_reflect_admin",
    discriminator: { field: "action", value: "on_demand" },
  },
  opc_reflect_explain: {
    tool: "opc_reflect_admin",
    discriminator: { field: "action", value: "explain" },
  },
  opc_reflect_query_stats: {
    tool: "opc_reflect_admin",
    discriminator: { field: "action", value: "query_stats" },
  },
  opc_reflect_unlearn_method: {
    tool: "opc_reflect_admin",
    discriminator: { field: "action", value: "unlearn_method" },
  },

  // --- corrections (4 → 1) ---
  opc_corrections_query: {
    tool: "opc_corrections",
    discriminator: { field: "action", value: "query" },
  },
  opc_corrections_record: {
    tool: "opc_corrections",
    discriminator: { field: "action", value: "record" },
  },
  opc_corrections_unlearn: {
    tool: "opc_corrections",
    discriminator: { field: "action", value: "unlearn" },
  },
  opc_corrections_reindex: {
    tool: "opc_corrections",
    discriminator: { field: "action", value: "reindex" },
  },
});

/**
 * Tools removed without replacement (spec §2.1 phase row).
 * Wire layer should hard-reject calls to these and surface the rationale.
 */
export const TOMBSTONES: Readonly<Record<string, string>> = Object.freeze({
  opc_phase_adjust:
    "deleted; replaced by reflection loop self-correction (see 03-phase/04_phase-start.md:182)",
});

/**
 * Registry-guard protected anchors, as (tool, discriminator?) pairs.
 * Spec §4.3: when checking whether a call is protected, match by both
 * tool name AND discriminator value (e.g. opc_pipeline_lifecycle is
 * protected only when action="complete").
 */
export interface ProtectedAnchor {
  tool: string;
  discriminator: { field: DiscriminatorField; value: string } | null;
  legacyName: string;
}

export const PROTECTED_ANCHORS: readonly ProtectedAnchor[] = Object.freeze([
  { tool: "opc_flow_reflect", discriminator: null, legacyName: "opc_flow_reflect" },
  {
    tool: "opc_flow_step_complete",
    discriminator: { field: "step", value: "task_analysis" },
    legacyName: "opc_task_analysis_complete",
  },
  {
    tool: "opc_flow_step_complete",
    discriminator: { field: "step", value: "task_decomposition" },
    legacyName: "opc_decomposition_complete",
  },
  {
    tool: "opc_flow_step_complete",
    discriminator: { field: "step", value: "brief_generation" },
    legacyName: "opc_brief_complete",
  },
  { tool: "opc_pipeline_create", discriminator: null, legacyName: "opc_pipeline_create" },
  { tool: "opc_phase_confirm", discriminator: null, legacyName: "opc_phase_confirm" },
  { tool: "opc_node_start", discriminator: null, legacyName: "opc_node_start" },
  { tool: "opc_phase_complete", discriminator: null, legacyName: "opc_phase_complete" },
  {
    tool: "opc_pipeline_lifecycle",
    discriminator: { field: "action", value: "complete" },
    legacyName: "opc_pipeline_complete",
  },
]);

/**
 * Registry-guard exempt list, per spec §4.4 — calls matching these pairs
 * bypass the guard. The entire `opc_flow_correct` tool is exempt across
 * all discriminator values; for other tools the discriminator is required.
 */
export interface ExemptAnchor {
  tool: string;
  /** null = entire tool exempt (any discriminator value). */
  discriminator: { field: DiscriminatorField; value: string } | null;
  legacyName: string;
}

export const EXEMPT_ANCHORS: readonly ExemptAnchor[] = Object.freeze([
  {
    tool: "opc_flow_correct",
    discriminator: { field: "action", value: "revise" },
    legacyName: "opc_flow_revise",
  },
  {
    tool: "opc_flow_correct",
    discriminator: { field: "action", value: "restart" },
    legacyName: "opc_flow_restart",
  },
  {
    tool: "opc_flow_correct",
    discriminator: { field: "action", value: "phase_reset" },
    legacyName: "opc_phase_reset",
  },
  {
    tool: "opc_pipeline_lifecycle",
    discriminator: { field: "action", value: "replan" },
    legacyName: "opc_pipeline_replan",
  },
  {
    tool: "opc_flow_lifecycle",
    discriminator: { field: "action", value: "abort" },
    legacyName: "opc_flow_abort",
  },
  {
    tool: "opc_node_finish",
    discriminator: { field: "status", value: "success" },
    legacyName: "opc_node_complete",
  },
  {
    tool: "opc_node_finish",
    discriminator: { field: "status", value: "failed" },
    legacyName: "opc_node_fail",
  },
  {
    tool: "opc_node_finish",
    discriminator: { field: "status", value: "retry" },
    legacyName: "opc_node_retry",
  },
]);

/**
 * The 24 active new-surface tools, derived from spec §2.2. The wire
 * layer should advertise exactly this set to MCP clients.
 */
export const NEW_TOOLS: readonly string[] = Object.freeze([
  "opc_flow_query",
  "opc_flow_lifecycle",
  "opc_flow_step_complete",
  "opc_flow_reflect",
  "opc_flow_user_reply",
  "opc_quick_dispatch",
  "opc_flow_correct",
  "opc_pipeline_create",
  "opc_pipeline_status",
  "opc_pipeline_lifecycle",
  "opc_phase_start",
  "opc_phase_confirm",
  "opc_phase_complete",
  "opc_node_start",
  "opc_node_finish",
  "opc_knowledge_open",
  "opc_knowledge_read",
  "opc_knowledge_write",
  "opc_knowledge_admin",
  "opc_reflect_plan",
  "opc_reflect_execute",
  "opc_reflect_complete",
  "opc_reflect_admin",
  "opc_corrections",
]);

// ---- helpers ----

/**
 * Resolve a (possibly legacy) tool call to its new (tool, discriminator)
 * pair. Returns null if the name is neither a known alias nor a current
 * tool. Throws if the name is in TOMBSTONES (caller should surface the
 * tombstone message to the user).
 */
export function resolveAlias(toolName: string): MappingTarget | null {
  if (toolName in TOMBSTONES) {
    throw new Error(
      `tool ${toolName} was removed: ${TOMBSTONES[toolName]}`,
    );
  }
  const direct = ALIAS_MAP[toolName];
  if (direct) return direct;
  if ((NEW_TOOLS as readonly string[]).includes(toolName)) {
    return { tool: toolName, discriminator: null };
  }
  return null;
}

/**
 * Check whether a call to (tool, discriminatorValue?) is registry-guard
 * protected. Matches anchors with discriminator=null by tool alone;
 * anchors with a discriminator require the value to match.
 */
export function isProtected(
  tool: string,
  discriminatorValue?: string,
): boolean {
  return PROTECTED_ANCHORS.some((a) => {
    if (a.tool !== tool) return false;
    if (a.discriminator === null) return true;
    return discriminatorValue === a.discriminator.value;
  });
}

/**
 * Check whether a call to (tool, discriminatorValue?) is exempted from
 * the registry-guard. Special case: `opc_flow_correct` is exempt for any
 * discriminator value because the spec §4.4 says "整个 `opc_flow_correct`
 * 工具全部豁免". This helper enforces that by treating
 * `discriminatorValue=undefined` as a wildcard for that tool only.
 */
export function isExempt(
  tool: string,
  discriminatorValue?: string,
): boolean {
  if (tool === "opc_flow_correct") return true;
  return EXEMPT_ANCHORS.some((a) => {
    if (a.tool !== tool) return false;
    if (a.discriminator === null) return true;
    return discriminatorValue === a.discriminator.value;
  });
}

export const PACKAGE_NAME = "@opc/tool-aliases" as const;
