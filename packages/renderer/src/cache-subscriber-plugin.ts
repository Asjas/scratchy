import type { CacheInvalidationSubscriberOptions } from "./cache-invalidation.js";
import { subscribeToCacheInvalidation } from "./cache-invalidation.js";
import type {} from "./types/fastify.js";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { Redis } from "ioredis";

/**
 * Options for {@link cacheSubscriberPlugin}.
 */
export interface CacheSubscriberPluginOptions extends Pick<
  CacheInvalidationSubscriberOptions,
  "onInvalidate" | "channel" | "onError"
> {
  /**
   * A Redis client **dedicated** to subscribing.
   *
   * In ioredis, calling `subscribe()` puts the client into subscriber mode,
   * after which it can only issue Pub/Sub commands.  Pass a separate
   * `Redis` instance here and do not reuse it for regular commands.
   *
   * The plugin calls `subscriber.quit()` during server shutdown.
   */
  subscriber: Redis;
}

/**
 * Fastify plugin that subscribes to cache-invalidation events on a Redis
 * Pub/Sub channel.
 *
 * Register this plugin on **every server instance** at startup.  Each time
 * another server publishes a set of stale keys via
 * {@link cacheInvalidatorPlugin} (or `createCacheInvalidator` directly),
 * `onInvalidate(keys)` is called so the local in-memory cache can evict
 * those entries.
 *
 * The subscription is torn down and the Redis client is closed automatically
 * when the Fastify server shuts down.
 *
 * @example
 * ```ts
 * import Redis from "ioredis";
 * import cacheSubscriberPlugin from "@scratchyjs/renderer/cache-subscriber-plugin";
 *
 * const subscriber = new Redis(process.env.REDIS_URL);
 * await server.register(cacheSubscriberPlugin, {
 *   subscriber,
 *   onInvalidate: (keys) => {
 *     for (const key of keys) localCache.delete(key);
 *   },
 *   onError: (err) => server.log.warn({ err }, "cache invalidation error"),
 * });
 * ```
 */
export default fp(
  async function cacheSubscriberPlugin(
    fastify: FastifyInstance,
    opts: CacheSubscriberPluginOptions,
  ) {
    const handle = await subscribeToCacheInvalidation({
      subscriber: opts.subscriber,
      onInvalidate: opts.onInvalidate,
      channel: opts.channel,
      onError: opts.onError,
    });

    fastify.addHook("onClose", async () => {
      await handle.unsubscribe();
      await opts.subscriber.quit();
    });
  },
  { name: "@scratchyjs/renderer/cache-subscriber" },
);
