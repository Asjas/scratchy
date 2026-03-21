import type { Context, User } from "./context.js";
import {
  isAdmin,
  isAuthenticated,
  isOwner,
  isOwnerOrAdmin,
  protectedProcedure,
} from "./middleware.js";
import { publicProcedure, router } from "./trpc.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Create a minimal context for testing middleware. */
function makeCtx(user: User | null): Context {
  return {
    request: {} as Context["request"],
    reply: {} as Context["reply"],
    user,
    hasRole: (role: string) => user?.role === role,
  };
}

describe("isAuthenticated middleware", () => {
  const testRouter = router({
    secret: publicProcedure.use(isAuthenticated).query(({ ctx }) => {
      return { userId: ctx.user.id };
    }),
  });

  const caller = testRouter.createCaller;

  it("should allow authenticated users", async () => {
    const ctx = makeCtx({ id: "user-1", role: "member" });
    const result = await caller(ctx).secret();
    expect(result).toEqual({ userId: "user-1" });
  });

  it("should reject unauthenticated users with UNAUTHORIZED", async () => {
    const ctx = makeCtx(null);
    await expect(caller(ctx).secret()).rejects.toThrow(
      "You must be logged in to access this endpoint",
    );
  });
});

describe("isAdmin middleware", () => {
  const testRouter = router({
    adminOnly: publicProcedure.use(isAdmin).query(({ ctx }) => {
      return { role: ctx.user.role };
    }),
  });

  const caller = testRouter.createCaller;

  it("should allow admin users", async () => {
    const ctx = makeCtx({ id: "admin-1", role: "admin" });
    const result = await caller(ctx).adminOnly();
    expect(result).toEqual({ role: "admin" });
  });

  it("should reject non-admin authenticated users with FORBIDDEN", async () => {
    const ctx = makeCtx({ id: "user-1", role: "member" });
    await expect(caller(ctx).adminOnly()).rejects.toThrow(
      "Admin access required",
    );
  });

  it("should reject unauthenticated users with UNAUTHORIZED", async () => {
    const ctx = makeCtx(null);
    await expect(caller(ctx).adminOnly()).rejects.toThrow(
      "You must be logged in to access this endpoint",
    );
  });
});

describe("isOwner middleware", () => {
  const testRouter = router({
    myResource: publicProcedure
      .input(z.object({ id: z.string() }))
      .use(isOwner)
      .query(({ ctx }) => {
        return { userId: ctx.user.id };
      }),
    myResourceByUserId: publicProcedure
      .input(z.object({ userId: z.string() }))
      .use(isOwner)
      .query(({ ctx }) => {
        return { userId: ctx.user.id };
      }),
  });

  const caller = testRouter.createCaller;

  it("should allow the owner (matching input.id)", async () => {
    const ctx = makeCtx({ id: "user-1", role: "member" });
    const result = await caller(ctx).myResource({ id: "user-1" });
    expect(result).toEqual({ userId: "user-1" });
  });

  it("should allow the owner (matching input.userId)", async () => {
    const ctx = makeCtx({ id: "user-1", role: "member" });
    const result = await caller(ctx).myResourceByUserId({ userId: "user-1" });
    expect(result).toEqual({ userId: "user-1" });
  });

  it("should reject non-owners with FORBIDDEN", async () => {
    const ctx = makeCtx({ id: "user-1", role: "member" });
    await expect(caller(ctx).myResource({ id: "user-2" })).rejects.toThrow(
      "You are not authorized to access this resource",
    );
  });

  it("should reject unauthenticated users with UNAUTHORIZED", async () => {
    const ctx = makeCtx(null);
    await expect(caller(ctx).myResource({ id: "user-1" })).rejects.toThrow(
      "You must be logged in to access this endpoint",
    );
  });
});

describe("isOwnerOrAdmin middleware", () => {
  const testRouter = router({
    resource: publicProcedure
      .input(z.object({ id: z.string() }))
      .use(isOwnerOrAdmin)
      .query(({ ctx }) => {
        return { userId: ctx.user.id };
      }),
  });

  const caller = testRouter.createCaller;

  it("should allow the owner", async () => {
    const ctx = makeCtx({ id: "user-1", role: "member" });
    const result = await caller(ctx).resource({ id: "user-1" });
    expect(result).toEqual({ userId: "user-1" });
  });

  it("should allow an admin even if not the owner", async () => {
    const ctx = makeCtx({ id: "admin-1", role: "admin" });
    const result = await caller(ctx).resource({ id: "user-2" });
    expect(result).toEqual({ userId: "admin-1" });
  });

  it("should reject non-owners who are not admins", async () => {
    const ctx = makeCtx({ id: "user-1", role: "member" });
    await expect(caller(ctx).resource({ id: "user-2" })).rejects.toThrow(
      "You can only access your own data or must be an admin",
    );
  });

  it("should reject unauthenticated users", async () => {
    const ctx = makeCtx(null);
    await expect(caller(ctx).resource({ id: "user-1" })).rejects.toThrow(
      "You must be logged in to access this endpoint",
    );
  });
});

describe("protectedProcedure", () => {
  const testRouter = router({
    profile: protectedProcedure.query(({ ctx }) => {
      return { userId: ctx.user.id };
    }),
  });

  const caller = testRouter.createCaller;

  it("should work for authenticated users", async () => {
    const ctx = makeCtx({ id: "user-1", role: "member" });
    const result = await caller(ctx).profile();
    expect(result).toEqual({ userId: "user-1" });
  });

  it("should reject unauthenticated users", async () => {
    const ctx = makeCtx(null);
    await expect(caller(ctx).profile()).rejects.toThrow(
      "You must be logged in to access this endpoint",
    );
  });
});
