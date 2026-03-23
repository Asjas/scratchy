import { loadConfig } from "@scratchyjs/core";
import type { Config } from "@scratchyjs/core";

/**
 * Application config type for the streaming-ssr example.
 * Uses the core Fastify server config directly — this example intentionally
 * has no database or auth to stay focused on the streaming SSR rendering
 * pipeline.
 */
export type AppConfig = Config;

/**
 * Loads and validates the application configuration from environment variables.
 * Throws a `ZodError` with a descriptive message if required vars are missing
 * or have invalid values.
 */
export function loadAppConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  return loadConfig(env);
}
