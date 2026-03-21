import { createContext } from "./context.js";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { describe, expect, it } from "vitest";

function makeFakeOpts(
  user?: { id: string; role: string } | null,
): CreateFastifyContextOptions {
  return {
    req: {
      user: user ?? null,
    } as unknown as CreateFastifyContextOptions["req"],
    res: {} as unknown as CreateFastifyContextOptions["res"],
    info: {} as unknown as CreateFastifyContextOptions["info"],
  };
}

describe("createContext", () => {
  it("should return a context with user when present on the request", () => {
    const user = { id: "user-1", role: "member" };
    const ctx = createContext(makeFakeOpts(user));

    expect(ctx.user).toEqual(user);
    expect(ctx.request).toBeDefined();
    expect(ctx.reply).toBeDefined();
  });

  it("should return null user when no user on the request", () => {
    const ctx = createContext(makeFakeOpts(null));
    expect(ctx.user).toBeNull();
  });

  it("should return null user when user is undefined on the request", () => {
    const ctx = createContext(makeFakeOpts(undefined));
    expect(ctx.user).toBeNull();
  });

  it("should provide a hasRole helper that checks the user role", () => {
    const ctx = createContext(makeFakeOpts({ id: "user-1", role: "admin" }));

    expect(ctx.hasRole("admin")).toBe(true);
    expect(ctx.hasRole("member")).toBe(false);
  });

  it("should return false from hasRole when user is null", () => {
    const ctx = createContext(makeFakeOpts(null));
    expect(ctx.hasRole("admin")).toBe(false);
  });
});
