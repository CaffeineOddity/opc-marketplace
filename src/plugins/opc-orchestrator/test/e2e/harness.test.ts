/**
 * M14.a smoke test: harness boots cleanly, all 7 servers respond, recorder
 * captures one round-trip end-to-end. Anchors the e2e suite — if this fails
 * later subletter scenarios won't even reach their assertions.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

describe("e2e harness", () => {
  it("boots all servers with deterministic clock + recorder", async () => {
    expect(app.root).toMatch(/opc-e2e-/);
    expect(app.knowledge).toBeDefined();
    expect(app.flow).toBeDefined();
    expect(app.pipeline).toBeDefined();
    expect(app.phase).toBeDefined();
    expect(app.node).toBeDefined();
    expect(app.reflection).toBeDefined();
    expect(app.corrections).toBeDefined();
    expect(app.clock.now().toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });

  it("flow.query on empty root returns active=false-style state without crashing", async () => {
    // Smoke: invoke a real server method through the recorder.
    // FlowServer.query requires an existing session_id, so we start one first.
    const started = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "start", initial_message: "harness boot" },
      () => app.flow.lifecycle({ action: "start", initial_message: "harness boot" }),
    );
    expect(started.state.status).toBe("in_progress");
    expect(started.next).toEqual({ tool: "opc_flow_step_complete", step: "intent_analysis" });

    const q = await app.recorder.record(
      "opc-state-server",
      "opc_flow_query",
      { session_id: started.state.session_id },
      () => app.flow.query({ session_id: started.state.session_id }),
    );
    expect(q.state.session_id).toBe(started.state.session_id);

    const calls = app.recorder.freeze();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.tool).toBe("opc_flow_lifecycle");
    expect(calls[1]?.tool).toBe("opc_flow_query");
    expect(calls.every((c) => !c.error)).toBe(true);
  });

  it("knowledge.read on empty unit returns null-content (smoke)", async () => {
    const r = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_read",
      { mode: "single", unit: "user-auth", section: "design", sub: "api-spec" },
      () =>
        app.knowledge.read({
          mode: "single",
          unit: "user-auth",
          section: "design",
          sub: "api-spec",
        }),
    );
    expect(r.mode).toBe("single");
    if (r.mode === "single") {
      expect(r.content).toBeNull();
      expect(r.version).toBeNull();
    }
  });
});
