/**
 * M15.b: Scenario 02 — project knowledge question.
 *
 * Doc: doc/feature/04-e2e/02-test/02_project-question.md
 * Input: "我们的用户认证是怎么设计的？"
 *
 * 4 calls:
 *  1. opc_flow_lifecycle({action:"start"})
 *  2. opc_flow_query (active=true after start)
 *  3. opc_flow_step_complete({step:"intent_analysis", intent:"project_question"})
 *     → status=completed; the prereq tool route in real prod is
 *       knowledge_read(mode:"search") — the test runs it as call #4 to
 *       prove the data path works end-to-end.
 *  4. opc_knowledge_read({mode:"search", query:"用户认证设计"}) → snippet hits
 *
 * Knowledge is pre-seeded via opc_knowledge_write so search has hits.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
  // Seed knowledge so search has hits — these would already exist in a
  // running project; M15.b focuses on the flow-side short-circuit, not on
  // knowledge ingest.
  await app.knowledge.write({
    unit: "user-auth",
    section: "login",
    sub: "architecture",
    content:
      "# 用户认证设计\n\n邮箱+密码 → bcrypt 哈希 → JWT token. session 过期 7 天。",
  });
  await app.knowledge.write({
    unit: "user-auth",
    section: "session",
    sub: "api",
    content:
      "## session API\n\nGET /api/session 返回当前用户。POST /api/logout 清除 token。",
  });
});

afterEach(async () => {
  await app.cleanup();
});

describe("scenario 02 — project_question", () => {
  it("intent=project_question short-circuits flow; knowledge_read serves the answer", async () => {
    const initial_message = "我们的用户认证是怎么设计的？";

    // 1: lifecycle.start
    const started = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "start", initial_message },
      () => app.flow.lifecycle({ action: "start", initial_message }),
    );
    const session_id = started.state.session_id;

    // 2: query (active=true)
    const queried = await app.recorder.record(
      "opc-state-server",
      "opc_flow_query",
      { session_id },
      () => app.flow.query({ session_id }),
    );
    expect(queried.state.current_step).toBe("intent_analysis");

    // 3: step_complete(intent_analysis, project_question) → status=completed
    const intentDone = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      {
        step: "intent_analysis",
        session_id,
        intent: "project_question",
        reasoning: "疑问句+项目代词'我们的'，info_seeking 信号",
      },
      () =>
        app.flow.stepComplete({
          step: "intent_analysis",
          session_id,
          intent: "project_question",
          reasoning: "疑问句+项目代词'我们的'，info_seeking 信号",
        }),
    );
    expect(intentDone.state.status).toBe("completed");
    expect(intentDone.state.current_step).toBe("completed");
    expect(intentDone.state.accumulated.intent).toBe("project_question");
    expect(intentDone.next).toEqual({ tool: "completed" });

    // 4: knowledge_read(mode:"search") — proves the answer path is live.
    // Use consistency: "fresh" so the just-written content is indexed
    // before the search runs (the e2e harness writes synchronously then
    // reads, which races the 2s debounce in the reindex worker).
    const search = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_read",
      { mode: "search", query: "用户认证设计", unit: "user-auth", consistency: "fresh" },
      () =>
        app.knowledge.read({
          mode: "search",
          query: "用户认证设计",
          unit: "user-auth",
          consistency: "fresh",
        }),
    );
    if (search.mode !== "search") throw new Error("expected search mode response");
    expect(search.hits.length).toBeGreaterThan(0);
    const hitPaths = search.hits.map((h) => `${h.unit}/${h.section}/${h.sub}`);
    expect(hitPaths).toContain("user-auth/login/architecture");

    const calls = app.recorder.freeze();
    expect(calls.map((c) => `${c.server}:${c.tool}`)).toEqual([
      "opc-state-server:opc_flow_lifecycle",
      "opc-state-server:opc_flow_query",
      "opc-state-server:opc_flow_step_complete",
      "opc-knowledge-server:opc_knowledge_read",
    ]);
    expect(calls.every((c) => !c.error)).toBe(true);
  });
});
