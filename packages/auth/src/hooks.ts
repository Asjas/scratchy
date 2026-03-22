import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

/**
 * Fastify `preHandler` hook that rejects requests without a valid
 * session. Use on routes that require an authenticated user.
 *
 * @example
 * ```ts
 * import { requireAuth } from "@scratchy/auth/hooks";
 *
 * fastify.get("/profile", { preHandler: requireAuth }, async (request) => {
 *   return { user: request.session!.user };
 * });
 * ```
 */
export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) {
  if (!request.session?.user) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "You must be logged in to access this resource",
    });
    return;
  }
  done();
}

/**
 * Fastify `preHandler` hook that rejects requests from non-admin
 * users. Implies authentication — also rejects unauthenticated
 * requests.
 *
 * Checks `request.session.user.role === "admin"`.
 *
 * @example
 * ```ts
 * import { requireAdmin } from "@scratchy/auth/hooks";
 *
 * fastify.delete("/users/:id", { preHandler: requireAdmin }, async (request) => {
 *   // Only admin users reach this handler
 * });
 * ```
 */
export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) {
  if (!request.session?.user) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "You must be logged in to access this resource",
    });
    return;
  }

  if (request.session.user.role !== "admin") {
    reply.code(403).send({
      error: "Forbidden",
      message: "Admin access required",
    });
    return;
  }
  done();
}
