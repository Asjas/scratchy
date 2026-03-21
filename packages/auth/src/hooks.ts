import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Fastify preHandler hook that requires an authenticated user.
 *
 * - Returns **401 Unauthorized** if no session user is found.
 * - Returns **403 Forbidden** if the user is banned.
 *
 * @example
 * ```ts
 * import { requireAuth } from "@scratchy/auth/hooks";
 *
 * fastify.get("/profile", { preHandler: requireAuth }, async (request) => {
 *   return { user: request.user };
 * });
 * ```
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!request.user) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "You must be logged in to access this resource",
    });
  }

  if (request.user.banned) {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Your account has been banned",
    });
  }
}

/**
 * Fastify preHandler hook that requires the `"admin"` role.
 * Implies authentication — also rejects unauthenticated and banned users.
 *
 * @example
 * ```ts
 * import { requireAdmin } from "@scratchy/auth/hooks";
 *
 * fastify.get("/admin/users", { preHandler: requireAdmin }, async () => {
 *   return listAllUsers();
 * });
 * ```
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await requireAuth(request, reply);

  if (reply.sent) {
    return;
  }

  if (request.user?.role !== "admin") {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Admin access required",
    });
  }
}

/**
 * Fastify preHandler hook that requires the user to own the resource.
 *
 * Compares `request.user.id` against the owner identifier resolved by
 * `getOwnerId`. Rejects unauthenticated and banned users first.
 *
 * @param getOwnerId - Function that extracts the expected owner ID from
 *   the request (e.g. from route params or body).
 *
 * @example
 * ```ts
 * import { requireOwner } from "@scratchy/auth/hooks";
 *
 * fastify.get(
 *   "/users/:id",
 *   { preHandler: requireOwner((req) => req.params.id) },
 *   async (request) => {
 *     return findUser(request.params.id);
 *   },
 * );
 * ```
 */
export function requireOwner(getOwnerId: (request: FastifyRequest) => string) {
  return async function ownerHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    await requireAuth(request, reply);

    if (reply.sent) {
      return;
    }

    const ownerId = getOwnerId(request);

    if (request.user?.id !== ownerId) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "You are not authorized to access this resource",
      });
    }
  };
}

/**
 * Fastify preHandler hook that allows access when the user is either the
 * resource owner **or** has the `"admin"` role.
 *
 * @param getOwnerId - Function that extracts the expected owner ID from
 *   the request.
 *
 * @example
 * ```ts
 * import { requireOwnerOrAdmin } from "@scratchy/auth/hooks";
 *
 * fastify.delete(
 *   "/posts/:id",
 *   { preHandler: requireOwnerOrAdmin((req) => req.params.authorId) },
 *   async (request) => {
 *     return deletePost(request.params.id);
 *   },
 * );
 * ```
 */
export function requireOwnerOrAdmin(
  getOwnerId: (request: FastifyRequest) => string,
) {
  return async function ownerOrAdminHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    await requireAuth(request, reply);

    if (reply.sent) {
      return;
    }

    const ownerId = getOwnerId(request);
    const isOwner = request.user?.id === ownerId;
    const isAdmin = request.user?.role === "admin";

    if (!isOwner && !isAdmin) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "You can only access your own data or must be an admin",
      });
    }
  };
}
