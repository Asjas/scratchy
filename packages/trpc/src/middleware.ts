import { TRPCError, middleware, publicProcedure } from "./trpc.js";

/**
 * Middleware that rejects requests without an authenticated user.
 * Narrows `ctx.user` from `User | null` to `User`.
 */
export const isAuthenticated = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this endpoint",
    });
  }

  return next({ ctx: { user: ctx.user } });
});

/**
 * Middleware that requires the user to have the `"admin"` role.
 * Implies authentication — also rejects unauthenticated requests.
 */
export const isAdmin = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this endpoint",
    });
  }

  if (!ctx.hasRole("admin")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({ ctx: { user: ctx.user } });
});

/**
 * Extracts the owner identifier from `input.userId` or `input.id`.
 * Returns `undefined` when neither field is present or `input` is not
 * a plain object.
 */
function extractOwnerId(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const value = record.userId ?? record.id;
  return typeof value === "string" ? value : undefined;
}

/**
 * Middleware that checks if `input.id` or `input.userId` matches
 * `ctx.user.id`. Rejects unauthenticated requests as well.
 *
 * Throws `BAD_REQUEST` if the input does not contain a recognisable
 * owner identifier (`id` or `userId`).
 */
export const isOwner = middleware(({ ctx, next, input }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this endpoint",
    });
  }

  const userId = extractOwnerId(input);

  if (userId === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Input must include an 'id' or 'userId' field for ownership checks",
    });
  }

  if (ctx.user.id !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not authorized to access this resource",
    });
  }

  return next({ ctx: { user: ctx.user } });
});

/**
 * Middleware that allows access if the user is the resource owner
 * (matching `input.id` or `input.userId`) **or** has the `"admin"` role.
 *
 * Throws `BAD_REQUEST` if the input does not contain a recognisable
 * owner identifier (`id` or `userId`).
 */
export const isOwnerOrAdmin = middleware(({ ctx, next, input }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this endpoint",
    });
  }

  const userId = extractOwnerId(input);

  if (userId === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Input must include an 'id' or 'userId' field for ownership checks",
    });
  }

  const ownerMatch = ctx.user.id === userId;
  const adminMatch = ctx.hasRole("admin");

  if (!ownerMatch && !adminMatch) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only access your own data or must be an admin",
    });
  }

  return next({ ctx: { user: ctx.user } });
});

/** A procedure that requires authentication (user must be logged in). */
export const protectedProcedure = publicProcedure.use(isAuthenticated);
