import { router } from "~/router.js";
// @scratchy-feature posts-start
import { postMutations } from "~/routers/posts/mutations.js";
import { postQueries } from "~/routers/posts/queries.js";

// @scratchy-feature posts-end

/**
 * The root tRPC router that aggregates all domain routers.
 * Register new domains here as the application grows.
 */
export const appRouter = router({
  // @scratchy-feature posts-start
  posts: router({
    ...postQueries,
    ...postMutations,
  }),
  // @scratchy-feature posts-end
});

export type AppRouter = typeof appRouter;
