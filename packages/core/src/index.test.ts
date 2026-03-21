import { name } from "./index.js";
import { describe, expect, it } from "vitest";

describe("@scratchy/core", () => {
  it("should export the package name", () => {
    expect(name).toBe("@scratchy/core");
  });
});
