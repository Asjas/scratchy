import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { post } from "~/db/schema/post.js";
import { TRPCError, protectedProcedure } from "~/router.js";

export const postMutations = {
  /** Create a new post. The author is derived from the authenticated user. */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { db } = ctx.request.server;

      return db
        .insert(post)
        .values({ id: ulid(), authorId: ctx.user.id, ...input })
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

  /** Update an existing post's title and/or content. Only the author or an admin can update. */
  update: protectedProcedure
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
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx.request.server;
      const { id, ...data } = input;

      // Verify ownership before updating
      const [existing] = await db.select().from(post).where(eq(post.id, id));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (existing.authorId !== ctx.user.id && !ctx.hasRole("admin")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only update your own posts",
        });
      }

      const [updated] = await db
        .update(post)
        .set(data)
        .where(eq(post.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }
      return updated;
    }),

  /** Delete a post by ID. Only the author or an admin can delete. */
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx.request.server;

      // Verify ownership before deleting
      const [existing] = await db
        .select()
        .from(post)
        .where(eq(post.id, input.id));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (existing.authorId !== ctx.user.id && !ctx.hasRole("admin")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own posts",
        });
      }

      await db.delete(post).where(eq(post.id, input.id));
      return { success: true };
    }),
};
