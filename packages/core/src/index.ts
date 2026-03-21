import type { FastifyPluginAsync, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

export { loadConfig, configSchema } from "./config.js";
export type { Config } from "./config.js";
export { default as createServer } from "./server.js";
export { setupShutdown } from "./shutdown.js";

/**
 * Helper that wraps a Fastify plugin with `fastify-plugin`
 * to ensure it runs in the parent scope (shared decorators).
 */
export function definePlugin<
  Options extends FastifyPluginOptions = Record<string, never>,
>(fn: FastifyPluginAsync<Options>, opts?: { name?: string }) {
  return fp(fn, { name: opts?.name ?? fn.name });
}
