import { createServer } from "@scratchyjs/core";
// @scratchy-feature renderer-start
import { createSSRHandler } from "@scratchyjs/renderer";
// @scratchy-feature renderer-end
import type { AnyRouter } from "@trpc/server";
// @scratchy-feature renderer-start
import { resolve } from "node:path";
import type { AppConfig } from "~/config.js";
import { loadAppConfig } from "~/config.js";
// @scratchy-feature db-start
import * as dbSchemas from "~/db/schema/index.js";
// @scratchy-feature db-end
import { appRouter } from "~/routers/index.js";

// @scratchy-feature renderer-end

export interface ServerOpts {
  /** Pre-loaded application config. Falls back to `loadAppConfig()` if omitted. */
  config?: AppConfig;
  /**
   * Override the tRPC router. Useful in tests to inject an in-memory router
   * without a real database connection.
   */
  router?: AnyRouter;
  // @scratchy-feature db-start
  /** When `true`, the Drizzle database plugin is not registered. */
  skipDb?: boolean;
  // @scratchy-feature db-end
  // @scratchy-feature auth-start
  /** When `true`, the auth plugin is not registered even if `BETTER_AUTH_SECRET` is set. */
  skipAuth?: boolean;
  // @scratchy-feature auth-end
}

/**
 * Creates and configures the Fastify server with all framework packages wired up:
 * - `@scratchyjs/core`     — base server (CORS, helmet, rate-limit, health route)
 * - `@scratchyjs/drizzle`  — Drizzle ORM database plugin (when `DATABASE_URL` is set)
 * - `@scratchyjs/auth`     — Better Auth plugin (when `BETTER_AUTH_SECRET` is set)
 * - `@scratchyjs/trpc`     — tRPC router at `/trpc`
 * - `@scratchyjs/renderer` — Piscina SSR worker pool
 */
export async function buildServer(opts: ServerOpts = {}) {
  const config = opts.config ?? loadAppConfig();
  const server = await createServer(config);

  // @scratchy-feature db-start
  // ── Database ────────────────────────────────────────────────────────────────
  const shouldRegisterDb = !opts.skipDb && Boolean(config.DATABASE_URL);
  if (shouldRegisterDb && config.DATABASE_URL) {
    const { default: drizzlePlugin } =
      await import("@scratchyjs/drizzle/plugin");
    await server.register(drizzlePlugin, {
      connectionString: config.DATABASE_URL,
      schemas: dbSchemas,
    });
  }
  // @scratchy-feature db-end

  // @scratchy-feature auth-start
  // ── Auth ─────────────────────────────────────────────────────────────────
  // Must be registered after the database plugin so `server.db` is available.
  const shouldRegisterAuth =
    !opts.skipAuth && Boolean(config.BETTER_AUTH_SECRET);
  if (shouldRegisterAuth && shouldRegisterDb) {
    const { createAppAuth } = await import("~/auth.js");
    const { default: authPlugin } = await import("@scratchyjs/auth/plugin");
    const auth = createAppAuth(config, server.db);
    await server.register(authPlugin, { auth });
  }
  // @scratchy-feature auth-end

  // ── tRPC API ─────────────────────────────────────────────────────────────
  // @scratchy-feature db-start
  const effectiveRouter = opts.router ?? appRouter;
  if (!shouldRegisterDb && effectiveRouter === appRouter) {
    throw new Error(
      "Default appRouter requires a database, but DATABASE_URL is unset or skipDb is true. " +
        "Either configure DATABASE_URL / disable skipDb, or pass a custom router via ServerOpts.router.",
    );
  }
  // @scratchy-feature db-end
  const { default: trpcPlugin } = await import("@scratchyjs/trpc/plugin");
  await server.register(trpcPlugin, {
    router: opts.router ?? appRouter,
  });

  // @scratchy-feature renderer-start
  // ── Renderer worker pool ─────────────────────────────────────────────────
  const { default: rendererPlugin } =
    await import("@scratchyjs/renderer/plugin");
  const workerPath = resolve(import.meta.dirname, "renderer", "worker.ts");
  await server.register(rendererPlugin, {
    worker: workerPath,
    minThreads: 1,
    maxThreads: 2,
    taskTimeout: 10_000,
  });

  // ── SSR catch-all ────────────────────────────────────────────────────────
  server.get("/*", createSSRHandler());
  // @scratchy-feature renderer-end

  return server;
}
