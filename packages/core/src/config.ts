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
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  return configSchema.parse(env);
}
