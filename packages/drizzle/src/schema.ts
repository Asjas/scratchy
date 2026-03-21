import { pgSchema } from "drizzle-orm/pg-core";

const DEFAULT_SCHEMA_NAME = "app";

/**
 * Creates a Drizzle `pgSchema` instance for namespace isolation.
 * Uses `DATABASE_SCHEMA` env var if set, otherwise defaults to `"app"`.
 * An explicit `name` argument takes priority over both.
 */
export function createSchema(name?: string) {
  return pgSchema(name ?? process.env.DATABASE_SCHEMA ?? DEFAULT_SCHEMA_NAME);
}
