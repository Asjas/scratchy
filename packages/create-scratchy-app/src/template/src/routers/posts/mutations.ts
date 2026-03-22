import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { post } from "~/db/schema/post.js";
import { TRPCError, publicProcedure } from "~/router.js";

export const postMutations = {
  /** Create a new post. */
  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
        authorId: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { db } = ctx.request.server;

      return db
        .insert(post)
        .values({ id: ulid(), ...input })
        .returning()
        .then(([created]) => {
          if (!created) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create post",
            });
          }
          return created;
        });
    }),

  /** Update an existing post's title and/or content. */
  update: publicProcedure
    .input(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1).max(200).optional(),
          content: z.string().min(1).optional(),
        })
        .refine(
          ({ title, content }) => title !== undefined || content !== undefined,
          {
            message: "At least one of title or content must be provided",
          },
        ),
    )
    .mutation(({ ctx, input }) => {
      const { db } = ctx.request.server;
      const { id, ...data } = input;

      return db
        .update(post)
        .set(data)
        .where(eq(post.id, id))
        .returning()
        .then(([updated]) => {
          if (!updated) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Post not found",
            });
          }
          return updated;
        });
    }),

  /** Delete a post by ID. */
  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx.request.server;

      await db.delete(post).where(eq(post.id, input.id));
      return { success: true };
    }),
};
