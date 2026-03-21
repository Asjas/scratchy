import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

export interface CreateAuthOptions {
  /** Database adapter (Drizzle ORM or other). */
  database: BetterAuthOptions["database"];
  /** Secret key for auth (use a long random string). */
  secret: string;
  /** Base URL of the server (e.g. `"https://api.example.com"`). */
  baseURL: string;
  /** Trusted origins for CORS. */
  trustedOrigins?: BetterAuthOptions["trustedOrigins"];
  /** Application name shown in emails and UI. */
  appName?: string;
  /** Session configuration. */
  session?: BetterAuthOptions["session"];
  /**
   * Email and password configuration.
   * Defaults to `{ enabled: true }` if not provided.
   */
  emailAndPassword?: BetterAuthOptions["emailAndPassword"];
  /** Email verification configuration. */
  emailVerification?: BetterAuthOptions["emailVerification"];
  /** User-level configuration (additional fields, changeEmail, deleteUser, etc.). */
  user?: BetterAuthOptions["user"];
  /** Advanced configuration (cookiePrefix, database options, etc.). */
  advanced?: BetterAuthOptions["advanced"];
  /** Rate limit configuration. */
  rateLimit?: BetterAuthOptions["rateLimit"];
  /**
   * Secondary storage (e.g. Redis) for sessions and rate limiting.
   * Required when `rateLimit.storage` is set to `"secondary-storage"`.
   */
  secondaryStorage?: BetterAuthOptions["secondaryStorage"];
  /** Logger configuration. */
  logger?: BetterAuthOptions["logger"];
  /**
   * Additional better-auth plugins to include alongside the built-in
   * `admin` plugin (e.g. `username()`, `organization()`).
   */
  plugins?: BetterAuthOptions["plugins"];
}

/**
 * Creates a better-auth instance with the `admin` plugin always enabled.
 * The admin plugin uses `"member"` as the default user role.
 *
 * @example
 * ```ts
 * import { createAuth } from "@scratchy/auth/server";
 * import { drizzleAdapter } from "better-auth/adapters/drizzle";
 *
 * export const auth = createAuth({
 *   baseURL: "https://api.example.com",
 *   secret: process.env.BETTER_AUTH_SECRET,
 *   database: drizzleAdapter(db, { provider: "pg" }),
 * });
 * ```
 */
export function createAuth(options: CreateAuthOptions) {
  const basePlugins: NonNullable<BetterAuthOptions["plugins"]> = [
    admin({ defaultRole: "member" }),
  ];

  return betterAuth({
    appName: options.appName,
    trustedOrigins: options.trustedOrigins,
    baseURL: options.baseURL,
    secret: options.secret,
    session: options.session,
    emailVerification: options.emailVerification,
    emailAndPassword: options.emailAndPassword ?? { enabled: true },
    user: options.user,
    advanced: options.advanced,
    rateLimit: options.rateLimit,
    secondaryStorage: options.secondaryStorage,
    database: options.database,
    logger: options.logger,
    plugins: [...basePlugins, ...(options.plugins ?? [])],
  });
}
