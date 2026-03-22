import { timestamps } from "@scratchyjs/drizzle";

/**
 * Re-exports the shared `timestamps` spread object from `@scratchyjs/drizzle`
 * so local schema files can import from a single in-project location.
 *
 * @example
 * ```ts
 * import { timestamps } from "~/db/schema/columns.helpers.js";
 *
 * export const user = appSchema.table("user", {
 *   id: text().primaryKey(),
 *   ...timestamps,
 * });
 * ```
 */
export { timestamps };
