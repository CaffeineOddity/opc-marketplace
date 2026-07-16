/**
 * Phase A end-to-end verification (loop Round 1, step 5):
 * Drive prd→design→dev→test-like chain in a temp root that mimics opc-test.
 * Proves phase_confirm gets nodes materialized from disk (no longer
 * short-circuits to opc_phase_complete with "phase has no nodes to execute").
 *
 * We seed a real `.opc/phases/<phase>/nodes/*.md` tree (copied verbatim from
 * opc-test's prd-draft.md shape) into a temp root, run the full
 * lifecycle→pipeline_create→phase_start→phase_confirm flow, and assert:
 *  - phase_confirm returns groups (not empty) → flow_next = opc_node_start
 *  - state.json phase.nodes is populated from disk
 *  - node_start returns a non-null node_body (loadNodeBody fallback works)
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FlowServer,
  NodeServer,
  PhaseServer,
  PipelineServer,
  loadFlowState,
  loadStateJson,
} from "./index.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "disk-loading-e2e-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const NOW = (): Date => new Date("2026-07-17T00:00:00Z");
const UUID = ((c) => () => `id-${(c += 1)}`)(0);

const PRD_DRAFT_MD = `---
name: prd-draft
phase: 01-validation
tags: [add-feature, api]
description: Draft a PRD
agents:
  primary: [product-manager]
input:
  - path: "<unit>/<feature>/user-research"
    type: knowledge
output:
  - path: "<unit>/<feature>/prd"
    type: knowledge
quality_gates:
  L1: [moscow_classified, acceptance_measurable]
  L2: [risks_linked]
---

# prd-draft body

Do the PRD work here. This body must surface via node_start.
`;

const DESIGN_MD = `---
name: design-draft
phase: 02-design
agents:
  primary: [designer]
input:
  - path: "<unit>/<feature>/prd"
    type: knowledge
output:
  - path: "<unit>/<feature>/design"
    type: knowledge
quality_gates:
  L1: [design_reviewed]
---

Design body.
`;

async function seedNode(phase: string, file: string, content: string): Promise<void> {
  const dir = join(root, ".opc", "phases", phase, "nodes");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), content, "utf8");
}

describe("Phase A — disk node loading end-to-end", () => {
  it("materializes phase.nodes from disk on phase_start and routes confirm→node_start", async () => {
    await seedNode("01-validation", "prd-draft.md", PRD_DRAFT_MD);
    await seedNode("02-design", "design-draft.md", DESIGN_MD);

    const fs = new FlowServer({ root, now: NOW, pid: () => 1234, uuid: UUID, transport: "stdio", ppid: () => 1234, isAlive: () => true });
    const started = await fs.lifecycle({ action: "start" });
    const session_id = started.state.session_id;

    const pipe = new PipelineServer({ root, now: NOW, pid: () => 1234, uuid: UUID });
    const pc = await pipe.create({
      session_id,
      description: "todo app",
      brief_content: "A simple todo app",
      complexity: "medium",
      knowledge_unit: ["todos"],
      suggested_phases: ["01-validation", "02-design"],
      phase_selection_rationale: "minimal viable",
    });
    const pipeline_id = pc.pipeline_id;

    // C0: state.json was created with both phases pending and EMPTY nodes
    const st0 = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    expect(st0.phases.map((p) => p.phase)).toEqual(["01-validation", "02-design"]);
    expect(st0.phases.every((p) => p.nodes.length === 0)).toBe(true);

    const phase = new PhaseServer({ root, now: NOW, pid: () => 1234, uuid: UUID });
    const started_phase = await phase.start({
      session_id, pipeline_id, sub_pipeline_id: "sub-1", phase: "01-validation",
    });
    // phase_start should route to phase_confirm (not phase_complete)
    expect(started_phase.flow_next.tool).toBe("opc_phase_confirm");

    // After start, nodes materialized from disk into state.json
    const st1 = await loadStateJson(root, session_id, pipeline_id, "sub-1");
    const ph1 = st1.phases.find((p) => p.phase === "01-validation")!;
    expect(ph1.nodes.length).toBe(1);
    expect(ph1.nodes[0]!.name).toBe("prd-draft");

    const confirmed = await phase.confirm({
      session_id, pipeline_id, sub_pipeline_id: "sub-1", phase: "01-validation",
    });
    // THE key assertion: NOT short-circuited. We get groups + flow_next=node_start
    expect(confirmed.groups.length).toBeGreaterThan(0);
    expect(confirmed.flow_next.tool).toBe("opc_node_start");
    expect(confirmed.flow_next.args?.node_name).toBe("prd-draft");

    // node_start: body must be non-null (loadNodeBody fallback reads disk)
    const node = new NodeServer({ root, now: NOW, pid: () => 1234, uuid: UUID });
    const ns = await node.start({
      session_id, pipeline_id, sub_pipeline_id: "sub-1",
      phase: "01-validation", node_name: "prd-draft",
    });
    expect(ns.dispatch_instruction.node_body).toBeTruthy();
    expect(ns.dispatch_instruction.node_body).toContain("PRD work here");

    // flow state consistency: node_start pushes a history entry (it does not
    // rewrite current_step — that stays phase_confirmed; the host owns dispatch)
    const flowState = await loadFlowState(root, session_id);
    const last = flowState.history[flowState.history.length - 1];
    expect(last?.tool).toBe("opc_node_start");
    expect(flowState.current_pipeline_pointer?.node).toBe("prd-draft");
  });
});
