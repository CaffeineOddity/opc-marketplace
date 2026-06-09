import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index.js";

describe("@opc/memory-store skeleton", () => {
  it("exposes its package name", () => {
    expect(PACKAGE_NAME).toBe("@opc/memory-store");
  });
});
