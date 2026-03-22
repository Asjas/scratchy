import type { BetterAuthClientOptions } from "better-auth";
import { createAuthClient as baseCreateAuthClient } from "better-auth/client";

/**
 * Creates a Better Auth client instance for making auth requests
 * from the browser or server-side.
 *
 * This is a thin wrapper around the vanilla `createAuthClient()`
 * from `better-auth/client`.
 *
 * @param options - Client configuration options (e.g. `baseURL`).
 * @returns A Better Auth client with typed auth methods.
 *
 * @example
 * ```ts
 * import { createAuthClient } from "@scratchyjs/auth/client";
 *
 * export const authClient = createAuthClient({
 *   baseURL: "http://localhost:3000",
 * });
 *
 * // Sign in
 * await authClient.signIn.email({
 *   email: "user@example.com",
 *   password: "password123",
 * });
 * ```
 */
export function createAuthClient(options?: BetterAuthClientOptions) {
  return baseCreateAuthClient(options);
}

/** The return type of `createAuthClient()`. */
export type AuthClient = ReturnType<typeof createAuthClient>;
