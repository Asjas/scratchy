import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

/** Represents an authenticated user in the request context. */
export interface User {
  id: string;
  role: string;
}

/** The tRPC context available to every procedure. */
export interface Context {
  request: CreateFastifyContextOptions["req"];
  reply: CreateFastifyContextOptions["res"];
  user: User | null;
  hasRole: (role: string) => boolean;
}

/**
 * Creates a tRPC context from the incoming Fastify request.
 * Extracts the user from `req.user` (populated by an auth plugin)
 * and provides a `hasRole()` helper.
 */
export function createContext({
  req,
  res,
}: CreateFastifyContextOptions): Context {
  const user =
    (req as unknown as { user?: User | null | undefined }).user ?? null;

  return {
    request: req,
    reply: res,
    user,
    hasRole(role: string) {
      return user?.role === role;
    },
  };
}
