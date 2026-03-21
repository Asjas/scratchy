import { configSchema } from "@scratchy/core";
import { z } from "zod";

/**
 * Application config schema extending the core Fastify server config.
 * Add app-specific environment variables here.
 */
export const appConfigSchema = configSchema.extend({
  /** PostgreSQL connection string. Required when running with a real database. */
  DATABASE_URL: z.string().min(1).optional(),
  /** Redis / DragonflyDB connection URL. Optional — used by the renderer for distributed caching. */
  REDIS_URL: z.string().min(1).optional(),
  /** Drizzle schema namespace. Defaults to "app". */
  DATABASE_SCHEMA: z.string().default("app"),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

/**
 * Loads and validates the application configuration from environment variables.
 * Throws a `ZodError` with a descriptive message if required vars are missing
 * or have invalid values.
 */
export function loadAppConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  return appConfigSchema.parse(env);
}
