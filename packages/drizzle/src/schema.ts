import { pgSchema } from "drizzle-orm/pg-core";

const DEFAULT_SCHEMA_NAME = "app";

/**
 * Creates a Drizzle `pgSchema` instance for namespace isolation.
 * Defaults to `"app"` when no name is provided.
 */
export function createSchema(name: string = DEFAULT_SCHEMA_NAME) {
  return pgSchema(name);
}
