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
 *
 * The entire function is wrapped in a try/catch so that a context-creation
 * failure (e.g. a malformed connectionParams payload on a WebSocket/SSE
 * upgrade — CVE-2025-43855 pattern) never propagates as an uncaught
 * exception and crashes the server. On error, an unauthenticated context
 * is returned and the error is logged.
 */
export function createContext({
  req,
  res,
}: CreateFastifyContextOptions): Context {
  try {
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
  } catch (error) {
    req.log.warn(
      { err: error },
      "tRPC createContext failed — returning unauthenticated context",
    );
    return {
      request: req,
      reply: res,
      user: null,
      hasRole() {
        return false;
      },
    };
  }
}
