import type { Redis } from "ioredis";

/** Default Redis Pub/Sub channel for cache invalidation events. */
export const DEFAULT_CACHE_INVALIDATION_CHANNEL = "scratchy:cache:invalidate";

/** Shape of the JSON payload sent over the pub/sub channel. */
interface InvalidationMessage {
  keys: string[];
}

/**
 * Options for {@link createCacheInvalidator}.
 */
export interface CacheInvalidatorOptions {
  /**
   * Redis client used to **publish** invalidation events.
   * This client can continue to be used for regular commands after calling
   * `createCacheInvalidator` — publishing does not change its mode.
   */
  publisher: Redis;
  /**
   * Pub/Sub channel name.
   * Defaults to `"scratchy:cache:invalidate"`.
   */
  channel?: string;
}

/**
 * Object returned by {@link createCacheInvalidator}.
 */
export interface CacheInvalidator {
  /**
   * Broadcasts a cache-invalidation event for the supplied `keys` to every
   * server subscribed to the channel.  Each subscriber receives the list of
   * keys and is responsible for evicting those entries from its local cache.
   *
   * @param keys - One or more cache keys (or glob patterns) to invalidate.
   *               Must be a non-empty array.
   * @throws {Error} if `keys` is empty.
   */
  publish(keys: string[]): Promise<void>;
  /** The Pub/Sub channel this invalidator publishes to. */
  readonly channel: string;
}

/**
 * Options for {@link subscribeToCacheInvalidation}.
 */
export interface CacheInvalidationSubscriberOptions {
  /**
   * A Redis client **dedicated** to subscribing.
   *
   * In ioredis, calling `subscribe()` puts the client into subscriber mode,
   * after which it can only issue Pub/Sub commands.  Pass a separate
   * `Redis` instance here and do not reuse it for regular commands.
   */
  subscriber: Redis;
  /**
   * Called whenever an invalidation event arrives on the channel.
   * Receives the array of cache keys/patterns that should be evicted.
   * May be synchronous or async.
   */
  onInvalidate: (keys: string[]) => void | Promise<void>;
  /**
   * Pub/Sub channel name.
   * Defaults to `"scratchy:cache:invalidate"`.
   */
  channel?: string;
  /**
   * Optional error handler.  Called when a message cannot be parsed or
   * when `onInvalidate` throws / rejects.
   * If omitted, errors are silently ignored.
   */
  onError?: (error: Error) => void;
}

/**
 * Handle returned by {@link subscribeToCacheInvalidation} that lets the
 * caller tear down the subscription during graceful shutdown.
 */
export interface CacheInvalidationSubscriber {
  /**
   * Unsubscribes from the invalidation channel.
   *
   * The underlying Redis client is **not** closed — the caller owns its
   * lifecycle and should call `client.quit()` separately.
   */
  unsubscribe(): Promise<void>;
  /** The Pub/Sub channel this subscriber is listening on. */
  readonly channel: string;
}

/**
 * Creates a {@link CacheInvalidator} that broadcasts cache-key invalidation
 * events over a Redis Pub/Sub channel.
 *
 * Use this on the **publishing side** — for example in a mutation handler
 * after writing to the database — to notify every running server that
 * certain cached pages or data are stale.
 *
 * @example
 * ```ts
 * import Redis from "ioredis";
 * import { createCacheInvalidator } from "@scratchyjs/renderer";
 *
 * const publisher = new Redis(process.env.REDIS_URL);
 * const invalidator = createCacheInvalidator({ publisher });
 *
 * // After updating a blog post:
 * await invalidator.publish([`page:/blog/${slug}`, "page:/blog"]);
 * ```
 */
export function createCacheInvalidator(
  opts: CacheInvalidatorOptions,
): CacheInvalidator {
  const { publisher } = opts;
  const channel = opts.channel ?? DEFAULT_CACHE_INVALIDATION_CHANNEL;

  return {
    channel,

    async publish(keys: string[]): Promise<void> {
      if (keys.length === 0) {
        throw new Error(
          "publish() requires at least one cache key — received an empty array.",
        );
      }
      const payload: InvalidationMessage = { keys };
      await publisher.publish(channel, JSON.stringify(payload));
    },
  };
}

/**
 * Subscribes to cache invalidation events on a Redis Pub/Sub channel.
 *
 * Call this on **every server instance** at startup so that each node can
 * evict stale entries from its local in-memory cache when another node
 * broadcasts an invalidation.
 *
 * The `subscriber` client enters subscriber mode after this call.  Do
 * **not** reuse it for regular Redis commands — create a dedicated
 * `Redis` instance for this purpose.
 *
 * @returns A {@link CacheInvalidationSubscriber} whose `unsubscribe()`
 *          method should be called during graceful server shutdown.
 *
 * @example
 * ```ts
 * import Redis from "ioredis";
 * import { subscribeToCacheInvalidation } from "@scratchyjs/renderer";
 *
 * const subscriber = new Redis(process.env.REDIS_URL);
 * const handle = await subscribeToCacheInvalidation({
 *   subscriber,
 *   onInvalidate: (keys) => {
 *     for (const key of keys) localCache.delete(key);
 *   },
 * });
 *
 * // During graceful shutdown:
 * await handle.unsubscribe();
 * await subscriber.quit();
 * ```
 */
export async function subscribeToCacheInvalidation(
  opts: CacheInvalidationSubscriberOptions,
): Promise<CacheInvalidationSubscriber> {
  const { subscriber, onInvalidate, onError } = opts;
  const channel = opts.channel ?? DEFAULT_CACHE_INVALIDATION_CHANNEL;

  subscriber.on("message", (ch: string, rawMessage: string) => {
    if (ch !== channel) return;

    let parsed: InvalidationMessage;
    try {
      parsed = JSON.parse(rawMessage) as InvalidationMessage;
    } catch {
      onError?.(
        new Error(
          `Failed to parse cache invalidation message on channel "${channel}": ${rawMessage}`,
        ),
      );
      return;
    }

    if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
      onError?.(
        new Error(
          `Cache invalidation message received on channel "${channel}" contains no keys: ${rawMessage}`,
        ),
      );
      return;
    }

    let result: void | Promise<void>;
    try {
      result = onInvalidate(parsed.keys);
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (result instanceof Promise) {
      result.catch((err: unknown) => {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });

  await subscriber.subscribe(channel);

  return {
    channel,

    async unsubscribe(): Promise<void> {
      await subscriber.unsubscribe(channel);
    },
  };
}
