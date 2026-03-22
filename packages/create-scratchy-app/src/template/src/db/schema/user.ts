import { relations } from "drizzle-orm";
import { boolean, index, text } from "drizzle-orm/pg-core";
import { appSchema } from "~/db/my-schema.js";
import { timestamps } from "~/db/schema/columns.helpers.js";
import { post } from "~/db/schema/post.js";

/** Row type returned by SELECT queries. */
export type User = typeof user.$inferSelect;
/** Row type accepted by INSERT statements. */
export type NewUser = typeof user.$inferInsert;

export const userRole = appSchema.enum("user_role", ["member", "admin"]);

/**
 * Users table. Stores authentication identity and profile information.
 * Fields `emailVerified` and `image` are required by the Better Auth
 * drizzle adapter.
 */
export const user = appSchema.table(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    /** Set to `true` after the user confirms their email address. Required by Better Auth. */
    emailVerified: boolean().default(false).notNull(),
    /** Optional profile picture URL. Required by Better Auth. */
    image: text(),
    role: userRole().default("member").notNull(),
    banned: boolean().default(false),
    ...timestamps,
  },
  (table) => [index("user_email_idx").on(table.email)],
);

export const userRelations = relations(user, ({ many }) => ({
  posts: many(post, { relationName: "post_author" }),
}));
