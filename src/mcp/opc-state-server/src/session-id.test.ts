import { describe, expect, it } from "vitest";

import {
  deriveSessionId,
  deriveSessionIdFromDate,
  isStdioDerivedSessionId,
  parseSessionId,
} from "./session-id.js";

describe("session-id (C1 derivation)", () => {
  it("derives sess-<pid>-<ts> in the spec format", () => {
    expect(deriveSessionId({ pid: 12345, started_at_unix_ts: 1_717_840_000 })).toBe(
      "sess-12345-1717840000",
    );
  });

  it("derives from Date with seconds resolution", () => {
    const d = new Date("2026-06-10T00:00:00Z");
    expect(deriveSessionIdFromDate(7777, d)).toBe(`sess-7777-${Math.floor(d.getTime() / 1000)}`);
  });

  it("round-trips parseSessionId", () => {
    const id = deriveSessionId({ pid: 42, started_at_unix_ts: 1700000000 });
    expect(parseSessionId(id)).toEqual({ pid: 42, started_at_unix_ts: 1700000000 });
  });

  it("parseSessionId returns null for legacy random uuids", () => {
    expect(parseSessionId("sess-deadbeef")).toBeNull();
    expect(parseSessionId("sess-12345-abc")).toBeNull();
  });

  it("rejects non-positive pid / ts", () => {
    expect(() => deriveSessionId({ pid: 0, started_at_unix_ts: 1 })).toThrow();
    expect(() => deriveSessionId({ pid: 1, started_at_unix_ts: 0 })).toThrow();
    expect(() => deriveSessionId({ pid: -1, started_at_unix_ts: 1 })).toThrow();
  });

  it("rejects non-integer pid / ts", () => {
    expect(() => deriveSessionId({ pid: 1.5, started_at_unix_ts: 1 })).toThrow();
    expect(() => deriveSessionId({ pid: 1, started_at_unix_ts: 1.5 })).toThrow();
  });

  it("isStdioDerivedSessionId distinguishes derived vs random", () => {
    expect(isStdioDerivedSessionId("sess-1-1")).toBe(true);
    expect(isStdioDerivedSessionId("sess-abc")).toBe(false);
  });
});
