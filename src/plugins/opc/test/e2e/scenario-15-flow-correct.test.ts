/**
 * M21.a: Scenario 15 — opc_flow_correct discriminator actions.
 *
 * Exercises all 3 actions of opc_flow_correct:
 *   - revise: patch accumulated fields
 *   - restart: reset to a prior step with downstream clearance
 *   - phase_reset: change pipeline pointer + record intervention
 *
 * Sequence:
 *  1. lifecycle.start → step_complete(intent_analysis) → revise complexity
 *  2. step_complete(task_analysis) → restart to intent_analysis
 *  3. brief → pipeline_create → phase_reset pointer change
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadFlowState } from "@opc/state-server";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

describe("scenario 15 — opc_flow_correct", () => {
  describe("revise", () => {
    it("patches accumulated fields via opc_flow_correct({action:\"revise\"})", async () => {
      const started = await app.flow.lifecycle({
        action: "start",
        initial_message: "实现用户认证",
      });
      const session_id = started.state.session_id;

      await app.flow.stepComplete({
        step: "intent_analysis",
        session_id,
        intent: "task",
      });

      // Complete task_analysis first to populate analysis_result
      await app.flow.stepComplete({
        step: "task_analysis",
        session_id,
        analysis_result: {
          description: "实现用户认证",
          complexity: "medium",
          knowledge_unit: ["user-auth"],
          scenario: "add-feature",
        },
      });

      // Revise: change analysis_result via patch
      const revised = await app.recorder.record(
        "opc-state-server",
        "opc_flow_correct",
        {
          action: "revise",
          session_id,
          patch: { analysis_result: { complexity: "high", scenario: "greenfield" } },
        },
        () =>
          app.flow.correct({
            action: "revise",
            session_id,
            patch: { analysis_result: { complexity: "high", scenario: "greenfield" } },
          }),
      );

      expect(revised.intervention_id).toMatch(/^intv-/);
      // After correct, computeNext returns the step_complete route for the current step
      expect(revised.next.tool).toBe("opc_flow_step_complete");

      // The accumulated fields should be patched (analysis_result replaced via Object.assign)
      const flowState = await loadFlowState(app.root, session_id);
      expect(flowState.accumulated.analysis_result?.complexity).toBe("high");
      expect(flowState.accumulated.analysis_result?.scenario).toBe("greenfield");

      // Verify intervention recorded
      const intervention = flowState.user_interventions.find(
        (i) => i.intervention_id === revised.intervention_id,
      );
      expect(intervention?.trigger).toBe("user_initiated_revise");

      const calls = app.recorder.freeze();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.tool).toBe("opc_flow_correct");
    });

    it("revise accumulates multiple patches idempotently", async () => {
      const started = await app.flow.lifecycle({
        action: "start",
        initial_message: "修复登录",
      });
      const session_id = started.state.session_id;

      await app.flow.stepComplete({
        step: "intent_analysis",
        session_id,
        intent: "task",
      });
      await app.flow.stepComplete({
        step: "task_analysis",
        session_id,
        analysis_result: {
          description: "修复登录",
          complexity: "low",
          knowledge_unit: ["login"],
        },
      });

      // First patch — replaces analysis_result
      await app.flow.correct({
        action: "revise",
        session_id,
        patch: { analysis_result: { complexity: "medium" } },
      });

      // Second patch — should replace analysis_result
      await app.flow.correct({
        action: "revise",
        session_id,
        patch: { analysis_result: { complexity: "medium", knowledge_unit: ["user-auth"] } },
      });

      const flowState = await loadFlowState(app.root, session_id);
      expect(flowState.accumulated.analysis_result?.complexity).toBe("medium");
      expect(flowState.accumulated.analysis_result?.knowledge_unit).toEqual(["user-auth"]);
      expect(flowState.user_interventions).toHaveLength(2);
    });
  });

  describe("restart", () => {
    it("resets to a prior step and clears downstream accumulated fields", async () => {
      const started = await app.flow.lifecycle({
        action: "start",
        initial_message: "实现商品搜索",
      });
      const session_id = started.state.session_id;

      await app.flow.stepComplete({
        step: "intent_analysis",
        session_id,
        intent: "task",
      });

      // Push some data into task_analysis accumulated
      const taDone = await app.flow.stepComplete({
        step: "task_analysis",
        session_id,
        analysis_result: {
          description: "product search",
          complexity: "medium",
          suggested_phases: ["04-implement-design", "05-implement"],
          knowledge_unit: ["product-search"],
          scenario: "add-feature",
        },
      });
      expect(taDone.state.accumulated.analysis_result?.complexity).toBe("medium");

      // Also complete task_decomposition
      await app.flow.stepComplete({
        step: "task_decomposition",
        session_id,
        sub_pipelines: [
          { id: "sub-1", description: "search", phases: ["04-implement-design", "05-implement"] },
        ],
      });

      // Restart to intent_analysis — downstream fields should be cleared
      const restarted = await app.recorder.record(
        "opc-state-server",
        "opc_flow_correct",
        {
          action: "restart",
          session_id,
          reset_to_step: "intent_analysis",
          additional_input: "重新分析：需要全文搜索而非简单搜索",
        },
        () =>
          app.flow.correct({
            action: "restart",
            session_id,
            reset_to_step: "intent_analysis",
            additional_input: "重新分析：需要全文搜索而非简单搜索",
          }),
      );

      expect(restarted.intervention_id).toMatch(/^intv-/);
      expect(restarted.next.tool).toBe("opc_flow_step_complete");
      expect("step" in restarted.next && restarted.next.step).toBe("intent_analysis");

      // Verify state
      const flowState = await loadFlowState(app.root, session_id);
      expect(flowState.current_step).toBe("intent_analysis");
      // Downstream accumulated fields from task_analysis/task_decomposition should be cleared
      expect(flowState.accumulated.analysis_result).toBeNull();
      expect(flowState.accumulated.decomposition_result).toBeNull();
      // additional_input should be pushed into message history
      expect(flowState.user_message_history).toContain("重新分析：需要全文搜索而非简单搜索");

      const intervention = flowState.user_interventions.find(
        (i) => i.intervention_id === restarted.intervention_id,
      );
      expect(intervention?.trigger).toBe("user_initiated_restart");

      const calls = app.recorder.freeze();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.tool).toBe("opc_flow_correct");
    });
  });

  describe("phase_reset", () => {
    it("changes pipeline_pointer and records a phase_reset intervention", async () => {
      const started = await app.flow.lifecycle({
        action: "start",
        initial_message: "重构会话管理",
      });
      const session_id = started.state.session_id;

      await app.flow.stepComplete({
        step: "intent_analysis",
        session_id,
        intent: "task",
      });
      await app.flow.stepComplete({
        step: "task_analysis",
        session_id,
        analysis_result: {
          description: "refactor session",
          complexity: "medium",
          suggested_phases: ["04-implement-design", "05-implement"],
          knowledge_unit: ["session"],
          scenario: "refactor",
        },
      });
      await app.flow.stepComplete({
        step: "task_decomposition",
        session_id,
        sub_pipelines: [
          { id: "sub-1", description: "session refactor", phases: ["04-implement-design", "05-implement"] },
        ],
      });
      await app.flow.stepComplete({
        step: "brief_generation",
        session_id,
        brief_content: "refactor session management",
      });
      const created = await app.pipeline.create({
        session_id,
        description: "refactor session",
        brief_content: "refactor session mgmt",
        complexity: "medium",
        knowledge_unit: ["session"],
        suggested_phases: ["04-implement-design", "05-implement"],
        phase_selection_rationale: "refactor",
        sub_pipelines: [
          {
            id: "sub-1",
            title: "session refactor",
            knowledge_unit: ["session"],
            suggested_phases: ["04-implement-design", "05-implement"],
          },
        ],
      });

      // Start phase 04 and a node
      await app.phase.start({
        session_id,
        pipeline_id: created.pipeline_id,
        sub_pipeline_id: "sub-1",
        phase: "04-implement-design",
      });

      // Now call flow_correct with phase_reset to redirect pipeline pointer
      const corrected = await app.recorder.record(
        "opc-state-server",
        "opc_flow_correct",
        {
          action: "phase_reset",
          session_id,
          pipeline_pointer: {
            pipeline_id: created.pipeline_id,
            sub_pipeline_id: "sub-1",
            phase: "04-implement-design",
            node: "api-design",
          },
        },
        () =>
          app.flow.correct({
            action: "phase_reset",
            session_id,
            pipeline_pointer: {
              pipeline_id: created.pipeline_id,
              sub_pipeline_id: "sub-1",
              phase: "04-implement-design",
              node: "api-design",
            },
          }),
      );

      expect(corrected.intervention_id).toMatch(/^intv-/);

      const flowState = await loadFlowState(app.root, session_id);
      expect(flowState.current_pipeline_pointer?.pipeline_id).toBe(created.pipeline_id);
      expect(flowState.current_pipeline_pointer?.phase).toBe("04-implement-design");
      expect(flowState.current_pipeline_pointer?.node).toBe("api-design");

      const intervention = flowState.user_interventions.find(
        (i) => i.intervention_id === corrected.intervention_id,
      );
      expect(intervention?.trigger).toBe("user_initiated_phase_reset");

      // Verify history entry
      const histEntry = flowState.history.find(
        (h) => h.tool === "opc_flow_correct",
      );
      expect(histEntry).toBeDefined();

      const calls = app.recorder.freeze();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.error).toBeUndefined();
    });
  });
});
