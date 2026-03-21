import { createSchema } from "@scratchy/drizzle";

/**
 * PostgreSQL schema namespace for the starter example.
 * Uses the `DATABASE_SCHEMA` env var (default: `"app"`) to namespace
 * all tables, preventing collisions with the default `public` schema.
 */
export const appSchema = createSchema();
