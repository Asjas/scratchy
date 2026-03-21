import { timestamps } from "@scratchy/drizzle";

/**
 * Re-exports the shared `timestamps` spread object from `@scratchy/drizzle`
 * so local schema files can import from a single in-project location.
 *
 * @example
 * ```ts
 * import { timestamps } from "../columns.helpers.js";
 *
 * export const user = appSchema.table("user", {
 *   id: text().primaryKey(),
 *   ...timestamps,
 * });
 * ```
 */
export { timestamps };
