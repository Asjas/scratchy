import {
  cleanupRenderContext,
  getRenderContext,
  storeRenderContext,
  storeRenderResult,
} from "./redis-comm.js";
import { afterEach, describe, expect, it, vi } from "vitest";

function createMockRedis() {
  const store = new Map<string, string>();

  return {
    get: vi.fn((key: string) => store.get(key) ?? null),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn((...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count++;
      }
      return count;
    }),
    _store: store,
  };
}

describe("redis-comm", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("storeRenderContext / getRenderContext", () => {
    it("should store and retrieve a render context", async () => {
      const redis = createMockRedis();
      const context = { route: "/about", user: { id: "u1" } };

      await storeRenderContext(
        redis as unknown as Parameters<typeof storeRenderContext>[0],
        "req-1",
        context,
      );

      expect(redis.set).toHaveBeenCalledWith(
        "render:ctx:req-1",
        JSON.stringify(context),
        "EX",
        60,
      );

      const result = await getRenderContext(
        redis as unknown as Parameters<typeof getRenderContext>[0],
        "req-1",
      );

      expect(result).toEqual(context);
    });

    it("should use a custom TTL when provided", async () => {
      const redis = createMockRedis();

      await storeRenderContext(
        redis as unknown as Parameters<typeof storeRenderContext>[0],
        "req-2",
        { data: true },
        120,
      );

      expect(redis.set).toHaveBeenCalledWith(
        "render:ctx:req-2",
        expect.any(String),
        "EX",
        120,
      );
    });

    it("should throw when context does not exist", async () => {
      const redis = createMockRedis();

      await expect(
        getRenderContext(
          redis as unknown as Parameters<typeof getRenderContext>[0],
          "missing",
        ),
      ).rejects.toThrow(/No render context found/);
    });

    it("should reject zero TTL", async () => {
      const redis = createMockRedis();

      await expect(
        storeRenderContext(
          redis as unknown as Parameters<typeof storeRenderContext>[0],
          "req-ttl",
          {},
          0,
        ),
      ).rejects.toThrow(RangeError);
    });

    it("should reject negative TTL", async () => {
      const redis = createMockRedis();

      await expect(
        storeRenderContext(
          redis as unknown as Parameters<typeof storeRenderContext>[0],
          "req-ttl",
          {},
          -5,
        ),
      ).rejects.toThrow(RangeError);
    });

    it("should reject non-integer TTL", async () => {
      const redis = createMockRedis();

      await expect(
        storeRenderContext(
          redis as unknown as Parameters<typeof storeRenderContext>[0],
          "req-ttl",
          {},
          1.5,
        ),
      ).rejects.toThrow(RangeError);
    });
  });

  describe("storeRenderResult", () => {
    it("should store HTML with default TTL of 300 seconds", async () => {
      const redis = createMockRedis();

      await storeRenderResult(
        redis as unknown as Parameters<typeof storeRenderResult>[0],
        "req-3",
        "<html>rendered</html>",
      );

      expect(redis.set).toHaveBeenCalledWith(
        "render:result:req-3",
        "<html>rendered</html>",
        "EX",
        300,
      );
    });

    it("should accept a custom TTL", async () => {
      const redis = createMockRedis();

      await storeRenderResult(
        redis as unknown as Parameters<typeof storeRenderResult>[0],
        "req-4",
        "<html></html>",
        600,
      );

      expect(redis.set).toHaveBeenCalledWith(
        "render:result:req-4",
        "<html></html>",
        "EX",
        600,
      );
    });

    it("should reject invalid TTL", async () => {
      const redis = createMockRedis();

      await expect(
        storeRenderResult(
          redis as unknown as Parameters<typeof storeRenderResult>[0],
          "req-ttl",
          "<html></html>",
          0,
        ),
      ).rejects.toThrow(RangeError);
    });
  });

  describe("cleanupRenderContext", () => {
    it("should delete both context and result keys", async () => {
      const redis = createMockRedis();
      redis._store.set("render:ctx:req-5", "{}");
      redis._store.set("render:result:req-5", "<html></html>");

      await cleanupRenderContext(
        redis as unknown as Parameters<typeof cleanupRenderContext>[0],
        "req-5",
      );

      expect(redis.del).toHaveBeenCalledWith(
        "render:ctx:req-5",
        "render:result:req-5",
      );
    });
  });
});
