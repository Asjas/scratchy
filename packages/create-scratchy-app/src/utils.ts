import { execSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";

/** Supported package managers. */
export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

/**
 * Detects which package manager invoked the create tool by inspecting
 * the `npm_config_user_agent` environment variable and the `_` env var.
 */
export function detectPackageManager(): PackageManager {
  const userAgent = process.env["npm_config_user_agent"] ?? "";

  if (userAgent.startsWith("pnpm")) return "pnpm";
  if (userAgent.startsWith("yarn")) return "yarn";
  if (userAgent.startsWith("bun")) return "bun";
  return "npm";
}

/**
 * Returns the install command for the given package manager.
 */
export function getInstallCommand(pm: PackageManager): string {
  if (pm === "pnpm") return "pnpm install";
  if (pm === "yarn") return "yarn";
  if (pm === "bun") return "bun install";
  return "npm install";
}

/**
 * Returns the dev-server run command for the given package manager.
 */
export function getRunCommand(pm: PackageManager, script: string): string {
  if (pm === "pnpm") return `pnpm ${script}`;
  if (pm === "yarn") return `yarn ${script}`;
  if (pm === "bun") return `bun run ${script}`;
  return `npm run ${script}`;
}

/**
 * Resolves the absolute project directory from the user-supplied name/path.
 */
export function resolveProjectDir(nameOrPath: string): string {
  return resolve(process.cwd(), nameOrPath);
}

/**
 * Returns the basename of the project directory as the default project name.
 */
export function defaultProjectName(projectDir: string): string {
  return basename(projectDir);
}

/**
 * Checks whether `dir` is either non-existent or empty (only contains
 * dotfiles that are safe to overwrite).
 */
export async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    const files = await readdir(dir);
    const meaningful = files.filter(
      (f) => f !== ".git" && f !== ".DS_Store" && f !== "Thumbs.db",
    );
    return meaningful.length === 0;
  } catch {
    // Dir does not exist — treat as empty.
    return true;
  }
}

/**
 * Copies the template directory into `destDir`, renaming special files:
 * - `_gitignore`  → `.gitignore`
 * - `_package.json` → `package.json`
 */
export async function copyTemplate(
  templateDir: string,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await cp(templateDir, destDir, { recursive: true });

  // Rename special template files that can't be named with their real names
  // (to prevent package-manager workspace glob matching and git ignoring them).
  const renames: [string, string][] = [
    [join(destDir, "_gitignore"), join(destDir, ".gitignore")],
    [join(destDir, "_package.json"), join(destDir, "package.json")],
  ];

  for (const [src, dst] of renames) {
    try {
      await stat(src);
      await rename(src, dst);
    } catch {
      // File doesn't exist — skip silently.
    }
  }
}

/**
 * Reads `filePath`, replaces all occurrences of `search` with `replacement`,
 * and writes the file back.
 */
export async function replaceInFile(
  filePath: string,
  search: string | RegExp,
  replacement: string,
): Promise<void> {
  try {
    const content = await readFile(filePath, "utf8");
    const updated = content.replaceAll(
      typeof search === "string" ? search : search,
      replacement,
    );
    if (updated !== content) {
      await writeFile(filePath, updated, "utf8");
    }
  } catch {
    // File doesn't exist — skip silently (optional template file).
  }
}

/**
 * Initialises a git repository in `dir`.
 * Returns `true` on success, `false` if git is not installed.
 */
export function initGit(dir: string): boolean {
  try {
    execSync("git init", { cwd: dir, stdio: "ignore" });
    execSync("git add -A", { cwd: dir, stdio: "ignore" });
    execSync('git commit -m "Initial commit from create-scratchy-app"', {
      cwd: dir,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs dependencies in `dir` using the specified package manager.
 * Returns `true` on success, `false` on failure.
 */
export function installDeps(dir: string, pm: PackageManager): boolean {
  try {
    const cmd = getInstallCommand(pm);
    execSync(cmd, { cwd: dir, stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}
