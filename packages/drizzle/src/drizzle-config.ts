import type { Config } from "drizzle-kit";

export interface DrizzleConfigOptions {
  /** Path to the schema files (glob or array). */
  schema: string | string[];
  /** Output directory for migrations. Defaults to `"./drizzle"`. */
  out?: string;
  /** PostgreSQL connection URL. */
  connectionString: string;
}

/**
 * Creates a Drizzle Kit configuration object with Scratchy defaults.
 * Enforces `dialect: "postgresql"` and `casing: "snake_case"`.
 */
export function createDrizzleConfig(options: DrizzleConfigOptions) {
  return {
    dialect: "postgresql",
    out: options.out ?? "./drizzle",
    schema: options.schema,
    casing: "snake_case",
    dbCredentials: {
      url: options.connectionString,
    },
  } satisfies Config;
}
