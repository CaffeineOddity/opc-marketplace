import { describe, expect, it } from "vitest";

import {
  TransportArgError,
  TransportConfigError,
  readTransportFromEnv,
  resolveClaudePid,
} from "./transport.js";

describe("transport (C2 mode + pid acquisition)", () => {
  describe("readTransportFromEnv", () => {
    it("defaults to stdio when env unset", () => {
      expect(readTransportFromEnv({})).toBe("stdio");
    });

    it("defaults to stdio when env empty string", () => {
      expect(readTransportFromEnv({ MCP_TRANSPORT: "" })).toBe("stdio");
    });

    it("accepts stdio / http / sse case-insensitive", () => {
      expect(readTransportFromEnv({ MCP_TRANSPORT: "STDIO" })).toBe("stdio");
      expect(readTransportFromEnv({ MCP_TRANSPORT: "Http" })).toBe("http");
      expect(readTransportFromEnv({ MCP_TRANSPORT: "sse" })).toBe("sse");
    });

    it("throws on unknown transport", () => {
      expect(() => readTransportFromEnv({ MCP_TRANSPORT: "websocket" })).toThrow(
        TransportConfigError,
      );
    });
  });

  describe("resolveClaudePid stdio mode", () => {
    it("uses ppid by default", () => {
      const r = resolveClaudePid({ transport: "stdio", ppid: () => 4242 });
      expect(r).toEqual({ pid: 4242, source: "stdio_ppid" });
    });

    it("rejects explicit claude_pid in stdio mode (spec §2.3 line 113)", () => {
      expect(() =>
        resolveClaudePid({ transport: "stdio", claude_pid: 999, ppid: () => 4242 }),
      ).toThrow(TransportArgError);
    });

    it("throws when ppid resolves to invalid pid", () => {
      expect(() => resolveClaudePid({ transport: "stdio", ppid: () => 0 })).toThrow(
        TransportConfigError,
      );
      expect(() => resolveClaudePid({ transport: "stdio", ppid: () => -1 })).toThrow(
        TransportConfigError,
      );
    });
  });

  describe("resolveClaudePid http/sse mode", () => {
    it("uses explicit claude_pid when provided (http)", () => {
      const r = resolveClaudePid({
        transport: "http",
        claude_pid: 7777,
        serverPid: () => 1,
      });
      expect(r).toEqual({ pid: 7777, source: "http_explicit" });
    });

    it("uses explicit claude_pid when provided (sse)", () => {
      const r = resolveClaudePid({
        transport: "sse",
        claude_pid: 8888,
        serverPid: () => 1,
      });
      expect(r).toEqual({ pid: 8888, source: "http_explicit" });
    });

    it("falls back to server pid when claude_pid omitted (http)", () => {
      const r = resolveClaudePid({ transport: "http", serverPid: () => 5555 });
      expect(r).toEqual({ pid: 5555, source: "http_fallback" });
    });

    it("rejects non-positive claude_pid in http mode", () => {
      expect(() => resolveClaudePid({ transport: "http", claude_pid: 0 })).toThrow(
        TransportArgError,
      );
      expect(() => resolveClaudePid({ transport: "http", claude_pid: -1 })).toThrow(
        TransportArgError,
      );
    });

    it("rejects non-integer claude_pid", () => {
      expect(() => resolveClaudePid({ transport: "sse", claude_pid: 1.5 })).toThrow(
        TransportArgError,
      );
    });
  });
});
