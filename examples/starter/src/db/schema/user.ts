import { appSchema } from "../my-schema.js";
import { timestamps } from "./columns.helpers.js";
import { post } from "./post.js";
import { relations } from "drizzle-orm";
import { boolean, index, text } from "drizzle-orm/pg-core";

/** Row type returned by SELECT queries. */
export type User = typeof user.$inferSelect;
/** Row type accepted by INSERT statements. */
export type NewUser = typeof user.$inferInsert;

export const userRole = appSchema.enum("user_role", ["member", "admin"]);

/**
 * Users table. Stores authentication identity and profile information.
 */
export const user = appSchema.table(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    role: userRole().default("member").notNull(),
    banned: boolean().default(false),
    ...timestamps,
  },
  (table) => [index("user_email_idx").on(table.email)],
);

export const userRelations = relations(user, ({ many }) => ({
  posts: many(post, { relationName: "post_author" }),
}));
