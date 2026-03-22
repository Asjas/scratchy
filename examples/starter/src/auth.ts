import type { AppConfig } from "./config.js";
import { account, session, user, verification } from "./db/schema/index.js";
import { createAuth } from "@scratchyjs/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ulid } from "ulid";

/**
 * Creates and configures the Better Auth instance for the starter example.
 *
 * Uses:
 * - Email and password authentication
 * - Drizzle ORM adapter for persistent session/user storage
 * - ULID IDs to stay consistent with the rest of the Scratchy data layer
 *
 * Register the returned instance with `authPlugin` from `@scratchyjs/auth/plugin`:
 *
 * ```ts
 * import authPlugin from "@scratchyjs/auth/plugin";
 *
 * const auth = createAppAuth(config, server.db);
 * await server.register(authPlugin, { auth });
 * ```
 *
 * @param config - Application config. Must include a valid `BETTER_AUTH_SECRET`.
 * @param db     - Drizzle database instance (registered by `@scratchyjs/drizzle`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAppAuth(config: AppConfig, db: NodePgDatabase<any>) {
  const secret = config.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required to initialize the auth instance",
    );
  }

  return createAuth({
    basePath: "/api/auth",
    secret,
    trustedOrigins: config.ORIGIN ? [config.ORIGIN] : [],
    emailAndPassword: {
      enabled: true,
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      // Map Better Auth's table names to the Drizzle table definitions so
      // that the adapter operates within our custom schema namespace.
      schema: {
        user,
        session,
        account,
        verification,
      },
    }),
    advanced: {
      database: {
        // Use ULID for all Better Auth-generated IDs to stay consistent
        // with the rest of the Scratchy data layer.
        generateId: () => ulid(),
      },
    },
  });
}

/** The return type of `createAppAuth()`. */
export type AppAuth = ReturnType<typeof createAppAuth>;
