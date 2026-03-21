import { TRPCError, publicProcedure, router } from "./trpc.js";
import { describe, expect, it } from "vitest";

describe("tRPC initialization", () => {
  it("should export router function", () => {
    expect(typeof router).toBe("function");
  });

  it("should export publicProcedure", () => {
    expect(publicProcedure).toBeDefined();
  });

  it("should export TRPCError", () => {
    expect(TRPCError).toBeDefined();
    const error = new TRPCError({ code: "NOT_FOUND", message: "test" });
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("test");
  });

  it("should create a working router with publicProcedure", async () => {
    const appRouter = router({
      hello: publicProcedure.query(() => {
        return { greeting: "hello world" };
      }),
    });

    const caller = appRouter.createCaller({
      request: {} as never,
      reply: {} as never,
      user: null,
      hasRole: () => false,
    });

    const result = await caller.hello();
    expect(result).toEqual({ greeting: "hello world" });
  });
});
