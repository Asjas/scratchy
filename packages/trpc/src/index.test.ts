import * as indexExports from "./index.js";
import { describe, expect, it } from "vitest";

describe("trpc/src/index re-exports", () => {
  it("re-exports router, publicProcedure, middleware, TRPCError", () => {
    expect(typeof indexExports.router).toBe("function");
    expect(typeof indexExports.publicProcedure).toBe("object");
    expect(typeof indexExports.middleware).toBe("function");
    expect(indexExports.TRPCError).toBeDefined();
  });

  it("re-exports createContext", () => {
    expect(typeof indexExports.createContext).toBe("function");
  });

  it("re-exports middleware helpers", () => {
    expect(indexExports.isAuthenticated).toBeDefined();
    expect(indexExports.isAdmin).toBeDefined();
    expect(indexExports.isOwner).toBeDefined();
    expect(indexExports.isOwnerOrAdmin).toBeDefined();
    expect(indexExports.protectedProcedure).toBeDefined();
  });

  it("re-exports createClient", () => {
    expect(typeof indexExports.createClient).toBe("function");
  });
});
