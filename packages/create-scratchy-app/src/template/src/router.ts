/**
 * tRPC initialisation.
 * Re-exports the shared router builder and public procedure from
 * `@scratchyjs/trpc` so application routers can import from a single
 * in-project location.
 */
export {
  router,
  publicProcedure,
  middleware,
  TRPCError,
  protectedProcedure,
  isAuthenticated,
  isAdmin,
  isOwner,
  isOwnerOrAdmin,
} from "@scratchyjs/trpc";
