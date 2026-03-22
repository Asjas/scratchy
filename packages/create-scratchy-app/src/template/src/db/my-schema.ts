import { createSchema } from "@scratchyjs/drizzle";

/**
 * PostgreSQL schema namespace.
 * Uses the `DATABASE_SCHEMA` env var (default: `"app"`) to namespace
 * all tables, preventing collisions with the default `public` schema.
 */
export const appSchema = createSchema();
