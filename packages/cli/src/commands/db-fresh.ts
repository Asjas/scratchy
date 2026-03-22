import { defineCommand } from "citty";
import { consola } from "consola";
import { spawnSync } from "node:child_process";

export const dbFreshCommand = defineCommand({
  meta: {
    name: "db:fresh",
    description:
      "Drop all tables and re-apply all migrations (destructive — development only)",
  },
  args: {
    config: {
      type: "string",
      description:
        "Path to the Drizzle config file (defaults to drizzle.config.ts)",
      default: "drizzle.config.ts",
    },
    cwd: {
      type: "string",
      description: "Working directory (defaults to process.cwd())",
      default: "",
    },
  },
  async run({ args }) {
    const cwd = args.cwd || process.cwd();
    const configFlag = `--config=${args.config}`;

    consola.warn(
      "db:fresh will DROP ALL TABLES and re-apply all migrations. This is destructive!",
    );

    consola.info("Step 1/2 — Dropping all tables…");
    const dropResult = spawnSync(
      "pnpm",
      ["drizzle-kit", "drop", "--force", configFlag],
      { stdio: "inherit", cwd },
    );

    if (dropResult.status !== 0) {
      consola.error("drizzle-kit drop failed.");
      process.exit(dropResult.status ?? 1);
    }

    consola.info("Step 2/2 — Applying migrations…");
    const migrateResult = spawnSync(
      "pnpm",
      ["drizzle-kit", "migrate", configFlag],
      { stdio: "inherit", cwd },
    );

    if (migrateResult.status !== 0) {
      consola.error("drizzle-kit migrate failed.");
      process.exit(migrateResult.status ?? 1);
    }

    consola.success("Database reset and migrations applied successfully");
  },
});
