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

// ---------------------------------------------------------------------------
// Valid states
// ---------------------------------------------------------------------------

describe("createContext — valid states", () => {
  it("returns the full context shape with all required properties", () => {
    const ctx = createContext(makeFakeOpts({ id: "user-1", role: "member" }));

    expect(ctx).toHaveProperty("user");
    expect(ctx).toHaveProperty("request");
    expect(ctx).toHaveProperty("reply");
    expect(ctx).toHaveProperty("hasRole");
    expect(typeof ctx.hasRole).toBe("function");
  });

  it("preserves the exact request and reply references", () => {
    const opts = makeFakeOpts({ id: "user-1", role: "member" });
    const ctx = createContext(opts);

    expect(ctx.request).toBe(opts.req);
    expect(ctx.reply).toBe(opts.res);
  });

  it("sets user to the object from req.user when present", () => {
    const user = { id: "user-1", role: "member" };
    const ctx = createContext(makeFakeOpts(user));

    expect(ctx.user).toEqual(user);
  });

  it("sets user to null when req.user is null", () => {
    const ctx = createContext(makeFakeOpts(null));
    expect(ctx.user).toBeNull();
  });

  it("sets user to null when req.user is undefined", () => {
    const ctx = createContext(makeFakeOpts(undefined));
    expect(ctx.user).toBeNull();
  });

  it("hasRole returns true when the user role matches exactly", () => {
    const adminCtx = createContext(makeFakeOpts({ id: "u1", role: "admin" }));
    expect(adminCtx.hasRole("admin")).toBe(true);

    const memberCtx = createContext(makeFakeOpts({ id: "u2", role: "member" }));
    expect(memberCtx.hasRole("member")).toBe(true);
  });

  it("hasRole returns false when the user role does not match", () => {
    const ctx = createContext(makeFakeOpts({ id: "u1", role: "member" }));

    expect(ctx.hasRole("admin")).toBe(false);
    expect(ctx.hasRole("moderator")).toBe(false);
    expect(ctx.hasRole("")).toBe(false);
  });

  it("hasRole returns false for any role when user is null", () => {
    const ctx = createContext(makeFakeOpts(null));

    expect(ctx.hasRole("admin")).toBe(false);
    expect(ctx.hasRole("member")).toBe(false);
    expect(ctx.hasRole("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid / error states
// ---------------------------------------------------------------------------

describe("createContext — error recovery (CVE-2025-43855 pattern)", () => {
  it("returns an unauthenticated context and logs a warning when req.user getter throws an Error", () => {
    const warnMock = vi.fn();
    const fakeRes = {} as unknown as CreateFastifyContextOptions["res"];

    // Simulate a malformed WebSocket connectionParams payload.
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
      res: fakeRes,
      info: {} as unknown as CreateFastifyContextOptions["info"],
    });

    expect(ctx.user).toBeNull();
    expect(ctx.hasRole("admin")).toBe(false);
    expect(ctx.hasRole("member")).toBe(false);
    expect(warnMock).toHaveBeenCalledOnce();
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "tRPC createContext failed — returning unauthenticated context",
    );
  });

  it("still preserves request and reply references in the fallback context", () => {
    const warnMock = vi.fn();
    const fakeRes = {} as unknown as CreateFastifyContextOptions["res"];

    const throwingReq = Object.defineProperty(
      { log: { warn: warnMock } },
      "user",
      {
        get() {
          throw new Error("boom");
        },
      },
    ) as unknown as CreateFastifyContextOptions["req"];

    const ctx = createContext({
      req: throwingReq,
      res: fakeRes,
      info: {} as unknown as CreateFastifyContextOptions["info"],
    });

    expect(ctx.request).toBe(throwingReq);
    expect(ctx.reply).toBe(fakeRes);
  });

  it("handles a non-Error thrown value and still returns an unauthenticated context", () => {
    const warnMock = vi.fn();

    const throwingReq = Object.defineProperty(
      { log: { warn: warnMock } },
      "user",
      {
        get() {
          throw "unexpected string thrown";
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
  });
});
