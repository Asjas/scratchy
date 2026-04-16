import type { Piscina } from "piscina";

declare module "fastify" {
  interface FastifyInstance {
    piscina: Piscina;
    runTask: <T = unknown, R = unknown>(task: T) => Promise<R>;
    /**
     * Broadcasts a cache-invalidation event for the supplied keys to every
     * server subscribed to the channel.
     *
     * Decorated by `@scratchyjs/renderer/cache-invalidator-plugin`.
     * @throws {Error} if `keys` is empty.
     */
    invalidateCache: (keys: string[]) => Promise<void>;
  }
}
