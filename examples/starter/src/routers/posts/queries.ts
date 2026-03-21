import { post } from "../../db/schema/post.js";
import { TRPCError, publicProcedure } from "../../router.js";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

/** Pagination input schema reused by multiple query procedures. */
const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const postQueries = {
  /** List posts ordered by newest first with optional pagination. */
  list: publicProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const { db } = ctx.request.server;

    return db
      .select()
      .from(post)
      .orderBy(desc(post.createdAt))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit);
  }),

  /** Fetch a single post by ID. */
  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx.request.server;

      const [found] = await db.select().from(post).where(eq(post.id, input.id));

      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      return found;
    }),
};
