import { z } from "zod";

export const configSchema = z.object({
  PORT: z
    .string()
    .default("3000")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  TRUST_PROXY: z
    .string()
    .toLowerCase()
    .default("true")
    .transform((val) => val === "true" || val === "1")
    .pipe(z.boolean()),
  BODY_LIMIT: z
    .string()
    .default("10485760") // 10MB
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  /**
   * Comma-separated list of origins that are allowed to make cross-origin
   * requests with credentials (e.g. "https://app.example.com,https://admin.example.com").
   *
   * When set, CORS is restricted to the listed origins.
   * In production, this MUST be set — starting without it causes a startup
   * warning and the default `origin: true` is replaced with a deny-all policy
   * to prevent credential leakage.
   *
   * Leave unset (or empty) in development to allow all origins.
   */
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : [],
    ),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  return configSchema.parse(env);
}
