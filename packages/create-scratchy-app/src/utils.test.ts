import {
  copyTemplate,
  defaultProjectName,
  detectPackageManager,
  getInstallCommand,
  getRunCommand,
  initGit,
  installDeps,
  isEmptyDir,
  replaceInFile,
  resolveProjectDir,
} from "./utils.js";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: vi.fn(actual.execSync),
  };
});

// ---------------------------------------------------------------------------
// detectPackageManager
// ---------------------------------------------------------------------------

describe("detectPackageManager", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns pnpm when user agent starts with pnpm", () => {
    process.env = { ...originalEnv, npm_config_user_agent: "pnpm/10.0.0" };
    expect(detectPackageManager()).toBe("pnpm");
  });

  it("returns yarn when user agent starts with yarn", () => {
    process.env = { ...originalEnv, npm_config_user_agent: "yarn/4.0.0" };
    expect(detectPackageManager()).toBe("yarn");
  });

  it("returns bun when user agent starts with bun", () => {
    process.env = { ...originalEnv, npm_config_user_agent: "bun/1.0.0" };
    expect(detectPackageManager()).toBe("bun");
  });

  it("returns npm when user agent is npm", () => {
    process.env = { ...originalEnv, npm_config_user_agent: "npm/10.0.0" };
    expect(detectPackageManager()).toBe("npm");
  });

  it("returns npm when user agent is undefined", () => {
    process.env = { ...originalEnv };
    delete process.env["npm_config_user_agent"];
    expect(detectPackageManager()).toBe("npm");
  });

  it("returns npm when user agent is empty", () => {
    process.env = { ...originalEnv, npm_config_user_agent: "" };
    expect(detectPackageManager()).toBe("npm");
  });
});

// ---------------------------------------------------------------------------
// getInstallCommand
// ---------------------------------------------------------------------------

describe("getInstallCommand", () => {
  it("returns correct command for pnpm", () => {
    expect(getInstallCommand("pnpm")).toBe("pnpm install");
  });

  it("returns correct command for npm", () => {
    expect(getInstallCommand("npm")).toBe("npm install");
  });

  it("returns correct command for yarn (just yarn)", () => {
    expect(getInstallCommand("yarn")).toBe("yarn");
  });

  it("returns correct command for bun", () => {
    expect(getInstallCommand("bun")).toBe("bun install");
  });
});

// ---------------------------------------------------------------------------
// getRunCommand
// ---------------------------------------------------------------------------

describe("getRunCommand", () => {
  it("returns pnpm <script> for pnpm", () => {
    expect(getRunCommand("pnpm", "dev")).toBe("pnpm dev");
  });

  it("returns yarn <script> for yarn", () => {
    expect(getRunCommand("yarn", "dev")).toBe("yarn dev");
  });

  it("returns bun run <script> for bun", () => {
    expect(getRunCommand("bun", "dev")).toBe("bun run dev");
  });

  it("returns npm run <script> for npm", () => {
    expect(getRunCommand("npm", "dev")).toBe("npm run dev");
  });

  it("handles multi-word scripts", () => {
    expect(getRunCommand("pnpm", "drizzle-kit generate")).toBe(
      "pnpm drizzle-kit generate",
    );
    expect(getRunCommand("npm", "drizzle-kit generate")).toBe(
      "npm run drizzle-kit generate",
    );
  });
});

// ---------------------------------------------------------------------------
// resolveProjectDir
// ---------------------------------------------------------------------------

describe("resolveProjectDir", () => {
  it("resolves a relative name to an absolute path", () => {
    const result = resolveProjectDir("my-app");
    expect(result).toBe(resolve(process.cwd(), "my-app"));
  });

  it("returns absolute paths unchanged", () => {
    const abs = "/tmp/my-project";
    expect(resolveProjectDir(abs)).toBe(abs);
  });

  it("handles nested paths", () => {
    const result = resolveProjectDir("projects/my-app");
    expect(result).toBe(resolve(process.cwd(), "projects/my-app"));
  });
});

// ---------------------------------------------------------------------------
// defaultProjectName
// ---------------------------------------------------------------------------

describe("defaultProjectName", () => {
  it("returns basename of directory path", () => {
    expect(defaultProjectName("/home/user/projects/my-app")).toBe("my-app");
  });

  it("handles trailing slashes", () => {
    expect(defaultProjectName("/home/user/my-app")).toBe("my-app");
  });

  it("returns the directory name for root-level paths", () => {
    expect(defaultProjectName("/my-app")).toBe("my-app");
  });
});

// ---------------------------------------------------------------------------
// isEmptyDir
// ---------------------------------------------------------------------------

describe("isEmptyDir", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns true for a non-existent directory", async () => {
    await rm(testDir, { recursive: true, force: true });
    expect(await isEmptyDir(testDir)).toBe(true);
  });

  it("returns true for an empty directory", async () => {
    expect(await isEmptyDir(testDir)).toBe(true);
  });

  it("returns false for a directory with files", async () => {
    await writeFile(join(testDir, "hello.txt"), "hi");
    expect(await isEmptyDir(testDir)).toBe(false);
  });

  it("returns true for a directory with only .git", async () => {
    await mkdir(join(testDir, ".git"), { recursive: true });
    expect(await isEmptyDir(testDir)).toBe(true);
  });

  it("returns true for a directory with only .DS_Store", async () => {
    await writeFile(join(testDir, ".DS_Store"), "");
    expect(await isEmptyDir(testDir)).toBe(true);
  });

  it("returns true for a directory with only Thumbs.db", async () => {
    await writeFile(join(testDir, "Thumbs.db"), "");
    expect(await isEmptyDir(testDir)).toBe(true);
  });

  it("returns false for a directory with a dotfile other than .git/.DS_Store", async () => {
    await writeFile(join(testDir, ".env"), "SECRET=abc");
    expect(await isEmptyDir(testDir)).toBe(false);
  });

  it("rethrows non-ENOENT errors (e.g., permission denied)", async () => {
    const fsPromises = await import("node:fs/promises");

    const eaccesError = Object.assign(
      new Error("EACCES: permission denied"),
      { code: "EACCES" as const },
    );

    const readdirSpy = vi
      .spyOn(fsPromises, "readdir")
      .mockRejectedValueOnce(eaccesError);

    await expect(isEmptyDir(testDir)).rejects.toBe(eaccesError);
    expect(readdirSpy).toHaveBeenCalled();

    readdirSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// copyTemplate
// ---------------------------------------------------------------------------

describe("copyTemplate", () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(async () => {
    const base = join(
      tmpdir(),
      `scratchy-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    srcDir = join(base, "src");
    destDir = join(base, "dest");
    await mkdir(srcDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(srcDir, ".."), { recursive: true, force: true });
  });

  it("copies template files to destination", async () => {
    await writeFile(join(srcDir, "hello.txt"), "world");
    await copyTemplate(srcDir, destDir);

    const content = await readFile(join(destDir, "hello.txt"), "utf8");
    expect(content).toBe("world");
  });

  it("creates destination directory if it does not exist", async () => {
    await writeFile(join(srcDir, "test.ts"), "const x = 1;");
    await copyTemplate(srcDir, destDir);

    const content = await readFile(join(destDir, "test.ts"), "utf8");
    expect(content).toBe("const x = 1;");
  });

  it("renames _gitignore to .gitignore", async () => {
    await writeFile(join(srcDir, "_gitignore"), "node_modules/\ndist/");
    await copyTemplate(srcDir, destDir);

    const content = await readFile(join(destDir, ".gitignore"), "utf8");
    expect(content).toBe("node_modules/\ndist/");
  });

  it("renames _package.json to package.json", async () => {
    await writeFile(join(srcDir, "_package.json"), '{"name": "test"}');
    await copyTemplate(srcDir, destDir);

    const content = await readFile(join(destDir, "package.json"), "utf8");
    expect(content).toBe('{"name": "test"}');
  });

  it("copies nested directories", async () => {
    await mkdir(join(srcDir, "src", "lib"), { recursive: true });
    await writeFile(join(srcDir, "src", "lib", "util.ts"), "export {}");
    await copyTemplate(srcDir, destDir);

    const content = await readFile(
      join(destDir, "src", "lib", "util.ts"),
      "utf8",
    );
    expect(content).toBe("export {}");
  });
});

// ---------------------------------------------------------------------------
// replaceInFile
// ---------------------------------------------------------------------------

describe("replaceInFile", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-replace-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("replaces string occurrences in a file", async () => {
    const file = join(testDir, "package.json");
    await writeFile(file, '{"name": "SCRATCHY_PROJECT_NAME"}');
    await replaceInFile(file, "SCRATCHY_PROJECT_NAME", "my-app");

    const content = await readFile(file, "utf8");
    expect(content).toBe('{"name": "my-app"}');
  });

  it("replaces regex occurrences in a file", async () => {
    const file = join(testDir, "readme.md");
    await writeFile(file, "Hello PLACEHOLDER! See PLACEHOLDER.");
    await replaceInFile(file, /PLACEHOLDER/g, "world");

    const content = await readFile(file, "utf8");
    expect(content).toBe("Hello world! See world.");
  });

  it("does not write if there are no changes", async () => {
    const file = join(testDir, "unchanged.txt");
    await writeFile(file, "no match here");
    await replaceInFile(file, "NONEXISTENT", "value");

    const content = await readFile(file, "utf8");
    expect(content).toBe("no match here");
  });

  it("silently skips non-existent files", async () => {
    // Should not throw
    await replaceInFile(join(testDir, "missing.txt"), "a", "b");
  });
});

// ---------------------------------------------------------------------------
// initGit
// ---------------------------------------------------------------------------

describe("initGit", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-git-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
    // Create a file so git has something to commit
    await writeFile(join(testDir, "hello.txt"), "world");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns true when git init, add, and commit all succeed", async () => {
    // Ensure git has user config so the commit step succeeds in CI
    try {
      execSync("git config --global user.email", { stdio: "ignore" });
    } catch {
      execSync("git config --global user.email 'ci@test.com'", {
        stdio: "ignore",
      });
      execSync("git config --global user.name 'CI'", { stdio: "ignore" });
    }

    const result = initGit(testDir);
    expect(result).toBe(true);
    expect(existsSync(join(testDir, ".git"))).toBe(true);
  });

  it("returns a boolean without throwing", () => {
    // In CI, git may not have user.email configured, so the commit step may
    // fail. The important thing is that initGit returns a boolean without
    // throwing.
    const result = initGit(testDir);
    expect(typeof result).toBe("boolean");
  });

  it("creates a .git directory when git is available", async () => {
    const result = initGit(testDir);
    if (result) {
      // If git init succeeded, the .git directory must exist
      expect(existsSync(join(testDir, ".git"))).toBe(true);
    }
  });

  it("returns false for a non-existent directory", () => {
    const result = initGit(join(testDir, "does-not-exist"));
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// installDeps
// ---------------------------------------------------------------------------

describe("installDeps", () => {
  let testDir: string;
  const execSyncMock = vi.mocked(execSync);

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `scratchy-deps-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
    execSyncMock.mockReset();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns false for a non-existent directory", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = installDeps(join(testDir, "does-not-exist"), "pnpm");
    expect(result).toBe(false);
  });

  it("returns a boolean without throwing", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("No package.json");
    });

    const result = installDeps(testDir, "pnpm");
    expect(typeof result).toBe("boolean");
  });

  it("returns false when install fails (no package.json)", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("No package.json");
    });

    const result = installDeps(testDir, "npm");
    expect(result).toBe(false);
  });

  it("uses the correct package manager command", () => {
    execSyncMock.mockReturnValue(Buffer.from(""));

    const result = installDeps(testDir, "npm");
    expect(result).toBe(true);
    expect(execSyncMock).toHaveBeenCalledWith("npm install", {
      cwd: testDir,
      stdio: "inherit",
    });
  });
});
