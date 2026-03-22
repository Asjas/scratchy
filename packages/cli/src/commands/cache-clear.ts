import { defineCommand } from "citty";
import { consola } from "consola";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const CACHE_DIRS = [
  "dist",
  ".qwik",
  "node_modules/.vite",
  "node_modules/.cache",
] as const;

export const cacheClearCommand = defineCommand({
  meta: {
    name: "cache:clear",
    description: "Remove build output and local cache directories",
  },
  args: {
    cwd: {
      type: "string",
      description: "Working directory (defaults to process.cwd())",
      default: "",
    },
  },
  async run({ args }) {
    const cwd = args.cwd || process.cwd();

    consola.info("Clearing cache directories…");

    let cleared = 0;
    for (const dir of CACHE_DIRS) {
      const fullPath = join(cwd, dir);
      try {
        await rm(fullPath, { recursive: true, force: true });
        consola.success(`Removed ${dir}`);
        cleared++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        consola.warn(`Skipped ${dir}: ${message}`);
      }
    }

    consola.success(
      `Cache cleared (${cleared}/${CACHE_DIRS.length} directories removed)`,
    );
  },
});
