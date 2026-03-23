import * as indexExports from "./index.js";
import { describe, expect, it } from "vitest";

describe("drizzle/src/index re-exports", () => {
  it("re-exports createPool", () => {
    expect(typeof indexExports.createPool).toBe("function");
  });

  it("re-exports createSchema", () => {
    expect(typeof indexExports.createSchema).toBe("function");
  });

  it("re-exports timestamps", () => {
    expect(indexExports.timestamps).toBeDefined();
    expect(typeof indexExports.timestamps).toBe("object");
  });

  it("re-exports createDrizzleConfig", () => {
    expect(typeof indexExports.createDrizzleConfig).toBe("function");
  });
});
