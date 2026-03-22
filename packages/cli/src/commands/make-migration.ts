import { toKebabCase } from "../utils/names.js";
import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";

function migrationTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export const makeMigrationCommand = defineCommand({
  meta: {
    name: "make:migration",
    description:
      "Generate a blank custom SQL migration file (for manual data migrations and custom SQL)",
  },
  args: {
    name: {
      type: "positional",
      description: "Migration name in snake_case (e.g. add_role_to_users)",
      required: true,
    },
    cwd: {
      type: "string",
      description: "Working directory (defaults to process.cwd())",
      default: "",
    },
  },
  async run({ args }) {
    const name = toKebabCase(args.name).replace(/-/g, "_");
    const cwd = args.cwd || process.cwd();
    const timestamp = migrationTimestamp();
    const fileName = `${timestamp}_${name}.sql`;

    consola.info(`Generating migration: ${fileName}`);

    const context = { name, timestamp };
    const content = renderTemplate("migration.sql.hbs", context);

    await writeFile(join(cwd, "src", "db", "migrations", fileName), content);

    consola.success(`Migration ${fileName} generated successfully`);
    consola.info(
      "NOTE: For schema-driven migrations, use `pnpm drizzle-kit generate` instead.",
    );
  },
});
