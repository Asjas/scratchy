import { createServer } from "@scratchyjs/core";
import { createSSRHandler } from "@scratchyjs/renderer";
import type { AnyRouter } from "@trpc/server";
import { resolve } from "node:path";
import type { AppConfig } from "~/config.js";
import { loadAppConfig } from "~/config.js";
import * as dbSchemas from "~/db/schema/index.js";
import { appRouter } from "~/routers/index.js";

export interface ServerOpts {
  /** Pre-loaded application config. Falls back to `loadAppConfig()` if omitted. */
  config?: AppConfig;
  /**
   * Override the tRPC router. Useful in tests to inject an in-memory router
   * without a real database connection.
   */
  router?: AnyRouter;
  /** When `true`, the Drizzle database plugin is not registered. */
  skipDb?: boolean;
  /** When `true`, the auth plugin is not registered even if `BETTER_AUTH_SECRET` is set. */
  skipAuth?: boolean;
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

  // ── Database ─────────────────────────────────────────────────────────────
  const shouldRegisterDb = !opts.skipDb && Boolean(config.DATABASE_URL);
  if (shouldRegisterDb && config.DATABASE_URL) {
    const { default: drizzlePlugin } =
      await import("@scratchyjs/drizzle/plugin");
    await server.register(drizzlePlugin, {
      connectionString: config.DATABASE_URL,
      schemas: dbSchemas,
    });
  }

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

  // ── tRPC API ──────────────────────────────────────────────────────────────
  const effectiveRouter = opts.router ?? appRouter;
  if (!shouldRegisterDb && effectiveRouter === appRouter) {
    // Use a bare router when no database is available to avoid import errors
    // from routers that reference `ctx.request.server.db`.
    const { createContext } = await import("~/context.js");
    const { default: trpcPlugin } = await import("@scratchyjs/trpc/plugin");
    await server.register(trpcPlugin, {
      router: effectiveRouter,
      createContext,
    });
  } else {
    const { createContext } = await import("~/context.js");
    const { default: trpcPlugin } = await import("@scratchyjs/trpc/plugin");
    await server.register(trpcPlugin, {
      router: effectiveRouter,
      createContext,
    });
  }

  // ── SSR Renderer ──────────────────────────────────────────────────────────
  const workerPath = resolve(import.meta.dirname, "renderer", "worker.ts");
  const ssrHandler = await createSSRHandler({ workerPath });
  await server.register(ssrHandler);

  return server;
}
