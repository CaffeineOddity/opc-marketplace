import { describe, expect, it } from "vitest";

import { SERVER_NAME } from "./index.js";

describe("opc-knowledge-server skeleton", () => {
  it("exposes its server name", () => {
    expect(SERVER_NAME).toBe("opc-knowledge-server");
  });
});
