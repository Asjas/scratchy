import { createContext } from "./context.js";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { describe, expect, it, vi } from "vitest";

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

  it("should return an unauthenticated context and log a warning when context creation throws", () => {
    const warnMock = vi.fn();

    // Construct a request object where accessing `user` throws, simulating a
    // malformed WebSocket connectionParams payload (CVE-2025-43855 pattern).
    const throwingReq = Object.defineProperty(
      { log: { warn: warnMock } },
      "user",
      {
        get() {
          throw new Error("connectionParams corrupted");
        },
      },
    ) as unknown as CreateFastifyContextOptions["req"];

    const ctx = createContext({
      req: throwingReq,
      res: {} as unknown as CreateFastifyContextOptions["res"],
      info: {} as unknown as CreateFastifyContextOptions["info"],
    });

    expect(ctx.user).toBeNull();
    expect(ctx.hasRole("admin")).toBe(false);
    expect(warnMock).toHaveBeenCalledOnce();
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "tRPC createContext failed — returning unauthenticated context",
    );
  });
});
