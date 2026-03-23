import * as authExports from "./index.js";
import { describe, expect, it } from "vitest";

describe("auth/src/index re-exports", () => {
  it("re-exports createAuth", () => {
    expect(typeof authExports.createAuth).toBe("function");
  });

  it("re-exports createAuthClient", () => {
    expect(typeof authExports.createAuthClient).toBe("function");
  });

  it("re-exports authPlugin", () => {
    expect(authExports.authPlugin).toBeDefined();
  });

  it("re-exports requireAuth and requireAdmin hooks", () => {
    expect(typeof authExports.requireAuth).toBe("function");
    expect(typeof authExports.requireAdmin).toBe("function");
  });
});
