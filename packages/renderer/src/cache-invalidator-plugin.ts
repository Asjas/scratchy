import { createCacheInvalidator } from "./cache-invalidation.js";
import type {} from "./types/fastify.js";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { Redis } from "ioredis";

/**
 * Options for {@link cacheInvalidatorPlugin}.
 */
export interface CacheInvalidatorPluginOptions {
  /**
   * Redis client used to **publish** invalidation events.
   *
   * This client is **not** put into subscriber mode — it can continue to
   * be used for regular commands.  The plugin calls `publisher.quit()` during
   * server shutdown.
   */
  publisher: Redis;
  /**
   * Pub/Sub channel name.
   * Defaults to `"scratchy:cache:invalidate"` ({@link DEFAULT_CACHE_INVALIDATION_CHANNEL}).
   */
  channel?: string;
}

/**
 * Fastify plugin that decorates the instance with `fastify.invalidateCache()`.
 *
 * Registers a cache-invalidation publisher backed by Redis Pub/Sub.  After
 * registering this plugin, call `fastify.invalidateCache(keys)` from any
 * mutation handler to broadcast stale cache keys to every server that has
 * registered {@link cacheSubscriberPlugin}.
 *
 * The underlying Redis client is closed automatically when the Fastify server
 * shuts down.
 *
 * @example
 * ```ts
 * import Redis from "ioredis";
 * import cacheInvalidatorPlugin from "@scratchyjs/renderer/cache-invalidator-plugin";
 *
 * const publisher = new Redis(process.env.REDIS_URL);
 * await server.register(cacheInvalidatorPlugin, { publisher });
 *
 * // After updating a blog post:
 * await server.invalidateCache([`page:/blog/${slug}`, "page:/blog"]);
 * ```
 */
export default fp(
  function cacheInvalidatorPlugin(
    fastify: FastifyInstance,
    opts: CacheInvalidatorPluginOptions,
  ) {
    const invalidator = createCacheInvalidator({
      publisher: opts.publisher,
      channel: opts.channel,
    });

    fastify.decorate("invalidateCache", (keys: string[]) =>
      invalidator.publish(keys),
    );

    fastify.addHook("onClose", async () => {
      await opts.publisher.quit();
    });
  },
  { name: "@scratchyjs/renderer/cache-invalidator" },
);
