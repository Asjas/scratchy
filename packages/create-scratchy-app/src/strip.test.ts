import {
  cleanSentinelComments,
  removeFeatureBlocks,
  stripAuthFiles,
  stripDatabaseFiles,
  stripEnvSection,
  stripRendererFiles,
} from "./strip.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// stripEnvSection
// ---------------------------------------------------------------------------

describe("stripEnvSection", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-strip-env-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("removes matching environment variable lines", async () => {
    const envFile = join(testDir, ".env.example");
    await writeFile(
      envFile,
      [
        "# App config",
        "PORT=3000",
        "DATABASE_URL=postgres://localhost:5432/app",
        "REDIS_URL=redis://localhost:6379",
        "NODE_ENV=development",
      ].join("\n"),
    );

    await stripEnvSection(envFile, ["DATABASE_URL", "REDIS_URL"]);

    const content = await readFile(envFile, "utf8");
    expect(content).toContain("PORT=3000");
    expect(content).toContain("NODE_ENV=development");
    expect(content).not.toContain("DATABASE_URL");
    expect(content).not.toContain("REDIS_URL");
  });

  it("preserves comment lines even if they mention a key", async () => {
    const envFile = join(testDir, ".env.example");
    await writeFile(
      envFile,
      [
        "# DATABASE_URL is the primary connection string",
        "DATABASE_URL=postgres://localhost:5432/app",
        "PORT=3000",
      ].join("\n"),
    );

    await stripEnvSection(envFile, ["DATABASE_URL"]);

    const content = await readFile(envFile, "utf8");
    expect(content).toContain(
      "# DATABASE_URL is the primary connection string",
    );
    expect(content).not.toContain("DATABASE_URL=postgres://");
    expect(content).toContain("PORT=3000");
  });

  it("does nothing if the file does not exist", async () => {
    // Should not throw
    await stripEnvSection(join(testDir, "nonexistent.env"), ["KEY"]);
  });

  it("handles an empty keys list (no changes)", async () => {
    const envFile = join(testDir, ".env.example");
    const original = "PORT=3000\nHOST=localhost";
    await writeFile(envFile, original);

    await stripEnvSection(envFile, []);

    const content = await readFile(envFile, "utf8");
    expect(content).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// removeFeatureBlocks
// ---------------------------------------------------------------------------

describe("removeFeatureBlocks", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-strip-blocks-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("removes lines between sentinel start and end tags (inclusive)", async () => {
    const file = join(testDir, "server.ts");
    await writeFile(
      file,
      [
        'import { createServer } from "@scratchyjs/core";',
        "",
        "// @scratchy-feature db-start",
        "const shouldRegisterDb = true;",
        "if (shouldRegisterDb) {",
        "  // register db",
        "}",
        "// @scratchy-feature db-end",
        "",
        "const server = await createServer();",
      ].join("\n"),
    );

    await removeFeatureBlocks(file, ["db"]);

    const content = await readFile(file, "utf8");
    expect(content).not.toContain("shouldRegisterDb");
    expect(content).not.toContain("@scratchy-feature db");
    expect(content).toContain("createServer");
  });

  it("removes import lines matching feature-specific packages", async () => {
    const file = join(testDir, "server.ts");
    await writeFile(
      file,
      [
        'import { createServer } from "@scratchyjs/core";',
        'import drizzlePlugin from "@scratchyjs/drizzle/plugin";',
        'import * as dbSchemas from "~/db/schema/index.js";',
        "",
        "const server = await createServer();",
      ].join("\n"),
    );

    await removeFeatureBlocks(file, ["db"]);

    const content = await readFile(file, "utf8");
    expect(content).not.toContain("@scratchyjs/drizzle");
    expect(content).not.toContain("~/db/schema/index.js");
    expect(content).toContain("@scratchyjs/core");
  });

  it("removes auth-specific imports", async () => {
    const file = join(testDir, "server.ts");
    await writeFile(
      file,
      [
        'import { createServer } from "@scratchyjs/core";',
        'import authPlugin from "@scratchyjs/auth/plugin";',
        'import { createAppAuth } from "~/auth.js";',
        "",
        "const server = await createServer();",
      ].join("\n"),
    );

    await removeFeatureBlocks(file, ["auth"]);

    const content = await readFile(file, "utf8");
    expect(content).not.toContain("@scratchyjs/auth");
    expect(content).not.toContain("~/auth.js");
    expect(content).toContain("@scratchyjs/core");
  });

  it("removes renderer-specific imports", async () => {
    const file = join(testDir, "server.ts");
    await writeFile(
      file,
      [
        'import { createServer } from "@scratchyjs/core";',
        'import { createSSRHandler } from "@scratchyjs/renderer";',
        "",
        "const server = await createServer();",
      ].join("\n"),
    );

    await removeFeatureBlocks(file, ["renderer"]);

    const content = await readFile(file, "utf8");
    expect(content).not.toContain("@scratchyjs/renderer");
    expect(content).toContain("@scratchyjs/core");
  });

  it("handles multiple feature removals in a single call", async () => {
    const file = join(testDir, "server.ts");
    await writeFile(
      file,
      [
        'import { createServer } from "@scratchyjs/core";',
        'import drizzlePlugin from "@scratchyjs/drizzle/plugin";',
        'import authPlugin from "@scratchyjs/auth/plugin";',
        "",
        "// @scratchy-feature db-start",
        "const db = true;",
        "// @scratchy-feature db-end",
        "",
        "// @scratchy-feature auth-start",
        "const auth = true;",
        "// @scratchy-feature auth-end",
        "",
        "const server = await createServer();",
      ].join("\n"),
    );

    await removeFeatureBlocks(file, ["db", "auth"]);

    const content = await readFile(file, "utf8");
    expect(content).not.toContain("const db");
    expect(content).not.toContain("const auth");
    expect(content).not.toContain("@scratchyjs/drizzle");
    expect(content).not.toContain("@scratchyjs/auth");
    expect(content).toContain("@scratchyjs/core");
  });

  it("does nothing for non-existent files", async () => {
    await removeFeatureBlocks(join(testDir, "nonexistent.ts"), ["db"]);
    // Should not throw
  });

  it("preserves non-matching lines and non-matching imports", async () => {
    const file = join(testDir, "server.ts");
    const original = [
      'import { createServer } from "@scratchyjs/core";',
      'import trpcPlugin from "@scratchyjs/trpc/plugin";',
      "",
      "const server = await createServer();",
    ].join("\n");
    await writeFile(file, original);

    await removeFeatureBlocks(file, ["db"]);

    const content = await readFile(file, "utf8");
    expect(content).toBe(original);
  });

  it("strips posts import lines for the posts feature", async () => {
    const file = join(testDir, "server.ts");
    await writeFile(
      file,
      [
        'import { createServer } from "@scratchyjs/core";',
        'import { postQueries } from "~/routers/posts/queries.js";',
        'import { postMutations } from "~/routers/posts/mutations.js";',
        "",
        "const server = await createServer();",
      ].join("\n"),
    );

    await removeFeatureBlocks(file, ["posts"]);

    const content = await readFile(file, "utf8");
    expect(content).not.toContain("~/routers/posts/queries.js");
    expect(content).not.toContain("~/routers/posts/mutations.js");
    expect(content).toContain("@scratchyjs/core");
  });
});

// ---------------------------------------------------------------------------
// cleanSentinelComments
// ---------------------------------------------------------------------------

describe("cleanSentinelComments", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-clean-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(join(testDir, "src"), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("removes all sentinel comment lines from server.ts", async () => {
    const serverFile = join(testDir, "src", "server.ts");
    await writeFile(
      serverFile,
      [
        'import { createServer } from "@scratchyjs/core";',
        "// @scratchy-feature db-start",
        "const db = true;",
        "// @scratchy-feature db-end",
        "  // @scratchy-feature auth-start",
        "const auth = true;",
        "  // @scratchy-feature auth-end",
        "const server = await createServer();",
      ].join("\n"),
    );

    await cleanSentinelComments(testDir);

    const content = await readFile(serverFile, "utf8");
    expect(content).not.toContain("@scratchy-feature");
    expect(content).toContain("const db = true;");
    expect(content).toContain("const auth = true;");
    expect(content).toContain("createServer");
  });

  it("does nothing if server.ts does not exist", async () => {
    // Should not throw
    await cleanSentinelComments(testDir);
  });

  it("leaves file unchanged if no sentinel comments present", async () => {
    const serverFile = join(testDir, "src", "server.ts");
    const original = 'const server = await createServer();\nconsole.log("ok");';
    await writeFile(serverFile, original);

    await cleanSentinelComments(testDir);

    const content = await readFile(serverFile, "utf8");
    expect(content).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// stripDatabaseFiles
// ---------------------------------------------------------------------------

describe("stripDatabaseFiles", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-strip-db-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    // Create a minimal project structure
    await mkdir(join(testDir, "src", "db", "schema"), { recursive: true });
    await mkdir(join(testDir, "src", "renderer"), { recursive: true });
    await writeFile(join(testDir, "src", "auth.ts"), "export const auth = {};");
    await writeFile(
      join(testDir, "src", "db", "index.ts"),
      "export const db = {};",
    );
    await writeFile(
      join(testDir, "src", "db", "schema", "auth-tables.ts"),
      "export {};",
    );
    await writeFile(join(testDir, "drizzle.config.ts"), "export default {};");
    await writeFile(join(testDir, "docker-compose.yml"), "version: '3'");
    await writeFile(
      join(testDir, ".env.example"),
      [
        "PORT=3000",
        "DATABASE_URL=postgres://localhost:5432/app",
        "DATABASE_SCHEMA=my_schema",
        "REDIS_URL=redis://localhost:6379",
        "NODE_ENV=development",
      ].join("\n"),
    );
    await writeFile(
      join(testDir, "src", "server.ts"),
      [
        'import { createServer } from "@scratchyjs/core";',
        'import drizzlePlugin from "@scratchyjs/drizzle/plugin";',
        'import authPlugin from "@scratchyjs/auth/plugin";',
        "",
        "// @scratchy-feature db-start",
        "const db = true;",
        "// @scratchy-feature db-end",
        "",
        "// @scratchy-feature auth-start",
        "const auth = true;",
        "// @scratchy-feature auth-end",
        "",
        "const server = await createServer();",
      ].join("\n"),
    );
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("removes the db directory", async () => {
    await stripDatabaseFiles(testDir);
    expect(existsSync(join(testDir, "src", "db"))).toBe(false);
  });

  it("removes auth.ts (auth depends on db)", async () => {
    await stripDatabaseFiles(testDir);
    expect(existsSync(join(testDir, "src", "auth.ts"))).toBe(false);
  });

  it("removes drizzle.config.ts", async () => {
    await stripDatabaseFiles(testDir);
    expect(existsSync(join(testDir, "drizzle.config.ts"))).toBe(false);
  });

  it("removes docker-compose.yml", async () => {
    await stripDatabaseFiles(testDir);
    expect(existsSync(join(testDir, "docker-compose.yml"))).toBe(false);
  });

  it("strips DATABASE_URL, DATABASE_SCHEMA, and REDIS_URL from .env.example", async () => {
    await stripDatabaseFiles(testDir);

    const content = await readFile(join(testDir, ".env.example"), "utf8");
    expect(content).toContain("PORT=3000");
    expect(content).toContain("NODE_ENV=development");
    expect(content).not.toContain("DATABASE_URL");
    expect(content).not.toContain("DATABASE_SCHEMA");
    expect(content).not.toContain("REDIS_URL");
  });

  it("removes db and auth blocks from server.ts", async () => {
    await stripDatabaseFiles(testDir);

    const content = await readFile(join(testDir, "src", "server.ts"), "utf8");
    expect(content).not.toContain("const db = true;");
    expect(content).not.toContain("const auth = true;");
    expect(content).not.toContain("@scratchyjs/drizzle");
    expect(content).not.toContain("@scratchyjs/auth");
    expect(content).toContain("@scratchyjs/core");
  });
});

// ---------------------------------------------------------------------------
// stripAuthFiles
// ---------------------------------------------------------------------------

describe("stripAuthFiles", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-strip-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(join(testDir, "src", "db", "schema"), { recursive: true });
    await writeFile(join(testDir, "src", "auth.ts"), "export const auth = {};");
    await writeFile(
      join(testDir, "src", "db", "schema", "auth-tables.ts"),
      "export {};",
    );
    await writeFile(
      join(testDir, "src", "db", "schema", "index.ts"),
      [
        'export * from "./user.js";',
        'export * from "./auth-tables.js";',
        'export * from "./post.js";',
      ].join("\n"),
    );
    await writeFile(
      join(testDir, ".env.example"),
      [
        "PORT=3000",
        "DATABASE_URL=postgres://localhost:5432/app",
        "BETTER_AUTH_SECRET=my-secret",
        "ORIGIN=http://localhost:3000",
      ].join("\n"),
    );
    await writeFile(
      join(testDir, "src", "server.ts"),
      [
        'import { createServer } from "@scratchyjs/core";',
        'import authPlugin from "@scratchyjs/auth/plugin";',
        'import { createAppAuth } from "~/auth.js";',
        "",
        "// @scratchy-feature auth-start",
        "const auth = true;",
        "// @scratchy-feature auth-end",
        "",
        "const server = await createServer();",
      ].join("\n"),
    );
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("removes auth.ts", async () => {
    await stripAuthFiles(testDir);
    expect(existsSync(join(testDir, "src", "auth.ts"))).toBe(false);
  });

  it("removes auth-tables.ts", async () => {
    await stripAuthFiles(testDir);
    expect(
      existsSync(join(testDir, "src", "db", "schema", "auth-tables.ts")),
    ).toBe(false);
  });

  it("strips BETTER_AUTH_SECRET and ORIGIN from .env.example", async () => {
    await stripAuthFiles(testDir);

    const content = await readFile(join(testDir, ".env.example"), "utf8");
    expect(content).toContain("PORT=3000");
    expect(content).toContain("DATABASE_URL");
    expect(content).not.toContain("BETTER_AUTH_SECRET");
    expect(content).not.toContain("ORIGIN=");
  });

  it("removes auth-tables export from schema/index.ts", async () => {
    await stripAuthFiles(testDir);

    const content = await readFile(
      join(testDir, "src", "db", "schema", "index.ts"),
      "utf8",
    );
    expect(content).not.toContain("auth-tables");
    expect(content).toContain("user.js");
    expect(content).toContain("post.js");
  });

  it("removes auth blocks and imports from server.ts", async () => {
    await stripAuthFiles(testDir);

    const content = await readFile(join(testDir, "src", "server.ts"), "utf8");
    expect(content).not.toContain("const auth = true;");
    expect(content).not.toContain("@scratchyjs/auth");
    expect(content).not.toContain("~/auth.js");
    expect(content).toContain("@scratchyjs/core");
  });
});

// ---------------------------------------------------------------------------
// stripRendererFiles
// ---------------------------------------------------------------------------

describe("stripRendererFiles", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-strip-renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(join(testDir, "src", "renderer"), { recursive: true });
    await writeFile(
      join(testDir, "src", "renderer", "worker.ts"),
      "export default () => {};",
    );
    await writeFile(
      join(testDir, "src", "server.ts"),
      [
        'import { createServer } from "@scratchyjs/core";',
        'import { createSSRHandler } from "@scratchyjs/renderer";',
        "",
        "// @scratchy-feature renderer-start",
        "const renderer = true;",
        "server.get('/*', createSSRHandler());",
        "// @scratchy-feature renderer-end",
        "",
        "const server = await createServer();",
      ].join("\n"),
    );
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("removes the renderer directory", async () => {
    await stripRendererFiles(testDir);
    expect(existsSync(join(testDir, "src", "renderer"))).toBe(false);
  });

  it("removes renderer blocks and imports from server.ts", async () => {
    await stripRendererFiles(testDir);

    const content = await readFile(join(testDir, "src", "server.ts"), "utf8");
    expect(content).not.toContain("const renderer = true;");
    expect(content).not.toContain("createSSRHandler");
    expect(content).not.toContain("@scratchyjs/renderer");
    expect(content).toContain("@scratchyjs/core");
  });
});
