import { DEFAULT_CACHE_INVALIDATION_CHANNEL } from "./cache-invalidation.js";
import type { CacheSubscriberPluginOptions } from "./cache-subscriber-plugin.js";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

function createMockSubscriber() {
  const listeners: ((channel: string, message: string) => void)[] = [];

  return {
    subscribe: vi.fn(() => Promise.resolve()),
    unsubscribe: vi.fn(() => Promise.resolve()),
    quit: vi.fn(async () => "OK" as const),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === "message") {
        listeners.push(handler as (channel: string, message: string) => void);
      }
    }),
    _simulateMessage(channel: string, message: string) {
      for (const h of listeners) h(channel, message);
    },
  };
}

describe("cacheSubscriberPlugin", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to the default channel when the server is ready", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate: vi.fn(),
    });
    await server.ready();

    expect(subscriber.subscribe).toHaveBeenCalledWith(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
    );

    await server.close();
  });

  it("subscribes to a custom channel when configured", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate: vi.fn(),
      channel: "my:cache:channel",
    });
    await server.ready();

    expect(subscriber.subscribe).toHaveBeenCalledWith("my:cache:channel");

    await server.close();
  });

  it("calls onInvalidate when a valid message arrives", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const onInvalidate = vi.fn();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate,
    });
    await server.ready();

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["page:/blog", "page:/about"] }),
    );

    expect(onInvalidate).toHaveBeenCalledOnce();
    expect(onInvalidate).toHaveBeenCalledWith(["page:/blog", "page:/about"]);

    await server.close();
  });

  it("does not call onInvalidate for messages on other channels", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const onInvalidate = vi.fn();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate,
    });
    await server.ready();

    subscriber._simulateMessage(
      "other:channel",
      JSON.stringify({ keys: ["k1"] }),
    );

    expect(onInvalidate).not.toHaveBeenCalled();

    await server.close();
  });

  it("routes parse errors to onError", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const onError = vi.fn();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate: vi.fn(),
      onError,
    });
    await server.ready();

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      "not-valid-json{",
    );

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(
      /Failed to parse/,
    );

    await server.close();
  });

  it("routes empty-keys errors to onError", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const onError = vi.fn();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate: vi.fn(),
      onError,
    });
    await server.ready();

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: [] }),
    );

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(/no keys/i);

    await server.close();
  });

  it("routes onInvalidate sync throws to onError", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const onError = vi.fn();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate: () => {
        throw new Error("sync boom");
      },
      onError,
    });
    await server.ready();

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["k"] }),
    );

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(/sync boom/);

    await server.close();
  });

  it("routes onInvalidate async rejections to onError", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const onError = vi.fn();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate: async () => {
        throw new Error("async boom");
      },
      onError,
    });
    await server.ready();

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["k"] }),
    );

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(/async boom/);

    await server.close();
  });

  it("unsubscribes and quits the client when the server closes", async () => {
    const plugin = (await import("./cache-subscriber-plugin.js")).default;
    const subscriber = createMockSubscriber();
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      subscriber:
        subscriber as unknown as CacheSubscriberPluginOptions["subscriber"],
      onInvalidate: vi.fn(),
    });
    await server.ready();
    await server.close();

    expect(subscriber.unsubscribe).toHaveBeenCalledWith(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
    );
    expect(subscriber.quit).toHaveBeenCalledOnce();
  });
});
