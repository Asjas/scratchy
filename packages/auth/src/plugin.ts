import type { AuthInstance } from "./server.js";
import type { BetterAuthOptions } from "better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import FastifyBetterAuth, {
  type FastifyBetterAuthOptions,
  getAuthDecorator,
} from "fastify-better-auth";
import fp from "fastify-plugin";

/** Session data attached to `request.session` by the auth plugin. */
export interface AuthSession {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    [key: string]: unknown;
  };
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
    [key: string]: unknown;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    session: AuthSession | null;
  }
}

export interface AuthPluginOptions {
  /** The Better Auth instance created with `createAuth()`. */
  auth: AuthInstance;
}

/**
 * Fastify plugin that integrates Better Auth into the Scratchy
 * framework. Registers the `fastify-better-auth` plugin for route
 * handling and adds an `onRequest` hook that resolves the current
 * session and attaches it to `request.session`.
 *
 * @example
 * ```ts
 * import authPlugin from "@scratchy/auth/plugin";
 * import { auth } from "./auth.js";
 *
 * await server.register(authPlugin, { auth });
 *
 * // In routes:
 * request.session?.user // { id, name, email, role, ... }
 * ```
 */
export default fp(
  async function authPlugin(fastify: FastifyInstance, opts: AuthPluginOptions) {
    await fastify.register(FastifyBetterAuth, {
      auth: opts.auth,
    } as FastifyBetterAuthOptions<BetterAuthOptions>);

    fastify.decorateRequest("session", null);

    fastify.addHook("onRequest", async (request) => {
      const authInstance = getAuthDecorator(fastify);
      try {
        const session = await authInstance.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });

        request.session = session as AuthSession | null;
      } catch (error) {
        request.log.warn({ err: error }, "failed to resolve auth session");
        request.session = null;
      }
    });

    fastify.log.info("auth plugin registered");
  },
  { name: "@scratchy/auth" },
);
