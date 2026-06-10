import { describe, expect, it } from "vitest";

import {
  ALIAS_MAP,
  EXEMPT_ANCHORS,
  isExempt,
  isProtected,
  NEW_TOOLS,
  PROTECTED_ANCHORS,
  resolveAlias,
  TOMBSTONES,
} from "./index.js";

describe("ALIAS_MAP", () => {
  it("ALIAS_MAP + TOMBSTONES round up to all named legacy tools", () => {
    // Spec §1.1 inventories 56 legacy tool slots across all milestones.
    // 55 of those are rewritten through ALIAS_MAP (retained-verbatim
    // tools map to themselves with discriminator=null; absorbed tools
    // map to a facade + discriminator pair). The remaining 1 is
    // opc_phase_adjust, which is hard-removed (TOMBSTONES).
    expect(Object.keys(ALIAS_MAP).length).toBe(55);
    expect(Object.keys(TOMBSTONES).length).toBe(1);
  });

  it("every retained-verbatim tool maps to itself with discriminator=null", () => {
    const retained = [
      "opc_flow_query",
      "opc_flow_reflect",
      "opc_flow_user_reply",
      "opc_quick_dispatch",
      "opc_pipeline_create",
      "opc_pipeline_status",
      "opc_phase_start",
      "opc_phase_confirm",
      "opc_phase_complete",
      "opc_node_start",
      "opc_knowledge_open",
      "opc_knowledge_write",
      "opc_reflect_plan",
    ];
    for (const name of retained) {
      const entry = ALIAS_MAP[name];
      expect(entry, `${name} should have an alias entry`).toBeDefined();
      expect(entry!.tool).toBe(name);
      expect(entry!.discriminator).toBeNull();
    }
  });

  it("every absorbed tool maps to a newly-named tool with discriminator", () => {
    const absorbed: Array<[string, string, DiscriminatorField, string]> = [
      ["opc_flow_start", "opc_flow_lifecycle", "action", "start"],
      ["opc_flow_abort", "opc_flow_lifecycle", "action", "abort"],
      ["opc_flow_recover", "opc_flow_lifecycle", "action", "recover"],
      ["opc_intent_complete", "opc_flow_step_complete", "step", "intent_analysis"],
      ["opc_task_analysis_complete", "opc_flow_step_complete", "step", "task_analysis"],
      ["opc_decomposition_complete", "opc_flow_step_complete", "step", "task_decomposition"],
      ["opc_brief_complete", "opc_flow_step_complete", "step", "brief_generation"],
      ["opc_flow_revise", "opc_flow_correct", "action", "revise"],
      ["opc_flow_restart", "opc_flow_correct", "action", "restart"],
      ["opc_phase_reset", "opc_flow_correct", "action", "phase_reset"],
      ["opc_pipeline_complete", "opc_pipeline_lifecycle", "action", "complete"],
      ["opc_pipeline_abort", "opc_pipeline_lifecycle", "action", "abort"],
      ["opc_pipeline_replan", "opc_pipeline_lifecycle", "action", "replan"],
      ["opc_pipeline_resume", "opc_pipeline_lifecycle", "action", "resume"],
      ["opc_node_complete", "opc_node_finish", "status", "success"],
      ["opc_node_fail", "opc_node_finish", "status", "failed"],
      ["opc_node_retry", "opc_node_finish", "status", "retry"],
      ["opc_knowledge_get", "opc_knowledge_read", "mode", "single"],
      ["opc_knowledge_get_batch", "opc_knowledge_read", "mode", "batch"],
      ["opc_knowledge_list", "opc_knowledge_read", "mode", "list"],
      ["opc_knowledge_search", "opc_knowledge_read", "mode", "search"],
      ["opc_knowledge_delete", "opc_knowledge_admin", "action", "delete"],
      ["opc_knowledge_reindex", "opc_knowledge_admin", "action", "reindex"],
      ["opc_reflect_cove", "opc_reflect_execute", "method", "cove"],
      ["opc_reflect_critique", "opc_reflect_execute", "method", "critique"],
      ["opc_reflect_debate", "opc_reflect_execute", "method", "debate"],
      ["opc_reflect_tot", "opc_reflect_execute", "method", "tot"],
      ["opc_reflect_cove_complete", "opc_reflect_complete", "method", "cove"],
      ["opc_reflect_critique_complete", "opc_reflect_complete", "method", "critique"],
      ["opc_reflect_debate_complete", "opc_reflect_complete", "method", "debate"],
      ["opc_reflect_tot_complete", "opc_reflect_complete", "method", "tot"],
      ["opc_reflect_record_interventions", "opc_reflect_admin", "action", "record_interventions"],
      ["opc_reflect_on_demand", "opc_reflect_admin", "action", "on_demand"],
      ["opc_reflect_explain", "opc_reflect_admin", "action", "explain"],
      ["opc_reflect_query_stats", "opc_reflect_admin", "action", "query_stats"],
      ["opc_reflect_unlearn_method", "opc_reflect_admin", "action", "unlearn_method"],
      ["opc_corrections_query", "opc_corrections", "action", "query"],
      ["opc_corrections_record", "opc_corrections", "action", "record"],
      ["opc_corrections_unlearn", "opc_corrections", "action", "unlearn"],
      ["opc_corrections_reindex", "opc_corrections", "action", "reindex"],
    ];
    for (const [oldName, newTool, field, value] of absorbed) {
      const entry = ALIAS_MAP[oldName];
      expect(entry, `${oldName} should be mapped`).toBeDefined();
      expect(entry!.tool).toBe(newTool);
      expect(entry!.discriminator).not.toBeNull();
      expect(entry!.discriminator!.field).toBe(field);
      expect(entry!.discriminator!.value).toBe(value);
    }
  });

  it("pipeline_recover maps to flow_lifecycle (action=recover)", () => {
    const e = ALIAS_MAP.opc_pipeline_recover;
    expect(e?.tool).toBe("opc_flow_lifecycle");
    expect(e?.discriminator?.value).toBe("recover");
  });
});

describe("TOMBSTONES", () => {
  it("contains opc_phase_adjust", () => {
    expect(TOMBSTONES.opc_phase_adjust).toContain("deleted");
  });

  it("resolveAlias throws for tombstoned names", () => {
    expect(() => resolveAlias("opc_phase_adjust")).toThrow("deleted");
  });
});

describe("resolveAlias", () => {
  it("returns MappingTarget for retained verbs", () => {
    const r = resolveAlias("opc_flow_reflect");
    expect(r).not.toBeNull();
    expect(r!.tool).toBe("opc_flow_reflect");
    expect(r!.discriminator).toBeNull();
  });

  it("returns MappingTarget with discriminator for absorbed tools", () => {
    const r = resolveAlias("opc_reflect_cove");
    expect(r).not.toBeNull();
    expect(r!.tool).toBe("opc_reflect_execute");
    expect(r!.discriminator!.value).toBe("cove");
  });

  it("returns the tool itself for new-surface names that weren't in old list", () => {
    const r = resolveAlias("opc_flow_correct");
    expect(r).not.toBeNull();
    expect(r!.tool).toBe("opc_flow_correct");
    expect(r!.discriminator).toBeNull();
  });

  it("returns null for completely unknown name", () => {
    expect(resolveAlias("nonexistent")).toBeNull();
  });
});

describe("PROTECTED_ANCHORS (§4.3)", () => {
  it("has exactly 9 entries (matching spec table)", () => {
    expect(PROTECTED_ANCHORS.length).toBe(9);
  });

  it("opc_flow_reflect is protected (any discriminator)", () => {
    expect(isProtected("opc_flow_reflect")).toBe(true);
    expect(isProtected("opc_flow_reflect", "whatever")).toBe(true);
  });

  it("opc_pipeline_lifecycle is protected only for action=complete", () => {
    expect(isProtected("opc_pipeline_lifecycle", "complete")).toBe(true);
    expect(isProtected("opc_pipeline_lifecycle", "abort")).toBe(false);
    expect(isProtected("opc_pipeline_lifecycle", "replan")).toBe(false);
  });

  it("opc_flow_step_complete is protected for task_analysis / decomposition / brief", () => {
    expect(isProtected("opc_flow_step_complete", "task_analysis")).toBe(true);
    expect(isProtected("opc_flow_step_complete", "task_decomposition")).toBe(true);
    expect(isProtected("opc_flow_step_complete", "brief_generation")).toBe(true);
    expect(isProtected("opc_flow_step_complete", "intent_analysis")).toBe(false);
  });

  it("non-anchored tools are not protected", () => {
    expect(isProtected("opc_flow_abort" as never)).toBe(false);
  });
});

describe("EXEMPT_ANCHORS (§4.4)", () => {
  it("opc_flow_correct is entirely exempt (any discriminator)", () => {
    expect(isExempt("opc_flow_correct")).toBe(true);
    expect(isExempt("opc_flow_correct", "revise")).toBe(true);
    expect(isExempt("opc_flow_correct", "restart")).toBe(true);
    expect(isExempt("opc_flow_correct", "phase_reset")).toBe(true);
  });

  it("opc_node_finish is exempt for success/failed/retry", () => {
    expect(isExempt("opc_node_finish", "success")).toBe(true);
    expect(isExempt("opc_node_finish", "failed")).toBe(true);
    expect(isExempt("opc_node_finish", "retry")).toBe(true);
  });

  it("opc_pipeline_lifecycle(replan) is exempt", () => {
    expect(isExempt("opc_pipeline_lifecycle", "replan")).toBe(true);
  });

  it("pipeline_lifecycle(complete) is NOT exempt (it is PROTECTED)", () => {
    expect(isExempt("opc_pipeline_lifecycle", "complete")).toBe(false);
  });

  it("opc_flow_lifecycle(abort) is exempt", () => {
    expect(isExempt("opc_flow_lifecycle", "abort")).toBe(true);
  });

  it("flow_lifecycle(start) is NOT exempt", () => {
    expect(isExempt("opc_flow_lifecycle", "start")).toBe(false);
  });

  it("makes EXEMPT_ANCHORS entries match EXEMPT_ANCHORS length", () => {
    expect(EXEMPT_ANCHORS.length).toBeGreaterThanOrEqual(7);
  });
});

describe("NEW_TOOLS", () => {
  it("has exactly 24 tools (spec §2.2)", () => {
    expect(NEW_TOOLS.length).toBe(24);
  });

  it("every new tool is also resolveable via resolveAlias", () => {
    for (const t of NEW_TOOLS) {
      const r = resolveAlias(t);
      expect(r, `${t} should be resolveable`).not.toBeNull();
      expect(r!.tool).toBe(t);
    }
  });

  it("includes all 7 flow tools", () => {
    expect(NEW_TOOLS).toContain("opc_flow_query");
    expect(NEW_TOOLS).toContain("opc_flow_lifecycle");
    expect(NEW_TOOLS).toContain("opc_flow_step_complete");
    expect(NEW_TOOLS).toContain("opc_flow_reflect");
    expect(NEW_TOOLS).toContain("opc_flow_user_reply");
    expect(NEW_TOOLS).toContain("opc_quick_dispatch");
    expect(NEW_TOOLS).toContain("opc_flow_correct");
  });

  it("virtual tool opc_knowledge_read is present", () => {
    expect(NEW_TOOLS).toContain("opc_knowledge_read");
    expect(NEW_TOOLS).toContain("opc_knowledge_admin");
  });
});

// ---- types for the test table above ----
type DiscriminatorField = "action" | "step" | "method" | "mode" | "status";