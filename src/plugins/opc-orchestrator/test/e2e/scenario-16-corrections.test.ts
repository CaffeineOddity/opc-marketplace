/**
 * M21.b: Scenario 16 — opc_corrections CRUD operations.
 *
 * Exercises the corrections store through the CorrectionsServer:
 *   - create: write a new correction via upsert
 *   - query: list corrections by step with keyword ranking
 *   - merge: update an existing correction via upsert with merge
 *   - crud facade: unified dispatch for query/record/unlearn/reindex
 *
 * The corrections store feeds corrections from L1 (intervention) into
 * L2 (session-scoped) and L3 (global). This test validates the storage
 * layer and server methods that the reflection sub-agents depend on.
 */

import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CorrectionsServer,
  correctionsRoot,
} from "@opc/reflection-server";

import { bootstrap, makeClock, makeRecorder, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

const stepId = "P5" as const; // node_selection / implementation

function makeCorrection(overrides?: Record<string, unknown>) {
  return {
    step: stepId,
    unit: "user-auth",
    section: "session",
    subsection: "token-generation",
    lesson: "Always store tokens with an explicit TTL; default to 15 minutes.",
    rationale: "Observed in 3 interventions during reflection rounds.",
    applies_when: {
      keywords: ["jwt", "token", "session", "auth"],
      phase_id: ["05-implement"],
      step: "P5",
    },
    source: "user" as const,
    trigger: "intervention" as const,
    ...overrides,
  };
}

describe("scenario 16 — opc_corrections", () => {
  describe("create", () => {
    it("writes a correction via upsert and stores it on disk", async () => {
      const resp = await app.recorder.record(
        "opc-reflection-server",
        "opc_corrections",
        { action: "record", batch: [{ operation: "create", correction: makeCorrection() }] },
        () =>
          app.corrections.upsert({
            batch: [{ operation: "create", correction: makeCorrection() }],
          }),
      );

      expect(resp.new_count).toBe(1);
      expect(resp.merged_count).toBe(0);
      expect(resp.written_ids).toHaveLength(1);
      expect(resp.written_ids[0]).toMatch(/^corr-/);

      // Verify on disk
      const root = correctionsRoot(app.root);
      const files = await readdir(join(root, "user-auth", "session", "token-generation"));
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      expect(jsonFiles).toHaveLength(1);

      const content = await readFile(
        join(root, "user-auth", "session", "token-generation", jsonFiles[0]!),
        "utf8",
      );
      const saved = JSON.parse(content);
      expect(saved.lesson).toContain("TTL");
      expect(saved.step).toBe("P5");
      expect(saved.source).toBe("user");
      expect(saved.schema_version).toBeGreaterThanOrEqual(2);
    });

    it("rejects a correction without a lesson", async () => {
      const resp = await app.corrections.upsert({
        batch: [
          {
            operation: "create",
            correction: { ...makeCorrection(), lesson: "" },
          },
        ],
      });
      expect(resp.skipped_count).toBe(1);
      expect(resp.skip_reasons[0]).toContain("lesson required");
    });

    it("rejects a correction without unit/section/subsection", async () => {
      const resp = await app.corrections.upsert({
        batch: [
          {
            operation: "create",
            correction: { ...makeCorrection(), unit: "" },
          },
        ],
      });
      expect(resp.skipped_count).toBe(1);
      expect(resp.skip_reasons[0]).toContain("unit/section/subsection required");
    });

    it("creates multiple corrections in one batch", async () => {
      const resp = await app.corrections.upsert({
        batch: [
          { operation: "create", correction: makeCorrection() },
          {
            operation: "create",
            correction: makeCorrection({
              subsection: "refresh-token",
              lesson: "Never store refresh tokens in localStorage.",
            }),
          },
          {
            operation: "create",
            correction: makeCorrection({
              subsection: "csrf",
              lesson: "All state-changing endpoints must validate CSRF tokens.",
            }),
          },
        ],
      });

      expect(resp.new_count).toBe(3);
      expect(resp.written_ids).toHaveLength(3);

      // All 3 should be on disk
      const root = correctionsRoot(app.root);
      const files1 = await readdir(join(root, "user-auth", "session", "token-generation"));
      const files2 = await readdir(join(root, "user-auth", "session", "refresh-token"));
      const files3 = await readdir(join(root, "user-auth", "session", "csrf"));
      expect(files1.filter((f) => f.endsWith(".json"))).toHaveLength(1);
      expect(files2.filter((f) => f.endsWith(".json"))).toHaveLength(1);
      expect(files3.filter((f) => f.endsWith(".json"))).toHaveLength(1);
    });
  });

  describe("query", () => {
    it("returns corrections matching a step ordered by hotness", async () => {
      // Create two corrections for the same step
      await app.corrections.upsert({
        batch: [
          { operation: "create", correction: makeCorrection({ hotness: 3 }) },
          {
            operation: "create",
            correction: makeCorrection({
              id: "corr-002",
              subsection: "session-expiry",
              lesson: "Sessions must expire after inactivity.",
              hotness: 10,
            }),
          },
        ],
      });

      const resp = await app.recorder.record(
        "opc-reflection-server",
        "opc_corrections",
        { action: "query", step: stepId },
        () => app.corrections.query({ step: stepId }),
      );

      expect(resp.total).toBe(2);
      expect(resp.items).toHaveLength(2);
      // Higher hotness first
      expect(resp.items[0]!.hotness).toBeGreaterThanOrEqual(resp.items[1]!.hotness);
    });

    it("ranks by keyword overlap then hotness", async () => {
      await app.corrections.upsert({
        batch: [
          {
            operation: "create",
            correction: makeCorrection({
              applies_when: { keywords: ["jwt"] },
              hotness: 1,
            }),
          },
          {
            operation: "create",
            correction: makeCorrection({
              subsection: "csrf",
              lesson: "Validate CSRF.",
              applies_when: { keywords: ["csrf", "security"] },
              hotness: 5,
            }),
          },
        ],
      });

      // Query with "jwt" keyword — should rank JWT correction first
      const resp = await app.corrections.query({
        step: stepId,
        keywords: ["jwt"],
      });

      expect(resp.total).toBe(2);
      expect(resp.items[0]!.applies_when.keywords).toContain("jwt");
    });

    it("returns empty when no corrections exist for a step", async () => {
      const resp = await app.corrections.query({
        step: "P1",
      });

      expect(resp.total).toBe(0);
      expect(resp.items).toHaveLength(0);
    });

    it("respects the limit parameter", async () => {
      // perSectionCap=5 so max 5 non-frozen corrections per (step,unit,section)
      const batch = Array.from({ length: 5 }, (_, i) => ({
        operation: "create" as const,
        correction: makeCorrection({
          subsection: `sub-${i}`,
          lesson: `Lesson ${i}`,
        }),
      }));
      await app.corrections.upsert({ batch });

      const resp = await app.corrections.query({ step: stepId, limit: 3 });
      expect(resp.total).toBe(5);
      expect(resp.items).toHaveLength(3);
    });
  });

  describe("merge", () => {
    it("merges updates into an existing correction", async () => {
      // Create first
      const created = await app.corrections.upsert({
        batch: [{ operation: "create", correction: makeCorrection() }],
      });
      const matchId = created.written_ids[0]!;

      // Merge: add linked interventions and update keywords
      const merged = await app.recorder.record(
        "opc-reflection-server",
        "opc_corrections",
        { action: "record", batch: [{ operation: "merge", match_id: matchId, correction: makeCorrection() }] },
        () =>
          app.corrections.upsert({
            batch: [
              {
                operation: "merge",
                match_id: matchId,
                correction: {
                  ...makeCorrection(),
                  linked_interventions: [
                    {
                      ts: new Date().toISOString(),
                      intervention_id: "intv-test-1",
                      trigger: "intervention",
                    },
                  ],
                  applies_when: {
                    keywords: ["jwt", "token", "session", "auth", "oauth"],
                    phase_id: ["05-implement"],
                  },
                },
              },
            ],
          }),
      );

      expect(merged.merged_count).toBe(1);
      expect(merged.written_ids).toContain(matchId);

      // Query to verify merged content
      const resp = await app.corrections.query({ step: stepId });
      const item = resp.items.find((c) => c.id === matchId);
      expect(item).toBeDefined();
      expect(item!.applies_when.keywords).toContain("oauth");
      expect(item!.linked_interventions).toHaveLength(1);
      expect(item!.hotness).toBeGreaterThan(1); // hotness incremented
    });

    it("rejects merge without match_id", async () => {
      const resp = await app.corrections.upsert({
        batch: [{ operation: "merge", correction: makeCorrection() }],
      });
      expect(resp.skipped_count).toBe(1);
      expect(resp.skip_reasons[0]).toContain("merge requires match_id");
    });
  });

  describe("crud facade", () => {
    it("dispatches query through the unified crud method", async () => {
      // Pre-populate
      await app.corrections.upsert({
        batch: [{ operation: "create", correction: makeCorrection() }],
      });

      const resp = await app.corrections.crud({
        action: "query",
        step: stepId,
      });

      expect(resp.action).toBe("query");
      if (resp.action === "query") {
        expect(resp.total).toBe(1);
        expect(resp.items[0]!.lesson).toContain("TTL");
      }
    });

    it("dispatches record (create) through the unified crud method", async () => {
      const resp = await app.corrections.crud({
        action: "record",
        batch: [{ operation: "create", correction: makeCorrection() }],
      });

      expect(resp.action).toBe("record");
      if (resp.action === "record") {
        expect(resp.new_count).toBe(1);
      }
    });

    it("unlearns an existing correction", async () => {
      // Create a correction first
      const created = await app.corrections.upsert({
        batch: [{ operation: "create", correction: makeCorrection() }],
      });
      const correctionId = created.written_ids[0]!;

      const resp = await app.corrections.crud({
        action: "unlearn",
        correction_id: correctionId,
      });
      expect(resp.action).toBe("unlearn");
      if (resp.action === "unlearn") {
        expect(resp.tombstoned_id).toBe(correctionId);
        expect(resp.frozen).toBe(true);
        expect(resp.reason).toContain("manual unlearn");
      }

      // Verify the correction is now frozen and deprecated
      const q = await app.corrections.query({ step: stepId });
      expect(q.items.find((c) => c.id === correctionId)).toBeUndefined();
    });

    it("runs reindex and returns indexed count", async () => {
      // Pre-populate a correction so there's something to index
      await app.corrections.upsert({
        batch: [{ operation: "create", correction: makeCorrection() }],
      });

      const resp = await app.corrections.crud({
        action: "reindex",
        scope: "all",
      });
      expect(resp.action).toBe("reindex");
      if (resp.action === "reindex") {
        expect(resp.indexed).toBeGreaterThanOrEqual(1);
        expect(resp.duration_ms).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
