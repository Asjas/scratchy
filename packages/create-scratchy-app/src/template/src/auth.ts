import { createAuth } from "@scratchyjs/auth";
import argon2 from "argon2";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ulid } from "ulid";
import type { AppConfig } from "~/config.js";
import { account, session, user, verification } from "~/db/schema/index.js";

/**
 * Creates and configures the Better Auth instance for this application.
 *
 * Uses:
 * - Email and password authentication
 * - Drizzle ORM adapter for persistent session/user storage
 * - ULID IDs to stay consistent with the Scratchy data layer
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
      password: {
        // @scratchy-feature argon2-start
        async hash(password: string) {
          const input = config.PEPPER_SECRET
            ? config.PEPPER_SECRET + password
            : password;
          return argon2.hash(input);
        },
        async verify(data: { hash: string; password: string }) {
          const input = config.PEPPER_SECRET
            ? config.PEPPER_SECRET + data.password
            : data.password;
          return argon2.verify(data.hash, input);
        },
        // @scratchy-feature argon2-end
        // @scratchy-feature scrypt-start
        async hash(password: string) {
          const input = config.PEPPER_SECRET
            ? config.PEPPER_SECRET + password
            : password;
          return hashPassword(input);
        },
        async verify(data: { hash: string; password: string }) {
          const input = config.PEPPER_SECRET
            ? config.PEPPER_SECRET + data.password
            : data.password;
          return verifyPassword({ hash: data.hash, password: input });
        },
        // @scratchy-feature scrypt-end
      },
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
      },
    }),
    advanced: {
      database: {
        generateId: () => ulid(),
      },
    },
  });
}

/** The return type of `createAppAuth()`. */
export type AppAuth = ReturnType<typeof createAppAuth>;
