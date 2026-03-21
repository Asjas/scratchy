import type { Context } from "./context.js";
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_SECONDS_MS = 30 * 1000;
const TWO_MINUTES_MS = 2 * 60 * 1000;

/**
 * tRPC instance initialized with the Scratchy context, superjson
 * transformer, and SSE support. This is the single source of truth
 * for creating routers, procedures, and middleware.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  sse: {
    enabled: true,
    maxDurationMs: FIVE_MINUTES_MS,
    ping: { enabled: true, intervalMs: THIRTY_SECONDS_MS },
    client: { reconnectAfterInactivityMs: TWO_MINUTES_MS },
  },
});

/** Create a new tRPC router. */
export const router = t.router;

/** A procedure with no authentication requirement. */
export const publicProcedure = t.procedure;

/** Create a tRPC middleware. */
export const middleware = t.middleware;

export { TRPCError };
