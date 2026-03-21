import type { AuthUser } from "./types.js";
import type { Auth, BetterAuthOptions } from "better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type {
  FastifyInstance,
  FastifyPluginOptions,
  HookHandlerDoneFunction,
} from "fastify";
import fastifyBetterAuth, { getAuthDecorator } from "fastify-better-auth";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    /** The currently authenticated user, or `null` if not signed in. */
    user: AuthUser | null;
  }
}

export interface AuthPluginOptions {
  /** The better-auth instance created with `createAuth()`. */
  auth: Auth<BetterAuthOptions>;
}

/**
 * Fastify plugin that integrates better-auth into the server.
 *
 * Registers the better-auth request handler at `/api/auth/*` and
 * populates `request.user` on every incoming request by reading
 * the session from the auth instance.
 *
 * @example
 * ```ts
 * import authPlugin from "@scratchy/auth/plugin";
 * import { auth } from "./lib/auth.server.js";
 *
 * await server.register(authPlugin, { auth });
 * ```
 */
export default fp(
  function authPlugin(
    fastify: FastifyInstance,
    opts: AuthPluginOptions & FastifyPluginOptions,
    done: HookHandlerDoneFunction,
  ) {
    fastify.decorateRequest("user", null);

    fastify.register(fastifyBetterAuth, { auth: opts.auth });

    fastify.addHook("onRequest", async (request) => {
      const authInstance = getAuthDecorator(request.server);

      const session = await authInstance.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      request.user = (session?.user as AuthUser) ?? null;
    });

    done();
  },
  { name: "@scratchy/auth" },
);
