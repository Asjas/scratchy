import { defineCommand } from "citty";
import { consola } from "consola";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export const dbSeedCommand = defineCommand({
  meta: {
    name: "db:seed",
    description: "Run one or all database seed files from src/db/seeds/",
  },
  args: {
    file: {
      type: "positional",
      description:
        "Seed file name without extension (e.g. users); omit to run all seeds",
      required: false,
      default: "",
    },
    env: {
      type: "string",
      description: "Path to the .env file (defaults to .env)",
      default: ".env",
    },
    cwd: {
      type: "string",
      description: "Working directory (defaults to process.cwd())",
      default: "",
    },
  },
  async run({ args }) {
    const cwd = args.cwd || process.cwd();
    const seedsDir = join(cwd, "src", "db", "seeds");

    let files: string[] = [];

    if (args.file) {
      const fileName = args.file.endsWith(".ts")
        ? args.file
        : `${args.file}.ts`;
      files = [join(seedsDir, fileName)];
    } else {
      let entries: string[];
      try {
        entries = readdirSync(seedsDir);
      } catch {
        consola.error(
          `Seeds directory not found: ${seedsDir}\nRun \`scratchy make:seed <name>\` to create a seed file.`,
        );
        process.exit(1);
      }
      files = entries
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(seedsDir, f));
    }

    if (files.length === 0) {
      consola.warn("No seed files found.");
      return;
    }

    const nodeArgs = [`--env-file=${args.env}`];

    for (const file of files) {
      consola.info(`Running seed: ${file}`);
      const result = spawnSync("node", [...nodeArgs, file], {
        stdio: "inherit",
        cwd,
      });

      if (result.status !== 0) {
        consola.error(`Seed failed: ${file}`);
        process.exit(result.status ?? 1);
      }
    }

    consola.success("All seeds completed successfully");
  },
});
