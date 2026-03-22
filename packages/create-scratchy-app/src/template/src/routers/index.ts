import { router } from "~/router.js";
import { postMutations } from "~/routers/posts/mutations.js";
import { postQueries } from "~/routers/posts/queries.js";

/**
 * The root tRPC router that aggregates all domain routers.
 * Register new domains here as the application grows.
 */
export const appRouter = router({
  posts: router({
    ...postQueries,
    ...postMutations,
  }),
});

export type AppRouter = typeof appRouter;
