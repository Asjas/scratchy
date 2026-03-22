import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";

/**
 * Options for configuring the Scratchy auth instance.
 * Accepts any valid Better Auth options.
 */
export type CreateAuthOptions = BetterAuthOptions;

/**
 * Creates a Better Auth instance with the given options.
 *
 * This is a thin wrapper around `betterAuth()` used by Scratchy
 * as a framework integration point. It currently forwards the
 * provided options directly to `betterAuth()`, giving the consumer
 * full control via the options object.
 *
 * @param options - Better Auth configuration options.
 * @returns A configured Better Auth instance.
 *
 * @example
 * ```ts
 * import { createAuth } from "@scratchyjs/auth";
 *
 * export const auth = createAuth({
 *   database: drizzleAdapter(db, { provider: "pg" }),
 *   emailAndPassword: { enabled: true },
 *   trustedOrigins: ["http://localhost:3000"],
 * });
 * ```
 */
export function createAuth(options: CreateAuthOptions) {
  return betterAuth(options);
}

/** The return type of `createAuth()`. */
export type AuthInstance = ReturnType<typeof createAuth>;
