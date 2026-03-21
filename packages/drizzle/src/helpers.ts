import { timestamp } from "drizzle-orm/pg-core";

/**
 * Shared timestamp columns to spread into every table definition.
 *
 * @example
 * ```ts
 * const user = mySchema.table("user", {
 *   id: text().primaryKey(),
 *   ...timestamps,
 * });
 * ```
 */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
};
