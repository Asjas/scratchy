import { configSchema } from "@scratchyjs/core";
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
  /**
   * Secret key used by Better Auth to sign session tokens and cookies.
   * Must be at least 32 characters. Generate with:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /**
   * Application origin URL used by Better Auth for trusted-origin validation.
   * Example: "http://localhost:3000" or "https://my-app.example.com".
   */
  ORIGIN: z.string().url().optional(),
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
