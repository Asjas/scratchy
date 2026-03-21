import type { BetterAuthClientOptions } from "better-auth";
import { createAuthClient as createBetterAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";

export interface CreateAuthClientOptions {
  /** Base URL of the auth server (e.g. `"https://api.example.com"`). */
  baseURL: string;
  /**
   * Base path for auth endpoints.
   * @default "/api/auth"
   */
  basePath?: string;
  /**
   * Additional better-auth client plugins to include alongside the built-in
   * `adminClient` (e.g. `usernameClient()`, `organizationClient()`).
   */
  plugins?: BetterAuthClientOptions["plugins"];
  /** Fetch options applied to every request. */
  fetchOptions?: BetterAuthClientOptions["fetchOptions"];
}

/**
 * Creates a type-safe better-auth client with the `adminClient` plugin
 * always included (matching the server's `admin` plugin).
 *
 * @example
 * ```ts
 * import { createAuthClient } from "@scratchy/auth/client";
 *
 * export const authClient = createAuthClient({
 *   baseURL: import.meta.env.VITE_API_URL,
 * });
 *
 * // Sign in
 * await authClient.signIn.email({ email, password });
 *
 * // Get session
 * const { data: session } = await authClient.getSession();
 * ```
 */
export function createAuthClient(options: CreateAuthClientOptions) {
  return createBetterAuthClient({
    baseURL: options.baseURL,
    basePath: options.basePath ?? "/api/auth",
    plugins: [adminClient(), ...(options.plugins ?? [])],
    fetchOptions: options.fetchOptions,
  });
}
