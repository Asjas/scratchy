import { DEFAULT_CACHE_INVALIDATION_CHANNEL } from "./cache-invalidation.js";
import type { CacheInvalidatorPluginOptions } from "./cache-invalidator-plugin.js";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

function createMockPublisher() {
  return {
    publish: vi.fn(async () => 0),
    quit: vi.fn(async () => "OK" as const),
  };
}

describe("cacheInvalidatorPlugin", () => {
  it("decorates fastify with invalidateCache", async () => {
    const plugin = (await import("./cache-invalidator-plugin.js")).default;
    const publisher = createMockPublisher();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      publisher:
        publisher as unknown as CacheInvalidatorPluginOptions["publisher"],
    });
    await server.ready();

    expect(typeof server.invalidateCache).toBe("function");

    await server.close();
  });

  it("publishes keys to the default channel", async () => {
    const plugin = (await import("./cache-invalidator-plugin.js")).default;
    const publisher = createMockPublisher();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      publisher:
        publisher as unknown as CacheInvalidatorPluginOptions["publisher"],
    });
    await server.ready();

    await server.invalidateCache(["page:/blog", "page:/about"]);

    expect(publisher.publish).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledWith(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["page:/blog", "page:/about"] }),
    );

    await server.close();
  });

  it("publishes to a custom channel when configured", async () => {
    const plugin = (await import("./cache-invalidator-plugin.js")).default;
    const publisher = createMockPublisher();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      publisher:
        publisher as unknown as CacheInvalidatorPluginOptions["publisher"],
      channel: "my:cache:channel",
    });
    await server.ready();

    await server.invalidateCache(["k1"]);

    expect(publisher.publish).toHaveBeenCalledWith(
      "my:cache:channel",
      JSON.stringify({ keys: ["k1"] }),
    );

    await server.close();
  });

  it("throws when an empty keys array is published", async () => {
    const plugin = (await import("./cache-invalidator-plugin.js")).default;
    const publisher = createMockPublisher();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      publisher:
        publisher as unknown as CacheInvalidatorPluginOptions["publisher"],
    });
    await server.ready();

    await expect(server.invalidateCache([])).rejects.toThrow(
      /at least one cache key/,
    );

    await server.close();
  });

  it("calls publisher.quit when the server closes", async () => {
    const plugin = (await import("./cache-invalidator-plugin.js")).default;
    const publisher = createMockPublisher();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      publisher:
        publisher as unknown as CacheInvalidatorPluginOptions["publisher"],
    });
    await server.ready();
    await server.close();

    expect(publisher.quit).toHaveBeenCalledOnce();
  });
});
