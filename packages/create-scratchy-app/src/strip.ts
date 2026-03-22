import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Removes feature-specific files from the scaffolded project when the user
 * opts out of the database feature.
 * Also removes DB-dependent routers and authentication files since they
 * depend on the database layer.
 */
export async function stripDatabaseFiles(dir: string): Promise<void> {
  const toRemove = [
    join(dir, "src", "db"),
    join(dir, "src", "auth.ts"),
    join(dir, "src", "routers", "posts"),
    join(dir, "src", "db", "schema", "auth-tables.ts"),
    join(dir, "drizzle.config.ts"),
    join(dir, "docker-compose.yml"),
  ];

  for (const p of toRemove) {
    if (existsSync(p)) {
      await rm(p, { recursive: true, force: true });
    }
  }

  // Remove DATABASE_URL and related sections from .env.example
  await stripEnvSection(join(dir, ".env.example"), [
    "DATABASE_URL",
    "DATABASE_SCHEMA",
    "REDIS_URL",
  ]);

  // Remove db-related blocks from server.ts using sentinel comments
  // Also strip auth blocks since auth depends on db
  await removeFeatureBlocks(join(dir, "src", "server.ts"), ["db", "auth"]);
  // Remove posts router from routers/index.ts
  await removeFeatureBlocks(join(dir, "src", "routers", "index.ts"), ["posts"]);
}

/**
 * Removes feature-specific files from the scaffolded project when the user
 * opts out of the auth feature.
 */
export async function stripAuthFiles(dir: string): Promise<void> {
  const toRemove = [
    join(dir, "src", "auth.ts"),
    join(dir, "src", "db", "schema", "auth-tables.ts"),
  ];

  for (const p of toRemove) {
    if (existsSync(p)) {
      await rm(p, { recursive: true, force: true });
    }
  }

  // Remove auth sections from .env.example
  await stripEnvSection(join(dir, ".env.example"), [
    "BETTER_AUTH_SECRET",
    "ORIGIN",
  ]);

  // Update schema/index.ts to not export auth-tables
  const schemaIndex = join(dir, "src", "db", "schema", "index.ts");
  if (existsSync(schemaIndex)) {
    const content = await readFile(schemaIndex, "utf8");
    const updated = content
      .split("\n")
      .filter((line) => !line.includes("auth-tables"))
      .join("\n");
    await writeFile(schemaIndex, updated, "utf8");
  }

  // Remove auth blocks from server.ts using sentinel comments
  await removeFeatureBlocks(join(dir, "src", "server.ts"), ["auth"]);
}

/**
 * Removes feature-specific files from the scaffolded project when the user
 * opts out of the renderer feature.
 */
export async function stripRendererFiles(dir: string): Promise<void> {
  const toRemove = [join(dir, "src", "renderer")];

  for (const p of toRemove) {
    if (existsSync(p)) {
      await rm(p, { recursive: true, force: true });
    }
  }

  // Remove renderer blocks from server.ts using sentinel comments
  await removeFeatureBlocks(join(dir, "src", "server.ts"), ["renderer"]);
}

/**
 * Strips environment variable keys from a `.env.example` file.
 * Comments (lines starting with `#`) are always preserved.
 */
export async function stripEnvSection(
  envFile: string,
  keys: string[],
): Promise<void> {
  if (!existsSync(envFile)) return;

  const content = await readFile(envFile, "utf8");
  const lines = content.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return true;
    return !keys.some((key) => trimmed.startsWith(`${key}=`));
  });
  await writeFile(envFile, filtered.join("\n"), "utf8");
}

/**
 * Removes lines between `// @scratchy-feature <name>-start` and
 * `// @scratchy-feature <name>-end` sentinel comments (inclusive), as well as
 * import lines for feature-specific packages.
 *
 * Block sentinels handle multi-line code sections. Import lines are matched
 * by package name patterns since prettier's import sorting may reorder them
 * across sentinel blocks.
 *
 * Performs a single file read/write pass for all features.
 */
export async function removeFeatureBlocks(
  filePath: string,
  features: string[],
): Promise<void> {
  if (!existsSync(filePath)) return;

  const content = await readFile(filePath, "utf8");

  // Build sets for block sentinel tags
  const startTags = new Set<string>();
  const endTags = new Set<string>();
  for (const feature of features) {
    startTags.add(`// @scratchy-feature ${feature}-start`);
    endTags.add(`// @scratchy-feature ${feature}-end`);
  }

  // Import patterns to strip per feature (unique package/module names)
  const importPatterns: string[] = [];
  for (const feature of features) {
    if (feature === "db") {
      importPatterns.push("@scratchyjs/drizzle");
      importPatterns.push("~/db/schema/index.js");
    } else if (feature === "auth") {
      importPatterns.push("@scratchyjs/auth");
      importPatterns.push("~/auth.js");
    } else if (feature === "renderer") {
      importPatterns.push("@scratchyjs/renderer");
    } else if (feature === "posts") {
      importPatterns.push("~/routers/posts/queries.js");
      importPatterns.push("~/routers/posts/mutations.js");
    }
  }

  const lines = content.split("\n");
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle block sentinel start
    if (startTags.has(trimmed)) {
      skipping = true;
      continue;
    }
    // Handle block sentinel end
    if (endTags.has(trimmed)) {
      skipping = false;
      continue;
    }
    // Skip lines inside a block sentinel
    if (skipping) continue;

    // Remove import lines matching feature-specific packages
    if (
      trimmed.startsWith("import ") &&
      importPatterns.some((pattern) => line.includes(pattern))
    ) {
      continue;
    }

    result.push(line);
  }

  await writeFile(filePath, result.join("\n"), "utf8");
}

/**
 * After all feature stripping is complete, remove any remaining sentinel
 * comments from generated files so they don't appear in user projects.
 */
export async function cleanSentinelComments(dir: string): Promise<void> {
  const serverFile = join(dir, "src", "server.ts");
  if (!existsSync(serverFile)) return;

  const content = await readFile(serverFile, "utf8");
  const cleaned = content
    .split("\n")
    .filter((line) => !line.trim().startsWith("// @scratchy-feature "))
    .join("\n");
  await writeFile(serverFile, cleaned, "utf8");
}
