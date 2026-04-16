import {
  DEFAULT_CACHE_INVALIDATION_CHANNEL,
  createCacheInvalidator,
  subscribeToCacheInvalidation,
} from "./cache-invalidation.js";
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Minimal mock types
// ---------------------------------------------------------------------------

type MessageHandler = (channel: string, message: string) => void;

// Convenience type aliases so every call site uses a type-checked cast
// rather than the unsafe `as never` pattern.
type MockPublisher = Parameters<typeof createCacheInvalidator>[0]["publisher"];
type MockSubscriber = Parameters<
  typeof subscribeToCacheInvalidation
>[0]["subscriber"];

/** Mock Redis client used for publishing. */
function createMockPublisher() {
  return {
    publish: vi.fn().mockResolvedValue(1),
  };
}

/** Mock Redis client used for subscribing. */
function createMockSubscriber() {
  let _messageHandler: MessageHandler | null = null;

  return {
    on: vi.fn((event: string, handler: MessageHandler) => {
      if (event === "message") _messageHandler = handler;
    }),
    removeListener: vi.fn((event: string, handler: MessageHandler) => {
      if (event === "message" && _messageHandler === handler) {
        _messageHandler = null;
      }
    }),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    // Helper to simulate an incoming pub/sub message in tests.
    _simulateMessage(channel: string, message: string) {
      _messageHandler?.(channel, message);
    },
  };
}

// ---------------------------------------------------------------------------
// createCacheInvalidator
// ---------------------------------------------------------------------------

describe("createCacheInvalidator", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the default channel", () => {
    const publisher = createMockPublisher();
    const invalidator = createCacheInvalidator({
      publisher: publisher as unknown as MockPublisher,
    });

    expect(invalidator.channel).toBe(DEFAULT_CACHE_INVALIDATION_CHANNEL);
  });

  it("exposes a custom channel when provided", () => {
    const publisher = createMockPublisher();
    const invalidator = createCacheInvalidator({
      publisher: publisher as unknown as MockPublisher,
      channel: "my-app:invalidate",
    });

    expect(invalidator.channel).toBe("my-app:invalidate");
  });

  it("publishes a JSON payload with the given keys to the default channel", async () => {
    const publisher = createMockPublisher();
    const invalidator = createCacheInvalidator({
      publisher: publisher as unknown as MockPublisher,
    });

    await invalidator.publish(["page:/about", "page:/blog"]);

    expect(publisher.publish).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledWith(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["page:/about", "page:/blog"] }),
    );
  });

  it("publishes to a custom channel when configured", async () => {
    const publisher = createMockPublisher();
    const invalidator = createCacheInvalidator({
      publisher: publisher as unknown as MockPublisher,
      channel: "custom:invalidate",
    });

    await invalidator.publish(["key-1"]);

    expect(publisher.publish).toHaveBeenCalledWith(
      "custom:invalidate",
      JSON.stringify({ keys: ["key-1"] }),
    );
  });

  it("throws when an empty keys array is passed", async () => {
    const publisher = createMockPublisher();
    const invalidator = createCacheInvalidator({
      publisher: publisher as unknown as MockPublisher,
    });

    await expect(invalidator.publish([])).rejects.toThrow(
      /at least one cache key/i,
    );
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// subscribeToCacheInvalidation
// ---------------------------------------------------------------------------

describe("subscribeToCacheInvalidation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to the default channel", async () => {
    const subscriber = createMockSubscriber();
    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: vi.fn(),
    });

    expect(subscriber.subscribe).toHaveBeenCalledWith(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
    );
  });

  it("subscribes to a custom channel when configured", async () => {
    const subscriber = createMockSubscriber();
    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: vi.fn(),
      channel: "app:cache",
    });

    expect(subscriber.subscribe).toHaveBeenCalledWith("app:cache");
  });

  it("exposes the channel name on the returned handle", async () => {
    const subscriber = createMockSubscriber();
    const handle = await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: vi.fn(),
    });

    expect(handle.channel).toBe(DEFAULT_CACHE_INVALIDATION_CHANNEL);
  });

  it("calls onInvalidate with the array of keys when a valid message arrives", async () => {
    const subscriber = createMockSubscriber();
    const onInvalidate = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate,
    });

    const payload = JSON.stringify({
      keys: ["page:/blog", "page:/blog/hello"],
    });
    subscriber._simulateMessage(DEFAULT_CACHE_INVALIDATION_CHANNEL, payload);

    expect(onInvalidate).toHaveBeenCalledOnce();
    expect(onInvalidate).toHaveBeenCalledWith([
      "page:/blog",
      "page:/blog/hello",
    ]);
  });

  it("ignores messages from other channels", async () => {
    const subscriber = createMockSubscriber();
    const onInvalidate = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate,
    });

    // Simulate a message on an unrelated channel
    subscriber._simulateMessage(
      "other:channel",
      JSON.stringify({ keys: ["k"] }),
    );

    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it("calls onError when the message JSON is malformed", async () => {
    const subscriber = createMockSubscriber();
    const onError = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: vi.fn(),
      onError,
    });

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      "not-valid-json{",
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(
      /Failed to parse cache invalidation message/,
    );
  });

  it("calls onError when the message has no keys field", async () => {
    const subscriber = createMockSubscriber();
    const onError = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: vi.fn(),
      onError,
    });

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: [] }),
    );

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(/no keys/i);
  });

  it("calls onError when the message keys field is not an array", async () => {
    const subscriber = createMockSubscriber();
    const onError = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: vi.fn(),
      onError,
    });

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: "not-an-array" }),
    );

    expect(onError).toHaveBeenCalledOnce();
  });

  it("calls onError when the keys array contains only non-string entries", async () => {
    const subscriber = createMockSubscriber();
    const onError = vi.fn();
    const onInvalidate = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate,
      onError,
    });

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: [123, true, null] }),
    );

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(
      /no valid string keys/i,
    );
    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it("calls onError when the keys array contains only empty/whitespace strings", async () => {
    const subscriber = createMockSubscriber();
    const onError = vi.fn();
    const onInvalidate = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate,
      onError,
    });

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["", "   ", "\t"] }),
    );

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(
      /no valid string keys/i,
    );
    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it("strips non-string and empty entries and calls onInvalidate with only the valid keys", async () => {
    const subscriber = createMockSubscriber();
    const onInvalidate = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate,
    });

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["valid-key", 42, "", "  ", "another-key"] }),
    );

    expect(onInvalidate).toHaveBeenCalledOnce();
    expect(onInvalidate).toHaveBeenCalledWith(["valid-key", "another-key"]);
  });

  it("calls onError when onInvalidate (sync) throws", async () => {
    const subscriber = createMockSubscriber();
    const onError = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: () => {
        throw new Error("sync boom");
      },
      onError,
    });

    // The synchronous throw is caught and routed through onError
    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["k"] }),
    );

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe("sync boom");
  });

  it("calls onError when onInvalidate (async) rejects", async () => {
    const subscriber = createMockSubscriber();
    const onError = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: async () => {
        throw new Error("async boom");
      },
      onError,
    });

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["k"] }),
    );

    // Wait for the rejected promise to be handled
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });

    expect((onError.mock.calls[0]?.[0] as Error).message).toBe("async boom");
  });

  it("wraps a non-Error rejection in an Error when calling onError", async () => {
    const subscriber = createMockSubscriber();
    const onError = vi.fn();

    await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: async () => Promise.reject("string rejection"),
      onError,
    });

    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["k"] }),
    );

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });

    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe(
      "string rejection",
    );
  });

  it("unsubscribes from the channel when handle.unsubscribe() is called", async () => {
    const subscriber = createMockSubscriber();
    const handle = await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: vi.fn(),
    });

    await handle.unsubscribe();

    expect(subscriber.removeListener).toHaveBeenCalledWith(
      "message",
      expect.any(Function),
    );
    expect(subscriber.unsubscribe).toHaveBeenCalledWith(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
    );
  });

  it("is idempotent — calling unsubscribe() twice only tears down once", async () => {
    const subscriber = createMockSubscriber();
    const handle = await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate: vi.fn(),
    });

    await handle.unsubscribe();
    await handle.unsubscribe();

    expect(subscriber.removeListener).toHaveBeenCalledOnce();
    expect(subscriber.unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not fire onInvalidate after unsubscribe() has been called", async () => {
    const subscriber = createMockSubscriber();
    const onInvalidate = vi.fn();
    const handle = await subscribeToCacheInvalidation({
      subscriber: subscriber as unknown as MockSubscriber,
      onInvalidate,
    });

    await handle.unsubscribe();

    // Simulate a message arriving after unsubscribe — the removed listener
    // should no longer be invoked.
    subscriber._simulateMessage(
      DEFAULT_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ keys: ["stale-key"] }),
    );

    expect(onInvalidate).not.toHaveBeenCalled();
  });
});
