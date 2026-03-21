import { appSchema } from "../my-schema.js";
import { timestamps } from "./columns.helpers.js";
import { user } from "./user.js";
import { relations } from "drizzle-orm";
import { index, text } from "drizzle-orm/pg-core";

/** Row type returned by SELECT queries. */
export type Post = typeof post.$inferSelect;
/** Row type accepted by INSERT statements. */
export type NewPost = typeof post.$inferInsert;

/**
 * Posts table. Stores blog-style content authored by users.
 */
export const post = appSchema.table(
  "post",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    content: text().notNull(),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("post_author_id_idx").on(table.authorId),
    index("post_created_at_idx").on(table.createdAt),
  ],
);

export const postRelations = relations(post, ({ one }) => ({
  author: one(user, {
    fields: [post.authorId],
    references: [user.id],
    relationName: "post_author",
  }),
}));
