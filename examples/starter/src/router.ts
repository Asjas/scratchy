/**
 * tRPC initialisation for the starter example.
 * Re-exports the shared router builder and public procedure from
 * `@scratchy/trpc` so application routers can import from a single
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
} from "@scratchy/trpc";
